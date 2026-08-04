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

// 혜택 대상이 아닌 출처. constants 의 LOCKED_ORIGINS 와 겹치지만 뜻이 다르다 —
// 저쪽은 "화면에서 못 고친다", 이쪽은 "혜택 대상이 아니다".
const NON_ELIGIBLE_ORIGINS = new Set(['installment', 'revolving', 'debt_interest', 'debt_repayment']);

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
function compareCards({ transactions, cards } = {}) {
  const list = Array.isArray(transactions) ? transactions : [];
  const cardList = Array.isArray(cards) ? cards : [];

  if (cardList.length < 2) {
    return { comparable: false, reason: 'single-card', totalGap: 0, byCard: [], details: [] };
  }

  const eligible = list.filter(isEligible);
  if (eligible.length === 0) {
    return { comparable: false, reason: 'no-eligible-transactions', totalGap: 0, byCard: [], details: [] };
  }

  // 월 한도는 카드마다 누적된다. 거래를 순서대로 훑으며 각 카드가 이미 받은
  // 혜택을 들고 간다 — 안 그러면 한도가 있는 혜택이 매 거래마다 새로 열린다.
  const used = new Map(cardList.map((c) => [c.id, 0]));
  const gained = new Map(cardList.map((c) => [c.id, 0]));

  let totalGap = 0;
  const details = [];

  for (const tx of eligible) {
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

    const actual = perCard.find((p) => p.cardId === tx.card_product_id) || null;
    const best = perCard.reduce((a, b) => (b.benefit > a.benefit ? b : a), perCard[0]);

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

  return { comparable: true, totalGap, byCard, details };
}

module.exports = { compareCards, isEligible, NON_ELIGIBLE_ORIGINS };
