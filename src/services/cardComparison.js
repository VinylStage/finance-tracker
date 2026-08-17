'use strict';

const { estimateBenefit } = require('./cardStrategy');

// 사후 분석 — 실제로 쓴 카드와 최적 카드의 차액(#276).
//
// ─────────────────────────────────────────────────────────────────────────
// 이 값이 무엇을 말하고 무엇을 말하지 않는가
//
// **"그때 이 카드를 썼으면 얼마 더 받았다" 를 말한다.** 그 이상은 말하지
// 않는다 — 사용자가 그 카드를 갖고 있었는지, 한도가 남아 있었는지, 실적을
// 채웠는지는 그 시점의 사정이고 우리는 지금 값으로만 계산한다.
//
// 그래서 이건 **"놓친 돈" 이 아니라 "지금 기준으로 다시 계산한 차이"** 다.
// 화면이 그렇게 말해야 한다.
//
// ─────────────────────────────────────────────────────────────────────────
// 카드가 하나면 하지 않는다
//
// 비교 대상이 없다. 억지로 "최적입니다" 라고 말하면 사용자는 선택지가 있는
// 줄 안다. 빈 결과를 돌려주고 화면이 그 이유를 말한다(인수 기준).
//
// ─────────────────────────────────────────────────────────────────────────
// 파생 거래를 뺀다
//
// 할부 이자·리볼빙 수수료는 카드 혜택 대상이 아니다(#268 의 origin 구분).
// 넣으면 "이 카드를 썼으면 이자에도 적립이 붙었다" 는 거짓이 된다.
// 호출부가 걸러 넘기는 것이 원칙이지만, 여기서도 한 번 막는다 — 두 곳에서
// 막아야 한 곳이 빠져도 거짓이 안 나온다.

// ─────────────────────────────────────────────────────────────────────────
// "카드를 안 썼다" 와 "어느 카드인지 모른다" 는 다르다
//
// 실측(2026-08-04): 거래 546건 중 **458건이 신용·체크 결제인데
// card_product_id 가 전부 NULL** 이다. 카드 상품 등록 화면(#302)이 아직
// 없어서다.
//
// 이 둘을 같게 보면 458건 전부가 "카드를 안 썼다" 가 되고, 최적 카드 혜택
// **전액이 '놓친 돈' 으로 잡힌다.** 사용자는 실제로 카드를 썼는데 앱이
// 수십만원을 놓쳤다고 말하는 상태가 된다.
//
// 그래서 세 가지를 나눈다.
//
//   card_product_id 있음         → 실제 혜택을 계산해 차액을 낸다
//   카드 결제수단인데 id 없음      → **차액 계산에서 뺀다.** 모르는 것은 모른다고 한다
//   현금·이체                    → 카드를 안 쓴 것이 맞다. 차액은 최적 카드 혜택 전액
//
// 두 번째는 unknownCard 로 세어 화면이 "카드 상품을 등록하면 N건을 더
// 분석할 수 있어요" 를 말할 수 있게 한다.

// 카드로 결제된 것으로 보는 결제수단 종류. constants 의 CARD_TYPES 와 같은
// 값이지만 이쪽은 payment_methods.type 이라 별도로 둔다.
const CARD_PAYMENT_TYPES = new Set(['신용', '체크']);

// 혜택 대상이 아닌 출처. constants 의 LOCKED_ORIGINS 와 겹치지만 뜻이 다르다 —
// 저쪽은 "화면에서 못 고친다", 이쪽은 "혜택 대상이 아니다".
const NON_ELIGIBLE_ORIGINS = new Set(['installment', 'revolving', 'debt_interest', 'debt_repayment']);

// 카드 결제인데 어느 상품인지 모르는가. 이걸 "카드 안 씀" 과 섞으면 차액이
// 부풀려진다.
function isUnknownCard(tx) {
  if (!tx) return false;
  if (tx.card_product_id !== null && tx.card_product_id !== undefined) return false;
  return CARD_PAYMENT_TYPES.has(tx.payment_method_type);
}

function isEligible(tx) {
  const origin = tx && tx.origin ? tx.origin : 'manual';
  return !NON_ELIGIBLE_ORIGINS.has(origin);
}

/**
 * 거래 목록을 카드별로 다시 계산해 실제 대비 최적의 차액을 낸다.
 *
 * @param {object} input
 * @param {Array} input.transactions  { id, amount, category_id, merchant, card_product_id, origin }
 * @param {Array} input.cards         { id, product_name, benefits: [...], thresholdMet }
 * @returns {{comparable: boolean, reason?: string, totalGap: number, byCard: Array, details: Array}}
 */
// 추천 후보인가. 더 안 쓰기로 한 카드(#410)는 "이걸 썼어야 한다" 로 권할 수
// 없다. is_active 가 없는 호출부(예전 테스트, 계산기 단독 사용)는 전부 후보로 본다.
function isCandidate(card) {
  return card.is_active === undefined || card.is_active === null || !!card.is_active;
}

function compareCards({ transactions, cards } = {}) {
  const list = Array.isArray(transactions) ? transactions : [];
  const cardList = Array.isArray(cards) ? cards : [];

  // **cards 는 두 가지로 쓰인다.**
  //   조회용   그 거래가 실제로 어느 카드로 얼마를 받았나  → 비활성도 있어야 한다
  //   후보용   그 거래를 어느 카드로 썼어야 했나           → 활성만
  // 하나로 뭉뚱그리면 둘 중 하나가 틀린다. 비활성을 빼면 그 카드로 결제한
  // 과거 거래가 "혜택 0" 으로 잡혀 차액이 부풀고, 넣으면 못 쓰는 카드를 권한다.
  const candidates = cardList.filter(isCandidate);

  // 비교는 고를 수 있는 카드가 둘 이상일 때만 성립한다.
  if (candidates.length < 2) {
    return { comparable: false, reason: 'single-card', totalGap: 0, byCard: [], details: [] };
  }
  const candidateIds = new Set(candidates.map((c) => c.id));

  const eligible = list.filter(isEligible);
  if (eligible.length === 0) {
    return { comparable: false, reason: 'no-eligible-transactions', totalGap: 0, byCard: [], details: [], unknownCard: 0 };
  }

  // 카드로 썼는데 어느 상품인지 모르는 건은 차액 계산에서 뺀다.
  const analyzable = eligible.filter((tx) => !isUnknownCard(tx));
  const unknownCard = eligible.length - analyzable.length;

  if (analyzable.length === 0) {
    return { comparable: false, reason: 'card-product-unknown', totalGap: 0, byCard: [], details: [], unknownCard };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 한도 누적을 두 벌로 나눠 든다(#637)
  //
  // 예전에는 한 벌(`used`)이었고 **실제로 쓴 카드만** 올렸다. 그 결정에는 이유가
  // 있었다 — 카드 A 가정과 카드 B 가정이 서로의 한도를 깎으면 계산이 뒤엉킨다.
  //
  // 그런데 그러면 **한 번도 안 쓴 카드는 한도가 영원히 열려 있다.** 「B카드로
  // 바꿨다면」 을 계산할 때 B 의 누적이 0 으로 고정되므로, 한 달에 여러 건이 있으면
  // 월 한도가 건마다 새로 열린다. 실측으로 **6배 과대추정**이 나왔다 —
  // 한 달 10만원 3건 · 적립 10% / 월 한도 5,000 인 카드에서 12,000 vs 정답 2,000.
  //
  // 갈라야 하는 것은 «가정끼리» 가 아니라 «어느 시나리오인가» 였다.
  //
  //   hypo    그 카드로 **적격 거래를 계속 썼다면** 그 카드가 받은 누적
  //           → 카드마다 독립이다. A 가정이 B 의 누적을 건드리지 않는다
  //   actual  **실제로 그 카드로 결제한** 거래에서 받은 누적
  //           → 실제 카드 쪽 계산에 쓴다. hypo 와 다르다(일부 거래만 그 카드였다)
  //
  // 그리고 둘 다 **달력월로 리셋한다.** 예전에는 창 개념이 없어 조회 기간 전체에
  // 한 번만 열렸다(`/comparison` 기본 기간은 최근 3개월이다). 월 경계를 달력월로
  // 두는 것은 전월 실적과 같은 기준이다(#398).
  const hypoUsed = new Map(cardList.map((c) => [c.id, new Map()]));
  const actualUsed = new Map(cardList.map((c) => [c.id, new Map()]));
  const gained = new Map(cardList.map((c) => [c.id, 0]));

  // 거래일에서 달력월을 꺼낸다. 'YYYY-MM-DD' 라 앞 7자다.
  const monthOf = (date) => String(date || '').slice(0, 7);
  const readUsed = (store, cardId, ym) => {
    const per = store.get(cardId);
    return per ? (per.get(ym) || 0) : 0;
  };
  const addUsed = (store, cardId, ym, delta) => {
    if (!delta) return;
    let per = store.get(cardId);
    if (!per) { per = new Map(); store.set(cardId, per); }
    per.set(ym, (per.get(ym) || 0) + delta);
  };

  let totalGap = 0;
  const details = [];

  for (const tx of analyzable) {
    const amount = Number(tx.amount) || 0;
    const ym = monthOf(tx.date);

    // 카드마다 이 거래를 계산한다. **그 카드의 가정 누적**을 넘긴다 — 한도가 작은
    // 카드가 실제보다 좋아 보이지 않게 하려면 이 값이 0 으로 고정돼선 안 된다.
    const perCard = cardList.map((card) => {
      const r = estimateBenefit({
        benefits: card.benefits || [],
        amount,
        categoryId: tx.category_id,
        merchant: tx.merchant,
        // 카드사 상당수가 할부를 혜택 대상에서 뺀다(#563). 혜택에 제약이
        // 없으면 예전과 같이 결제방식을 가리지 않는다.
        paymentStyle: tx.payment_style,
        // 이번 달에 적용되는 구간(#563). 지난달 지출이 어느 구간에 드는지로
        // 정해지고, 그 구간에 걸린 혜택만 후보가 된다.
        activeTierId: card.threshold && card.threshold.tier ? card.threshold.tier.id : null,
        thresholdMet: card.thresholdMet !== false,
        benefitUsedThisMonth: readUsed(hypoUsed, card.id, ym),
        // 그 구간의 카드 월 통합 한도(#578). 구간이 없으면 undefined 이고, 그때는
        // 옛 `card_benefits.monthly_cap` 컬럼으로 되돌아간다.
        tierMonthlyCap: card.threshold && card.threshold.tier ? card.threshold.tier.monthly_cap : null,
      });
      return { cardId: card.id, productName: card.product_name, ...r };
    });

    // 실제로 쓴 카드는 **비활성이어도 찾아야 한다.** 그 카드로 결제한 것은
    // 사실이고, 빼면 그 거래가 "혜택 0" 이 되어 차액이 부풀려진다.
    //
    // 다만 위 `perCard` 는 **가정 누적**으로 계산한 값이라 실제 카드의 값으로는 쓸 수
    // 없다. 실제 카드는 그 카드로 **실제 결제한 건들의 누적**을 봐야 하므로 따로 센다.
    // 두 누적이 다른 예: 세 건 중 한 건만 A 로 결제했다면 hypo 는 세 건, actual 은 한 건이다.
    const actualCard = tx.card_product_id === null || tx.card_product_id === undefined
      ? null
      : cardList.find((c) => c.id === tx.card_product_id) || null;
    const actual = actualCard
      ? {
        cardId: actualCard.id,
        productName: actualCard.product_name,
        ...estimateBenefit({
          benefits: actualCard.benefits || [],
          amount,
          categoryId: tx.category_id,
          merchant: tx.merchant,
          paymentStyle: tx.payment_style,
          activeTierId: actualCard.threshold && actualCard.threshold.tier ? actualCard.threshold.tier.id : null,
          thresholdMet: actualCard.thresholdMet !== false,
          benefitUsedThisMonth: readUsed(actualUsed, actualCard.id, ym),
          tierMonthlyCap: actualCard.threshold && actualCard.threshold.tier
            ? actualCard.threshold.tier.monthly_cap : null,
        }),
      }
      : null;

    // 반면 "썼어야 할 카드" 는 지금 고를 수 있는 것 중에서만 고른다.
    const bestPool = perCard.filter((p) => candidateIds.has(p.cardId));
    const best = bestPool.reduce((a, b) => (b.benefit > a.benefit ? b : a), bestPool[0]);

    // 누적을 두 벌 다 올린다.
    //
    // **가정은 카드마다 자기 시나리오에서만 오른다.** 「이 카드로 계속 썼다면」 이므로
    // 그 카드가 이 거래에서 받을 값을 그 카드의 누적에만 더한다 — A 가정이 B 의 누적을
    // 건드리지 않으므로 예전 주석이 걱정한 «가정끼리 뒤엉킴» 은 생기지 않는다.
    for (const p of perCard) addUsed(hypoUsed, p.cardId, ym, p.benefit);
    // 실제는 실제로 그 카드로 결제한 건에서만 오른다.
    if (actual) addUsed(actualUsed, actual.cardId, ym, actual.benefit);

    const actualBenefit = actual ? actual.benefit : 0;
    const gap = Math.max(0, best.benefit - actualBenefit);
    totalGap += gap;
    gained.set(best.cardId, (gained.get(best.cardId) || 0) + gap);

    details.push({
      transactionId: tx.id,
      merchant: tx.merchant,
      amount,
      // 실제 카드가 없는 거래(현금 등)도 있다. null 을 숨기지 않는다.
      actual: actual ? { cardId: actual.cardId, benefit: actual.benefit } : null,
      best: { cardId: best.cardId, productName: best.productName, benefit: best.benefit },
      gap,
    });
  }

  const byCard = cardList
    .map((c) => ({ cardId: c.id, productName: c.product_name, gapIfUsed: gained.get(c.id) || 0 }))
    .filter((c) => c.gapIfUsed > 0)
    .sort((a, b) => b.gapIfUsed - a.gapIfUsed);

  return { comparable: true, totalGap, byCard, details, unknownCard };
}

module.exports = { compareCards, isEligible, isUnknownCard, NON_ELIGIBLE_ORIGINS, CARD_PAYMENT_TYPES };
