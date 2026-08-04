'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');

const { compareCards, isEligible } = require('../src/services/cardComparison');

// 사후 분석 — 실제 카드 대비 최적 카드의 차액(#276).
//
// 이 값은 **"놓친 돈" 이 아니라 "지금 기준으로 다시 계산한 차이"** 다. 그때
// 그 카드를 갖고 있었는지, 한도가 남았는지는 계산에 없다. 그 구분이 흐려지면
// 사용자가 자기 과거 선택을 잘못 판단한다.

const benefit = (over) => ({
  id: 1, category_id: null, merchant_pattern: null,
  benefit_type: '적립', rate: 1, monthly_cap: null, min_amount: null, ...over,
});

const CARD_A = { id: 1, product_name: 'A카드', thresholdMet: true, benefits: [benefit({ id: 1, rate: 1 })] };
const CARD_B = { id: 2, product_name: 'B카드', thresholdMet: true, benefits: [benefit({ id: 2, rate: 10 })] };

const tx = (over) => ({
  id: 1, amount: 10000, category_id: 5, merchant: '스타벅스',
  card_product_id: 1, origin: 'manual', ...over,
});

describe('A. 비교할 수 없는 경우', () => {
  test('A-1. 카드가 하나면 추천하지 않는다', () => {
    // 비교 대상이 없다. "최적입니다" 라고 말하면 사용자는 선택지가 있는 줄 안다.
    const r = compareCards({ transactions: [tx()], cards: [CARD_A] });
    assert.equal(r.comparable, false);
    assert.equal(r.reason, 'single-card');
    assert.equal(r.totalGap, 0);
    assert.deepEqual(r.byCard, []);
  });

  test('A-2. 카드가 없어도 던지지 않는다', () => {
    assert.equal(compareCards({ transactions: [tx()], cards: [] }).comparable, false);
    assert.equal(compareCards({}).comparable, false);
    assert.equal(compareCards().comparable, false);
  });

  test('A-3. 대상 거래가 없으면 비교하지 않는다', () => {
    const r = compareCards({ transactions: [], cards: [CARD_A, CARD_B] });
    assert.equal(r.comparable, false);
    assert.equal(r.reason, 'no-eligible-transactions');
  });
});

describe('B. 파생 거래를 뺀다 — 이자에는 혜택이 없다', () => {
  test('B-1. 할부·리볼빙·이자·상환은 대상이 아니다', () => {
    for (const origin of ['installment', 'revolving', 'debt_interest', 'debt_repayment']) {
      assert.equal(isEligible({ origin }), false, `${origin} 이 대상에 들어갔다`);
    }
  });

  test('B-2. 사용자 입력과 임포트는 대상이다', () => {
    assert.equal(isEligible({ origin: 'manual' }), true);
    assert.equal(isEligible({ origin: 'recurring' }), true);
    // origin 이 없는 옛 거래는 manual 로 본다.
    assert.equal(isEligible({}), true);
  });

  test('B-3. 파생 거래만 있으면 비교 대상이 없다', () => {
    const r = compareCards({
      transactions: [tx({ origin: 'installment' }), tx({ id: 2, origin: 'debt_interest' })],
      cards: [CARD_A, CARD_B],
    });
    assert.equal(r.comparable, false);
    assert.equal(r.reason, 'no-eligible-transactions');
  });

  test('B-4. 섞여 있으면 파생만 빠진다', () => {
    const r = compareCards({
      transactions: [tx({ id: 1 }), tx({ id: 2, origin: 'installment', amount: 999999 })],
      cards: [CARD_A, CARD_B],
    });
    assert.equal(r.details.length, 1, '파생 거래가 계산에 들어갔다');
    assert.equal(r.details[0].transactionId, 1);
  });
});

describe('C. 차액 계산', () => {
  test('C-1. 더 나은 카드가 있으면 차액이 잡힌다', () => {
    // A(1%)로 10000원 결제 → 100원. B(10%)였으면 1000원. 차액 900원.
    const r = compareCards({ transactions: [tx()], cards: [CARD_A, CARD_B] });

    assert.equal(r.comparable, true);
    assert.equal(r.totalGap, 900);
    assert.equal(r.details[0].actual.benefit, 100);
    assert.equal(r.details[0].best.cardId, 2);
    assert.equal(r.details[0].best.benefit, 1000);
    assert.equal(r.details[0].gap, 900);
  });

  test('C-2. 이미 최적이면 차액이 0 이다', () => {
    const r = compareCards({ transactions: [tx({ card_product_id: 2 })], cards: [CARD_A, CARD_B] });
    assert.equal(r.totalGap, 0);
    assert.equal(r.details[0].gap, 0);
    assert.deepEqual(r.byCard, [], '차액이 없는데 추천 카드가 나왔다');
  });

  test('C-3. 카드별로 합산해 큰 순으로 준다', () => {
    const C = { id: 3, product_name: 'C카드', thresholdMet: true, benefits: [benefit({ id: 3, rate: 5 })] };
    const r = compareCards({
      transactions: [tx({ id: 1 }), tx({ id: 2, amount: 20000 })],
      cards: [CARD_A, CARD_B, C],
    });

    // 두 거래 모두 B(10%)가 최적. 차액 900 + 1800 = 2700.
    assert.equal(r.totalGap, 2700);
    assert.equal(r.byCard[0].cardId, 2);
    assert.equal(r.byCard[0].gapIfUsed, 2700);
    assert.equal(r.byCard.length, 1, '차액 0 인 카드가 목록에 남았다');
  });

  test('C-4. 실제 카드가 없는 거래도 계산한다', () => {
    // 현금 결제 등. 실제 혜택 0 이므로 최적 카드 혜택이 그대로 차액이다.
    const r = compareCards({ transactions: [tx({ card_product_id: null })], cards: [CARD_A, CARD_B] });
    assert.equal(r.details[0].actual, null, 'null 을 숨겼다');
    assert.equal(r.totalGap, 1000);
  });

  test('C-5. 차액은 음수가 되지 않는다', () => {
    // 실제가 최적보다 나을 수는 없지만, 계산이 어긋나도 음수를 내보내지 않는다.
    const r = compareCards({ transactions: [tx({ card_product_id: 2 })], cards: [CARD_A, CARD_B] });
    for (const d of r.details) assert.ok(d.gap >= 0);
  });
});

describe('D. 월 한도가 누적된다', () => {
  test('D-1. 실제 카드의 한도는 거래를 지나며 줄어든다', () => {
    // A 카드 10% 인데 한도 1000원. 10000원짜리 두 건이면 첫 건에서 한도를 다 쓴다.
    const capped = { id: 1, product_name: 'A카드', thresholdMet: true,
      benefits: [benefit({ id: 1, rate: 10, monthly_cap: 1000 })] };
    const plain = { id: 2, product_name: 'B카드', thresholdMet: true,
      benefits: [benefit({ id: 2, rate: 3 })] };

    const r = compareCards({
      transactions: [tx({ id: 1, card_product_id: 1 }), tx({ id: 2, card_product_id: 1 })],
      cards: [capped, plain],
    });

    assert.equal(r.details[0].actual.benefit, 1000, '첫 건에서 한도까지 받아야 한다');
    assert.equal(r.details[1].actual.benefit, 0, '한도를 다 썼는데 또 받았다');
    // 두 번째 건은 B(3% = 300원)가 최적이 된다.
    assert.equal(r.details[1].best.cardId, 2);
    assert.equal(r.details[1].gap, 300);
  });

  test('D-2. 가정 계산은 서로의 한도를 깎지 않는다', () => {
    // 가정끼리 한도를 소진시키면 계산이 뒤엉킨다. 실제 쓴 카드만 소진한다.
    const capped = { id: 2, product_name: 'B카드', thresholdMet: true,
      benefits: [benefit({ id: 2, rate: 10, monthly_cap: 1000 })] };

    const r = compareCards({
      transactions: [tx({ id: 1, card_product_id: 1 }), tx({ id: 2, card_product_id: 1 })],
      cards: [CARD_A, capped],
    });

    // 두 건 모두 B 가 최적이고 한도가 안 깎였으므로 각각 1000원까지 가능.
    assert.equal(r.details[0].best.benefit, 1000);
    assert.equal(r.details[1].best.benefit, 1000, '가정끼리 한도를 깎았다');
  });
});

describe('E. 실적 미달', () => {
  test('E-1. 실적을 못 채운 카드는 혜택 0 으로 계산된다', () => {
    const unmet = { id: 2, product_name: 'B카드', thresholdMet: false,
      benefits: [benefit({ id: 2, rate: 10 })] };

    const r = compareCards({ transactions: [tx()], cards: [CARD_A, unmet] });

    // B 가 요율은 높지만 실적 미달이라 0. A(100원)가 최적이 된다.
    assert.equal(r.details[0].best.cardId, 1);
    assert.equal(r.totalGap, 0);
  });
});
