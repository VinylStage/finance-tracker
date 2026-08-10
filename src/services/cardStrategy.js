// 카드 혜택 추정(#276).
//
// 여러 혜택이 걸려도 합산하지 않고 가장 큰 것 하나만 쓴다. 합산은 거의 확실히
// 틀리고, 추정이 사용자에게 손해를 끼치는 방향으로 틀리면 안 된다.
'use strict';

const { BENEFIT_TYPES } = require('../constants.js');

function estimateBenefit({
  benefits,
  amount,
  categoryId,
  merchant,
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

  // **요율이 먼저다.** 구체성은 요율이 같을 때만 본다 — 가맹점 지정 0.5% 가
  // 카테고리 10% 를 이기면 사용자가 그만큼 손해를 본다.
  const specificity = (m) => (m === 'merchant' ? 3 : m === 'category' ? 2 : 1);

  for (const c of candidates) {
    if (c.skipped) continue;

    const rate = Number(c.rate) || 0;
    const spec = specificity(c.matched);

    if (best === null
        || rate > Number(best.rate)
        || (rate === Number(best.rate) && spec > bestScore)) {
      best = c;
      bestScore = spec;
    }
  }

  // 4. 혜택 계산
  let benefit = 0;
  let capped = false;
  let skipped = [];

  if (best) {
    const calculatedBenefit = Math.floor(amount * best.rate / 100);
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
