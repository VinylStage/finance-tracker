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

  // 월 한도는 카드마다 누적된다. 거래를 순서대로 훑으며 각 카드가 이미 받은
  // 혜택을 들고 간다 — 안 그러면 한도가 있는 혜택이 매 거래마다 새로 열린다.
  const used = new Map(cardList.map((c) => [c.id, 0]));
  const gained = new Map(cardList.map((c) => [c.id, 0]));

  let totalGap = 0;
  const details = [];

  for (const tx of analyzable) {
    const amount = Number(tx.amount) || 0;

    // 카드마다 이 거래를 계산한다. 한도 누적은 **가정 계산에도** 반영한다 —
    // 안 그러면 한도가 작은 카드가 실제보다 좋아 보인다.
    const perCard = cardList.map((card) => {
      const r = estimateBenefit({
        benefits: card.benefits || [],
        amount,
        categoryId: tx.category_id,
        merchant: tx.merchant,
        thresholdMet: card.thresholdMet !== false,
        benefitUsedThisMonth: used.get(card.id) || 0,
      });
      return { cardId: card.id, productName: card.product_name, ...r };
    });

    // 실제로 쓴 카드는 **비활성이어도 찾아야 한다.** 그 카드로 결제한 것은
    // 사실이고, 빼면 그 거래가 "혜택 0" 이 되어 차액이 부풀려진다.
    const actual = perCard.find((p) => p.cardId === tx.card_product_id) || null;
    // 반면 "썼어야 할 카드" 는 지금 고를 수 있는 것 중에서만 고른다.
    const bestPool = perCard.filter((p) => candidateIds.has(p.cardId));
    const best = bestPool.reduce((a, b) => (b.benefit > a.benefit ? b : a), bestPool[0]);

    // 실제로 쓴 카드만 한도를 소진한다. 가정은 소진시키지 않는다 —
    // 가정끼리 서로의 한도를 깎으면 계산이 뒤엉킨다.
    if (actual) used.set(actual.cardId, (used.get(actual.cardId) || 0) + actual.benefit);

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
