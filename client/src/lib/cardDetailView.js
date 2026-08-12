import { formatWon } from './format';

// 카드 상세 화면의 문구(#563).
//
// 문구를 컴포넌트 안에서 짓지 않는다. 한곳에 모여 있어야 회귀 테스트가 전수로
// 훑고, 같은 개념을 화면마다 다르게 부르는 일이 없다(#231 과 같은 이유).
//
// **내부 용어를 쓰지 않는다.** `payment_style` · `tier` · `min_spend` 는 코드의
// 이름이지 사용자의 말이 아니다.

// 이 혜택이 무엇을 대상으로 하는가.
//
// 분류와 가맹점이 **둘 다** 걸려 있으면 둘 다 맞아야 적용된다(계산기가 그렇게
// 판정한다). 그래서 문구도 «그리고» 로 잇는다 — 하나만 보여주면 사용자가 더
// 넓게 걸린다고 오해한다.
export function benefitTargetLabel(benefit) {
  if (!benefit) return '';
  const cat = benefit.categoryName || null;
  const merchant = benefit.merchantPattern || null;
  if (cat && merchant) return `${cat} 중 '${merchant}' 포함`;
  if (cat) return cat;
  // 조사를 붙이지 않는다. 가맹점 이름의 받침에 따라 «이/가» 가 갈리는데
  // 이름이 영문·숫자로 끝나기도 해서 규칙으로 못 정한다. 조사 없는 표현으로 쓴다.
  if (merchant) return `'${merchant}' 포함 가맹점`;
  return '전 가맹점';
}

// 얼마를 주는가. 요율과 한도를 한 줄로 붙인다.
export function benefitValueLabel(benefit) {
  if (!benefit) return '';
  const kind = benefit.benefitType === '할인' ? '할인' : '적립';
  const rate = benefit.rate === null || benefit.rate === undefined ? null : benefit.rate;
  const head = rate === null ? kind : `${rate}% ${kind}`;
  if (benefit.monthlyCap === null || benefit.monthlyCap === undefined) return head;
  return `${head} · 월 ${formatWon(benefit.monthlyCap)}까지`;
}

// 실적과 구간 상태를 두 줄로 말한다.
//
// headline 은 «지금 어떤 상태인가», detail 은 «그래서 뭘 하면 되나» 다.
// 다음 구간까지 남은 금액은 행동으로 이어지는 정보라 detail 에 둔다.
export function tierStatusLine(threshold) {
  if (!threshold) return { headline: '', detail: null };

  const tiers = Array.isArray(threshold.tiers) ? threshold.tiers : [];

  // 구간을 안 쓰는 카드. 예전 화면과 같은 말을 한다.
  if (tiers.length === 0) {
    if (threshold.met) return { headline: '실적 조건을 채웠어요', detail: null };
    return { headline: '실적이 모자라요', detail: null };
  }

  const tier = threshold.tier || null;

  if (!tier || !threshold.met) {
    const next = threshold.nextTier;
    return {
      headline: '이번 달은 혜택이 붙지 않아요',
      detail: next
        ? `${formatWon(next.min_spend)} 이상 쓰면 다음 달부터 혜택이 붙어요. ${formatWon(threshold.toNextTier || 0)} 남았어요.`
        : null,
    };
  }

  const name = tier.label || `${formatWon(tier.min_spend)} 이상`;
  // 요율이 비어 있는 구간은 «혜택마다 요율이 다르다» 는 뜻이다. 대표값을
  // 지어내면 일부에만 맞는 숫자를 말하게 된다.
  const rateText = tier.rate === null || tier.rate === undefined
    ? '요율은 혜택마다 달라요'
    : `요율 ${tier.rate}%`;

  const toNext = threshold.toNextTier || 0;
  return {
    headline: `지금 «${name}» 구간이에요 · ${rateText}`,
    detail: toNext > 0
      ? `다음 구간까지 ${formatWon(toNext)} 남았어요.`
      : '가장 높은 구간이에요.',
  };
}
