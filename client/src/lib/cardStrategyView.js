import { formatWon } from './format';

// 카드 전략 화면의 표시 모델(#277).
//
// ─────────────────────────────────────────────────────────────────────────
// 이 파일이 존재하는 이유는 문구다
//
// #276 이 돌려주는 값은 **전제가 붙은 추정**이다. 화면이 그 전제를 지우면
// 사용자가 손해를 본다 — "3,280원 절약했어요" 는 그때 그 카드를 갖고 있었고
// 실적을 채웠고 한도가 남았다는 세 가지를 전부 참으로 만들어 버린다.
//
// 그래서 문구를 컴포넌트에 흩지 않고 여기 모은다. 한곳에 모여 있어야
// 회귀 테스트가 전수로 훑을 수 있다(#231 방식).
//
// ─────────────────────────────────────────────────────────────────────────
// 상태를 문자열로 내보내는 이유
//
// 컴포넌트가 `data.length === 0 && !loading && ...` 같은 조건을 겹쳐 쓰기
// 시작하면 어느 상태가 빠졌는지 아무도 모른다. 상태를 하나의 값으로 만들고
// 테스트가 그 값을 하나씩 세운다.

// 몇 건부터 참고할 만한가. 근거는 통계가 아니라 **변동성**이다 — 몇 건뿐이면
// 큰 결제 한 건이 결과를 뒤집는다. 이 숫자는 화면 문구에 그대로 나가므로
// 사용자가 판단을 조정할 수 있다.
export const MIN_MEANINGFUL_TX = 10;

// 추천에서 걸러진 이유를 사용자 말로 옮긴다. 내부 값(no-match 등)을 그대로
// 보여주면 사용자는 코드를 읽어야 한다(VOICE_TONE_GUIDE 금지 표현).
const SKIP_REASONS = {
  'no-match': '이 카테고리·가맹점에는 해당하는 혜택이 없어요.',
  'below-min-amount': '건당 최소 결제액에 못 미쳐요.',
  'lower-rate': '다른 혜택보다 적립률이 낮아요.',
};

export function skipReasonText(reason) {
  return SKIP_REASONS[reason] || '적용 조건에 맞지 않아요.';
}

/**
 * 사후 분석 응답을 화면 상태로 옮긴다.
 *
 * @returns {{state: string, headline?: string, notices: string[]}}
 */
export function comparisonView({ loading, error, data } = {}) {
  if (loading) return { state: 'loading', notices: [] };

  // 내부 오류를 그대로 내보내지 않는다(#231). 사전에 있는 문구를 쓴다.
  if (error) {
    return {
      state: 'error',
      headline: '처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.',
      notices: [],
    };
  }

  if (!data) return { state: 'loading', notices: [] };

  const notices = buildNotices(data);

  if (data.comparable === false) {
    return { state: emptyStateFor(data), headline: emptyHeadlineFor(data), notices };
  }

  const details = data.details || [];
  if (details.length === 0) {
    return { state: 'no-transactions', headline: emptyHeadlineFor(data), notices };
  }

  return {
    state: 'ok',
    headline: headlineFor(data),
    notices,
    byCard: (data.byCard || []).map((c) => ({
      ...c,
      // 카드별 줄도 같은 전제를 달고 다녀야 한다. 합계에만 붙이면 카드별
      // 목록만 보고 판단하는 사용자가 전제를 놓친다.
      text: `${c.productName}였다면 ${formatWon(c.gapIfUsed)} 더 받았어요.`,
    })),
  };
}

function emptyStateFor(data) {
  if (data.reason === 'single-card') return 'single-card';
  if (data.reason === 'card-product-unknown') return 'unknown-cards';
  return 'no-transactions';
}

function emptyHeadlineFor(data) {
  switch (data.reason) {
    case 'single-card':
      // 억지 추천을 만들지 않는다. 비교 대상이 없는 것과 비교해서 이긴 것은
      // 전혀 다른 말이다.
      return '등록된 카드가 1장이라 비교할 대상이 없어요. 카드를 하나 더 등록하면 어느 쪽이 유리한지 계산해요.';
    case 'card-product-unknown':
      return '카드로 결제한 내역은 있는데 어느 카드인지 몰라 비교하지 못했어요. 설정에서 카드를 등록하면 함께 분석해요.';
    default:
      return '이 기간에는 비교할 카드 결제가 없어요.';
  }
}

function headlineFor(data) {
  if (!data.totalGap) {
    // 0원을 "차액 없음" 으로만 쓰면 사용자는 자기가 최적으로 썼다고 읽는다.
    // 무엇을 기준으로 0인지 밝힌다.
    return '등록한 카드 기준으로는 더 받을 수 있었던 금액이 없어요.';
  }
  const top = (data.byCard || [])[0];
  if (!top) return `다른 카드였다면 ${formatWon(data.totalGap)} 더 받았어요.`;
  return `${top.productName}로 결제했다면 ${formatWon(data.totalGap)} 더 받았어요.`;
}

// 결과와 **함께** 붙는 단서들. 상태를 가리지 않고 옆에 선다 — 결과가 있는데
// 전제가 없으면 그 결과는 단정이 된다.
function buildNotices(data) {
  const notices = [];

  if (data.thresholdEstimated) {
    notices.push(
      '전월 실적을 채웠다고 가정한 값이에요. 카드사가 실적에서 빼는 항목(세금·공과금·상품권 등)은 반영하지 않았어요.',
    );
  }

  if (data.unknownCard > 0) {
    notices.push(
      `카드로 결제한 ${data.unknownCard}건은 어느 카드인지 몰라 계산에서 뺐어요. 설정에서 카드를 등록하면 함께 분석해요.`,
    );
  }

  const count = (data.details || []).length;
  if (count > 0 && count < MIN_MEANINGFUL_TX) {
    notices.push(
      `비교한 결제가 ${count}건이라 큰 결제 한 건에 결과가 흔들려요. ${MIN_MEANINGFUL_TX}건부터 참고할 만해요.`,
    );
  }

  notices.push('지난 결제를 지금 카드 정보로 다시 계산한 값이에요. 그때 그 카드를 갖고 있었는지는 계산에 없어요.');

  return notices;
}

/**
 * 추천 한 줄의 근거. "왜 이 카드인지" 와 "왜 저 카드는 아닌지" 를 같이 낸다.
 */
export function estimateReason(card) {
  if (!card) return '';

  if (card.thresholdUnmet) {
    const rate = card.applied ? `적립률 ${card.applied.rate}% 혜택이 있는데 ` : '';
    // 실적 미달은 사용자가 행동할 수 있는 정보다. 얼마가 모자란지까지 준다.
    return `${rate}전월 실적을 못 채웠어요.`;
  }

  if (!card.applied) {
    const first = (card.skipped || [])[0];
    return first ? skipReasonText(first.reason) : '해당하는 혜택이 없어요.';
  }

  const parts = [`적립률 ${card.applied.rate}%`];
  if (card.applied.matched === 'merchant') parts.push('가맹점 지정 혜택');
  else if (card.applied.matched === 'category') parts.push('카테고리 혜택');
  if (card.capped) parts.push('월 한도까지만 계산');

  return `${parts.join(' · ')} → ${formatWon(card.benefit)}`;
}

/**
 * 실적 상태 한 줄. 색으로만 구분하지 않도록 라벨을 함께 낸다(#191).
 */
export function thresholdLine(threshold) {
  if (!threshold) return null;
  if (threshold.threshold === null) {
    return { label: '실적 조건 없음', tone: 'neutral', text: '전월 실적 조건이 없는 카드예요.' };
  }
  if (threshold.met) {
    return {
      label: '실적 충족',
      tone: 'ok',
      text: `${periodText(threshold.period)}에 ${formatWon(threshold.spend)} 써서 조건 ${formatWon(threshold.threshold)}을 넘었어요.`,
    };
  }
  return {
    label: '실적 미달',
    tone: 'warn',
    text: `${periodText(threshold.period)}에 ${formatWon(threshold.spend)} 썼어요. 조건까지 ${formatWon(threshold.shortfall)} 남았어요.`,
  };
}

export function periodText(period) {
  if (!period) return '전월';
  // 마감일을 모르면 달력 월로 계산했다는 사실을 문구에 남긴다. 그래야
  // 사용자가 "왜 내 카드 마감일과 다르지" 를 물을 수 있다.
  const suffix = period.resolved ? '' : ' (마감일 미설정이라 달력 월로 계산)';
  return `${period.start} ~ ${period.end}${suffix}`;
}
