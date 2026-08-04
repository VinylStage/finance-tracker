import { describe, it, expect } from 'vitest';
import {
  comparisonView, estimateReason, thresholdLine, periodText,
  skipReasonText, MIN_MEANINGFUL_TX,
} from './cardStrategyView';

// 카드 전략 화면의 표시 모델(#277).
//
// **이 이슈의 난이도는 계산이 아니라 문구다.** 그래서 이 파일은 두 가지를 본다.
//
//   1. 상태가 다섯 개 다 있는가 (미등록·1장·거래부족·매핑실패·계산실패)
//   2. 문구가 추정을 단정으로 바꾸지 않는가
//
// 2번은 마지막 describe 에서 전수로 훑는다(#231 회귀 테스트 방식).

const ok = (over = {}) => ({
  comparable: true,
  totalGap: 3280,
  byCard: [{ cardId: 2, productName: 'B카드', gapIfUsed: 3280 }],
  details: Array.from({ length: 20 }, (_, i) => ({ transactionId: i, gap: 164 })),
  unknownCard: 0,
  thresholdEstimated: false,
  period: { from: '2026-05-04', to: '2026-08-04' },
  ...over,
});

describe('A. 다섯 가지 상태가 다 있다', () => {
  it('A-1. 불러오는 중', () => {
    expect(comparisonView({ loading: true }).state).toBe('loading');
    // data 가 아직 안 온 것도 로딩이다. 빈 상태로 깜빡이면 안 된다.
    expect(comparisonView({}).state).toBe('loading');
  });

  it('A-2. 계산 실패는 내부 오류를 노출하지 않는다', () => {
    const v = comparisonView({ error: new Error('SQLITE_ERROR: no such column: foo') });

    expect(v.state).toBe('error');
    expect(v.headline).not.toContain('SQLITE');
    expect(v.headline).not.toContain('column');
    expect(v.headline).toBe('처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.');
  });

  it('A-3. 카드 1장이면 억지 추천을 만들지 않는다', () => {
    const v = comparisonView({ data: { comparable: false, reason: 'single-card' } });

    expect(v.state).toBe('single-card');
    expect(v.headline).toContain('비교할 대상이 없어요');
    // "이 카드가 최적입니다" 류가 나오면 사용자는 선택지가 있는 줄 안다.
    expect(v.headline).not.toContain('최적');
  });

  it('A-4. 카드는 썼는데 어느 카드인지 모르면 그렇게 말한다', () => {
    const v = comparisonView({ data: { comparable: false, reason: 'card-product-unknown', unknownCard: 458 } });

    expect(v.state).toBe('unknown-cards');
    expect(v.headline).toContain('어느 카드인지 몰라');
    // 다음 행동을 준다(VOICE_TONE_GUIDE 원칙 3).
    expect(v.headline).toContain('등록하면');
  });

  it('A-5. 거래가 없으면 기간을 밝힌다', () => {
    const v = comparisonView({ data: { comparable: false, reason: 'no-eligible-transactions' } });
    expect(v.state).toBe('no-transactions');
    expect(v.headline).toContain('이 기간');
  });
});

describe('B. 전제를 지우지 않는다', () => {
  it('B-1. 실적 추정이면 그 전제를 붙인다', () => {
    const v = comparisonView({ data: ok({ thresholdEstimated: true }) });
    const joined = v.notices.join(' ');

    expect(joined).toContain('가정한 값');
    expect(joined).toContain('세금');
  });

  it('B-2. 결과가 있어도 "다시 계산한 값" 이라는 단서는 항상 붙는다', () => {
    // 그때 그 카드를 갖고 있었는지, 한도가 남았는지는 계산에 없다.
    const v = comparisonView({ data: ok() });
    expect(v.notices.join(' ')).toContain('그때 그 카드를 갖고 있었는지는 계산에 없어요');
  });

  it('B-3. 모르는 건수를 숨기지 않는다', () => {
    const v = comparisonView({ data: ok({ unknownCard: 458 }) });
    expect(v.notices.join(' ')).toContain('458건');
  });

  it('B-4. 표본이 적으면 몇 건부터 의미 있는지 밝힌다', () => {
    const v = comparisonView({ data: ok({ details: [{ gap: 1 }, { gap: 2 }] }) });
    const joined = v.notices.join(' ');

    expect(joined).toContain('2건');
    expect(joined).toContain(`${MIN_MEANINGFUL_TX}건`);
  });

  it('B-5. 표본이 충분하면 그 단서는 안 붙는다', () => {
    // 늘 붙는 경고는 아무도 안 읽는다.
    const v = comparisonView({ data: ok() });
    expect(v.notices.join(' ')).not.toContain('흔들려요');
  });
});

describe('C. 금액과 근거', () => {
  it('C-1. 차액이 있으면 어느 카드였는지 함께 말한다', () => {
    const v = comparisonView({ data: ok() });

    expect(v.state).toBe('ok');
    expect(v.headline).toBe('B카드로 결제했다면 3,280원 더 받았어요.');
  });

  it('C-2. 차액 0 을 "최적" 으로 바꾸지 않는다', () => {
    // 등록한 카드가 전부가 아니다. 0 은 "내가 아는 범위에서 0" 이다.
    const v = comparisonView({ data: ok({ totalGap: 0, byCard: [] }) });

    expect(v.headline).toContain('등록한 카드 기준');
    expect(v.headline).not.toContain('최적');
    expect(v.headline).not.toContain('잘하고');
  });

  it('C-3. 카드별 줄도 전제를 달고 다닌다', () => {
    const v = comparisonView({ data: ok() });
    expect(v.byCard[0].text).toBe('B카드였다면 3,280원 더 받았어요.');
  });

  it('C-4. 금액은 천단위로 끊는다', () => {
    const v = comparisonView({ data: ok({ totalGap: 1234567, byCard: [{ productName: 'B카드', gapIfUsed: 1234567 }] }) });
    expect(v.headline).toContain('1,234,567원');
  });
});

describe('D. 추천 근거', () => {
  it('D-1. 왜 이 카드인지 말한다', () => {
    const r = estimateReason({ benefit: 500, applied: { rate: 5, matched: 'category' }, skipped: [] });

    expect(r).toContain('5%');
    expect(r).toContain('카테고리');
    expect(r).toContain('500원');
  });

  it('D-2. 실적 미달은 혜택률과 함께 말한다', () => {
    // "실적 미달" 은 사용자가 행동할 수 있는 정보다. 감추면 안 된다.
    const r = estimateReason({ benefit: 0, thresholdUnmet: true, applied: { rate: 20 } });

    expect(r).toContain('20%');
    expect(r).toContain('실적을 못 채웠어요');
  });

  it('D-3. 한도에 걸리면 그 사실을 말한다', () => {
    const r = estimateReason({ benefit: 1000, capped: true, applied: { rate: 10, matched: 'all' } });
    expect(r).toContain('월 한도');
  });

  it('D-4. 걸러진 이유를 내부 값으로 보여주지 않는다', () => {
    const r = estimateReason({ benefit: 0, applied: null, skipped: [{ reason: 'below-min-amount' }] });

    expect(r).toContain('최소 결제액');
    expect(r).not.toContain('below-min-amount');
  });

  it('D-5. 모르는 사유도 사용자 말로 떨어진다', () => {
    expect(skipReasonText('something-new')).not.toContain('something-new');
    expect(skipReasonText(undefined)).toMatch(/[가-힣]/);
  });
});

describe('E. 실적 표시는 색에만 기대지 않는다', () => {
  const period = { start: '2026-07-01', end: '2026-07-31' };

  it('E-1. 충족·미달·조건없음에 각각 글자 라벨이 있다', () => {
    // #191 — 색상 단독 인코딩 금지.
    const met = thresholdLine({ threshold: 300000, spend: 400000, met: true, shortfall: 0, period });
    const unmet = thresholdLine({ threshold: 300000, spend: 288893, met: false, shortfall: 11107, period });
    const none = thresholdLine({ threshold: null, spend: 0, met: true, shortfall: 0, period });

    expect(met.label).toBe('실적 충족');
    expect(unmet.label).toBe('실적 미달');
    expect(none.label).toBe('실적 조건 없음');
    for (const line of [met, unmet, none]) expect(line.label).toMatch(/[가-힣]/);
  });

  it('E-2. 미달이면 얼마 남았는지 준다', () => {
    const unmet = thresholdLine({ threshold: 300000, spend: 288893, met: false, shortfall: 11107, period });

    expect(unmet.text).toContain('288,893원');
    expect(unmet.text).toContain('11,107원 남았어요');
  });

  it('E-3. 구간은 날짜만 말한다', () => {
    // 마감일은 실적과 무관하다. "마감일을 설정하면 정확해집니다" 같은 안내를
    // 붙이면 사용자를 틀린 방향으로 보낸다(#398).
    expect(periodText(period)).toBe('2026-07-01 ~ 2026-07-31');
  });

  it('E-4. 마감일 값이 섞여 들어와도 문구가 안 흔들린다', () => {
    expect(periodText({ ...period, resolved: false, statement_close_day: 11 }))
      .toBe('2026-07-01 ~ 2026-07-31');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// #231 회귀 테스트 방식 — 문구를 전수로 훑는다.
//
// 개별 문구를 하나씩 검사하면 새 문구가 추가될 때 검사가 따라가지 못한다.
// 파일에서 한글 문자열을 전부 뽑아 금지 표현을 건다.
describe('F. 문구 전수 검사', () => {
  // 소스를 정규식으로 긁지 않는다. 이 화면의 문구는 값이 끼어드는 템플릿이라
  // **실제로 불러서 나온 문자열**을 봐야 사용자가 보는 것과 같아진다.
  // (#231 은 정적 문자열이라 소스를 긁는 게 맞았다. 여기는 사정이 다르다.)
  const strings = [];
  const collect = (v) => {
    if (typeof v === 'string' && /[가-힣]/.test(v)) strings.push(v);
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === 'object') Object.values(v).forEach(collect);
  };

  const period = { start: '2026-07-01', end: '2026-07-31' };

  // 상태를 하나도 빼지 않고 다 돌린다.
  collect(comparisonView({ loading: true }));
  collect(comparisonView({ error: new Error('boom') }));
  collect(comparisonView({ data: ok() }));
  collect(comparisonView({ data: ok({ totalGap: 0, byCard: [] }) }));
  collect(comparisonView({ data: ok({ unknownCard: 458, thresholdEstimated: true }) }));
  collect(comparisonView({ data: ok({ details: [{ gap: 1 }] }) }));
  for (const reason of ['single-card', 'card-product-unknown', 'no-eligible-transactions']) {
    collect(comparisonView({ data: { comparable: false, reason, unknownCard: 3 } }));
  }

  collect(estimateReason({ benefit: 500, applied: { rate: 5, matched: 'category' }, skipped: [] }));
  collect(estimateReason({ benefit: 500, applied: { rate: 5, matched: 'merchant' }, capped: true }));
  collect(estimateReason({ benefit: 0, thresholdUnmet: true, applied: { rate: 20 } }));
  collect(estimateReason({ benefit: 0, applied: null, skipped: [] }));
  for (const r of ['no-match', 'below-min-amount', 'lower-rate', 'unknown-future-reason']) {
    collect(skipReasonText(r));
  }

  collect(thresholdLine({ threshold: 300000, spend: 400000, met: true, shortfall: 0, period }));
  collect(thresholdLine({ threshold: 300000, spend: 288893, met: false, shortfall: 11107, period }));
  collect(thresholdLine({ threshold: null, spend: 0, met: true, shortfall: 0, period }));
  collect(periodText(period));

  it('F-0. 검사 대상이 실제로 잡힌다', () => {
    // 코퍼스가 비면 위반도 0 이라 조용히 통과한다. 그걸 막는다.
    expect(strings.length).toBeGreaterThanOrEqual(25);
  });

  it('F-1. 공문서 말투와 겁주기가 없다', () => {
    for (const s of strings) {
      expect(s, s).not.toMatch(/하십시오|하시기 바랍니다|정말로|진짜로/);
    }
  });

  it('F-2. 홍보성 표현이 없다', () => {
    // VOICE_TONE_GUIDE 원칙 5 — 숫자 판단을 대신하려 들지 않는다.
    for (const s of strings) {
      expect(s, s).not.toMatch(/스마트|숨은 혜택|절약하세요|알뜰|무려|놓친 돈|꿀팁|최적의/);
    }
  });

  it('F-3. 금액에 감탄사나 이모지를 붙이지 않는다', () => {
    for (const s of strings) {
      expect(s, s).not.toMatch(/[!]|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    }
  });

  it('F-4. 한국어 AI 상투구가 없다', () => {
    for (const s of strings) {
      expect(s, s).not.toMatch(/것이 중요합니다|라고 할 수 있습니다|단순히 .*아니라/);
    }
  });

  it('F-5. 내부 필드명이 새지 않는다', () => {
    for (const s of strings) {
      expect(s, s).not.toMatch(/card_product_id|totalGap|byCard|thresholdMet|unknownCard|no-match|below-min-amount/);
    }
  });

  it('F-6. 영문 잔여가 없다', () => {
    for (const s of strings) {
      expect(s, s).not.toMatch(/Loading|Error|N\/A|undefined|null/);
    }
  });
});
