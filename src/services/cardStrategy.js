// 카드 혜택 추정(#276).
//
// 여러 혜택이 걸려도 합산하지 않고 가장 큰 것 하나만 쓴다. 합산은 거의 확실히
// 틀리고, 추정이 사용자에게 손해를 끼치는 방향으로 틀리면 안 된다.
'use strict';

const { BENEFIT_TYPES } = require('../constants.js');
const { benefitForTransaction } = require('./benefitRules.js');

function estimateBenefit({
  benefits,
  amount,
  categoryId,
  merchant,
  paymentStyle,
  activeTierId,
  thresholdMet,
  benefitUsedThisMonth,
}) {
  // 1. 후보 고르기
  let candidates = [];
  for (const b of benefits) {
    // 둘 다 설정돼 있으면 **둘 다** 맞아야 한다. 사용자가 카테고리와 가맹점을
    // 같이 적었다면 "그 가맹점에서 그 카테고리로 쓸 때" 라는 뜻이다. 하나만
    // 맞아도 준다고 보면 실제보다 많이 추정하게 되고, 추정이 사용자에게
    // 손해를 끼치는 방향으로 틀린다.
    // 카드사 상당수가 할부를 혜택 대상에서 뺀다(#563). 혜택이 결제방식을
    // 지정했으면 그것과 다른 결제는 아예 후보가 아니다 — 요율 비교에도 넣지
    // 않는다. 넣으면 "할부인데 일시불 혜택이 제일 크다" 가 골라진다.
    //
    // 지정이 없으면(NULL) 예전과 같이 결제방식을 가리지 않는다. 이미 들어가
    // 있는 혜택이 이 변경으로 달라지면 안 된다.
    const styleRule = b.payment_style || null;
    if (styleRule && styleRule !== paymentStyle) {
      candidates.push({ ...b, skipped: true, reason: 'payment-style-mismatch' });
      continue;
    }

    // 실적 구간에 걸린 혜택(#563). "40만원 미만 1% / 이상 2%" 처럼 같은 대상에
    // 요율만 다른 줄을 구간마다 하나씩 두고, **지난달 지출로 정해진 구간의 줄만**
    // 후보가 된다.
    //
    // 구간을 안 가리키는 혜택(NULL)은 예전 그대로 항상 후보다. 구간을 쓰지 않는
    // 카드가 이 변경으로 달라지면 안 된다.
    //
    // 활성 구간을 모를 때(activeTierId 가 없을 때)는 구간에 걸린 혜택을 전부 뺀다 —
    // 어느 구간인지 모르는 채로 아무 요율이나 집으면 높은 쪽이 골라져 과대추정이 된다.
    const tierRule = b.card_threshold_tier_id ?? null;
    if (tierRule !== null && tierRule !== activeTierId) {
      candidates.push({ ...b, skipped: true, reason: 'tier-mismatch' });
      continue;
    }

    const hasMerchantRule = Boolean(b.merchant_pattern);
    const hasCategoryRule = b.category_id !== null && b.category_id !== undefined;
    const merchantOk = !hasMerchantRule
      || (typeof merchant === 'string' && merchant.includes(b.merchant_pattern));
    const categoryOk = !hasCategoryRule || b.category_id === categoryId;

    let matched = null;
    if (merchantOk && categoryOk) {
      // 구체성은 "무엇으로 걸렸는가" 를 알리는 값이다. 동점일 때만 쓴다.
      matched = hasMerchantRule ? 'merchant' : (hasCategoryRule ? 'category' : 'all');
    }

    if (matched === null) {
      candidates.push({ ...b, skipped: true, reason: 'no-match' });
      continue;
    }

    // 2. 최소 결제액
    if (b.min_amount !== null && amount < b.min_amount) {
      candidates.push({ ...b, skipped: true, reason: 'below-min-amount' });
      continue;
    }

    candidates.push({ ...b, matched });
  }

  // 3. 하나만 고르기
  let best = null;
  let bestScore = -1;
  let bestBenefit = -1;

  // **예상 금액이 먼저다.** 구체성은 금액이 같을 때만 본다 — 가맹점 지정 0.5% 가
  // 카테고리 10% 를 이기면 사용자가 그만큼 손해를 본다.
  //
  // 비교 축이 요율이 아니라 금액인 이유(#564). 혜택 유형이 요율만 있는 게 아니다.
  // 정액과 요율을 한 목록에서 고르려면 **같은 단위**여야 하는데, 정액 3,000원과
  // 요율 0.7% 는 거래금액을 알아야 비교된다. 그래서 각 후보를 원 단위로 환산해
  // 비교한다. 요율만 있던 시절과 결과가 달라지지 않는다 — 같은 요율 안에서는
  // 금액 순서가 요율 순서와 같다.
  const specificity = (m) => (m === 'merchant' ? 3 : m === 'category' ? 2 : 1);

  for (const c of candidates) {
    if (c.skipped) continue;

    // 유형별 해석기가 원 단위로 환산한다(#564). 요율형이면 예전과 같은
    // `amount × rate / 100` 이고, 정액구간형이면 이 결제 몫이 없어 0 이다.
    const { benefit: est } = benefitForTransaction(c, { amount, categoryId, merchant });
    const spec = specificity(c.matched);

    if (best === null
        || est > bestBenefit
        || (est === bestBenefit && spec > bestScore)) {
      best = c;
      bestScore = spec;
      bestBenefit = est;
    }
  }

  // 4. 혜택 계산
  let benefit = 0;
  let capped = false;
  let skipped = [];

  if (best) {
    // 고를 때 이미 계산한 값을 다시 쓴다. 여기서 한 번 더 계산하면 두 곳이
    // 갈라질 수 있다 — 고른 근거와 보여주는 값이 달라진다.
    const calculatedBenefit = bestBenefit;
    const remainingCap = Math.max(0, (best.monthly_cap || Infinity) - benefitUsedThisMonth);
    benefit = Math.min(calculatedBenefit, remainingCap);

    if (calculatedBenefit > remainingCap) {
      capped = true;
    }

  }

  // **걸러진 이유를 전부 싣는다.** "왜 추천 안 됐는지" 가 결과의 일부다
  // (인수 기준). 고른 것만 남기고 나머지를 버리면 화면이 이유를 말할 수 없다.
  skipped = candidates
    .filter((c) => c !== best)
    .map((c) => ({ id: c.id, reason: c.skipped ? c.reason : 'lower-rate' }));

  const result = {
    benefit,
    applied: best ? { id: best.id, benefit_type: best.benefit_type, rate: best.rate, matched: best.matched } : null,
    skipped,
    capped,
  };

  // 실적 미달이면 혜택은 0 이다. 다만 **고른 혜택은 그대로 둔다** — 화면이
  // "이 카드는 이런 혜택이 있는데 실적이 모자라요" 를 말할 수 있어야 한다.
  // 첫 번째 혜택을 집으면 안 된다. 걸리지도 않는 혜택을 보여주게 된다.
  if (!thresholdMet) {
    result.benefit = 0;
    result.capped = false;
    result.thresholdUnmet = true;
  }

  return result;
}

module.exports = { estimateBenefit };
