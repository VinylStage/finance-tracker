// 카드 혜택 추정(#276).
//
// 여러 혜택이 걸려도 합산하지 않고 가장 큰 것 하나만 쓴다. 합산은 거의 확실히
// 틀리고, 추정이 사용자에게 손해를 끼치는 방향으로 틀리면 안 된다.
'use strict';

const { BENEFIT_TYPES } = require('../constants.js');
const { benefitForTransaction, capsOf, applyItemCaps } = require('./benefitRules.js');

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

function estimateBenefit({
  benefits,
  amount,
  categoryId,
  merchant,
  paymentStyle,
  activeTierId,
  thresholdMet,
  benefitUsedThisMonth,
  // 이번 달에 적용되는 실적 구간의 카드 월 통합 한도(#578). 없으면 옛
  // `card_benefits.monthly_cap` 컬럼으로 되돌아간다.
  tierMonthlyCap,
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
  // 어느 층에 잘렸나(#578). `item-transaction` · `item-day` · `item-month` ·
  // `card-monthly` · null. 통합 한도가 걸리면 그쪽이 이긴다 — 마지막에 잘린 층이다.
  let cappedBy = null;
  // 선언은 있는데 누적을 몰라 **적용하지 못한** 창(#631). 화면이 «아직 반영 못 한다»
  // 를 말할 수 있어야 한다. 조용히 비우면 사용자는 한도가 걸린 줄 안다.
  let unappliedCapWindows = [];
  let skipped = [];

  if (best) {
    // 고를 때 이미 계산한 값을 다시 쓴다. 여기서 한 번 더 계산하면 두 곳이
    // 갈라질 수 있다 — 고른 근거와 보여주는 값이 달라진다.
    const calculatedBenefit = bestBenefit;

    // ── 한도를 두 층으로 자른다(#578). **순서가 결과를 바꾼다.**
    //
    // 항목 한도가 통합보다 큰 카드에서 «항목 → 통합» 과 그 반대가 다른 값을 낸다.
    // 약관이 «항목별로 이만큼까지, 그리고 카드 전체로 이만큼까지» 라고 읽히므로
    // **항목을 먼저 자르고 통합으로 한 번 더 자른다.** 이 순서를 뒤집지 않는다.
    //
    // 1층: 항목별 한도 — `rule_json.caps[]`
    //
    // `month` 창에 넘기는 누적이 `benefitUsedThisMonth` 다. 이 값은 **카드 단위**
    // 누적이라 항목 단위로는 과하게 잡힌다(같은 카드의 다른 항목이 쓴 몫까지 뺀다).
    // 항목별 누적을 알려면 «어느 거래에 어느 혜택이 붙었나» 가 남아 있어야 하는데
    // 이 저장소는 그것을 저장하지 않는다(#631). 과하게 자르는 쪽이 과대추정보다
    // 덜 해롭다 — 다른 카드에서 과대적립을 되돌린 것과 같은 기준이다.
    // 옛 `card_benefits.monthly_cap` 컬럼도 **항목 한도로 읽는다.**
    //
    // 이게 없으면 구간에 통합 한도가 생기는 순간 그 컬럼이 아래 폴백 자리에서
    // 밀려나 **그 줄의 한도가 계산에서 아예 사라진다.** 나라사랑카드의 Easy 줄
    // 6개가 정확히 그 모양이다 — 실적과 무관한 줄이라 구간을 안 가리키면서 각자
    // 개별 한도(3,000 · 5,000 · 50,000 · 100,000)를 이 컬럼에 갖고 있다. 요율
    // 20% / 한도 3,000 인 줄이면 5만원 결제에서 3,000 이 10,000 으로 부푼다.
    //
    // 선언(`caps`)에 `month` 창이 있으면 그것이 정본이다. 컬럼은 선언이 없을 때만 쓴다.
    //
    // 아래 통합 폴백과 겹쳐 같은 값으로 두 번 자르는 카드가 생기는데, 두 자르기가
    // 모두 `min` 이라 결과가 달라지지 않는다(#578 에서 48개 조합으로 확인).
    const itemCaps = capsOf(best);
    if (best.monthly_cap !== null && best.monthly_cap !== undefined
        && !itemCaps.some((c) => c.window === 'month')) {
      itemCaps.push({ window: 'month', amount: toInt(best.monthly_cap) });
    }

    const itemCut = applyItemCaps(calculatedBenefit, itemCaps, {
      month: benefitUsedThisMonth,
    });

    // 2층: 카드 월 통합 한도 — 실적 구간의 값이 정본이고, 없으면 옛
    // `card_benefits.monthly_cap` 컬럼으로 되돌아간다.
    //
    // **되돌리는 이유**: 지금 등록된 카드는 그 컬럼에 통합 한도를 넣어 우회하고
    // 있다(나라사랑카드). 컬럼을 무시하면 그 카드들의 한도가 사라진다. 구간 값이
    // 들어오면 그때부터 구간이 이긴다.
    const unifiedCap = tierMonthlyCap !== undefined && tierMonthlyCap !== null
      ? toInt(tierMonthlyCap)
      : (best.monthly_cap === undefined || best.monthly_cap === null
        ? null
        : toInt(best.monthly_cap));

    let afterUnified = itemCut.benefit;
    let unifiedCapped = false;
    if (unifiedCap !== null) {
      const remaining = Math.max(0, unifiedCap - benefitUsedThisMonth);
      if (afterUnified > remaining) {
        afterUnified = remaining;
        unifiedCapped = true;
      }
    }

    benefit = afterUnified;
    // 예전 계약을 지킨다 — `capped` 는 «어느 한도든 걸렸다» 다. 어느 쪽에 잘렸는지는
    // `cappedBy` 로 따로 싣는다. 화면이 그 둘을 구분해 말해야 하기 때문이다.
    capped = calculatedBenefit > benefit;
    cappedBy = unifiedCapped ? 'card-monthly' : (itemCut.cappedBy ? `item-${itemCut.cappedBy}` : null);
    unappliedCapWindows = itemCut.unapplied;
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
    cappedBy,
    unappliedCapWindows,
  };

  // 실적 미달이면 혜택은 0 이다. 다만 **고른 혜택은 그대로 둔다** — 화면이
  // "이 카드는 이런 혜택이 있는데 실적이 모자라요" 를 말할 수 있어야 한다.
  // 첫 번째 혜택을 집으면 안 된다. 걸리지도 않는 혜택을 보여주게 된다.
  if (!thresholdMet) {
    result.benefit = 0;
    result.capped = false;
    // 한도에 잘린 것이 아니라 실적이 모자란 것이다. `cappedBy` 를 남겨 두면 화면이
    // «월 한도를 다 썼어요» 라고 잘못 말한다 — 사유가 둘 다 서 있으면 안 된다.
    result.cappedBy = null;
    result.thresholdUnmet = true;
  }

  return result;
}

module.exports = { estimateBenefit };
