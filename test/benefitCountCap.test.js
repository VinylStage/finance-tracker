'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateRule } = require('../src/services/benefitRules.js');
const { compareCards } = require('../src/services/cardComparison.js');

function benefitRow(id, rate, caps, merchant = '에버랜드') {
  return {
    id,
    category_id: null,
    merchant_pattern: merchant,
    benefit_type: '할인',
    rate,
    monthly_cap: null,
    min_amount: 0,
    max_amount: null,
    payment_style: null,
    card_threshold_tier_id: null,
    threshold_exempt: 1,
    rule_json: JSON.stringify({ kind: 'rate', rate, caps }),
  };
}

function cardsWith(benefits) {
  return [
    { id: 1, product_name: '대상카드', thresholdMet: true, threshold: { tier: null }, benefits },
    { id: 2, product_name: '대조카드', thresholdMet: true, threshold: { tier: null }, benefits: [] },
  ];
}

function tx(id, date, amount, merchant = '에버랜드') {
  return {
    id, date, amount, merchant,
    category_id: null,
    card_product_id: 1,
    payment_method_type: '체크',
    origin: 'manual',
  };
}

test('횟수 한도 - 월 1회면 그 달의 첫 건에만 붙는다', () => {
  const benefits = [benefitRow(11, 50, [{ window: 'month', count: 1 }])];
  const cards = cardsWith(benefits);
  const transactions = [
    tx(1, '2026-03-05', 40000),
    tx(2, '2026-03-20', 40000)
  ];
  
  const result = compareCards({ transactions, cards });
  assert.ok(result.comparable);
  
  const detail1 = result.details.find((d) => d.transactionId === 1);
  const detail2 = result.details.find((d) => d.transactionId === 2);
  
  assert.strictEqual(detail1.actual.benefit, 20000); // 40000 * 50 / 100 = 20000
  assert.strictEqual(detail2.actual.benefit, 0);
});

test('횟수 한도 - 달이 바뀌면 횟수가 다시 열린다', () => {
  const benefits = [benefitRow(11, 50, [{ window: 'month', count: 1 }])];
  const cards = cardsWith(benefits);
  const transactions = [
    tx(1, '2026-03-05', 40000),
    tx(2, '2026-03-20', 40000),
    tx(3, '2026-04-02', 40000)
  ];
  
  const result = compareCards({ transactions, cards });
  assert.ok(result.comparable);
  
  const detail1 = result.details.find((d) => d.transactionId === 1);
  const detail2 = result.details.find((d) => d.transactionId === 2);
  const detail3 = result.details.find((d) => d.transactionId === 3);
  
  assert.strictEqual(detail1.actual.benefit, 20000);
  assert.strictEqual(detail2.actual.benefit, 0);
  assert.strictEqual(detail3.actual.benefit, 20000);
});

test('횟수 한도 - 금액이 얼마든 횟수로 끊는다', () => {
  const benefits = [benefitRow(11, 50, [{ window: 'month', count: 1 }])];
  const cards = cardsWith(benefits);
  const transactions = [
    tx(1, '2026-03-05', 10000),
    tx(2, '2026-03-06', 900000)
  ];
  
  const result = compareCards({ transactions, cards });
  assert.ok(result.comparable);
  
  const detail1 = result.details.find((d) => d.transactionId === 1);
  const detail2 = result.details.find((d) => d.transactionId === 2);
  
  assert.strictEqual(detail1.actual.benefit, 5000); // 10000 * 50 / 100 = 5000
  assert.strictEqual(detail2.actual.benefit, 0);
});

test('횟수 한도 - 금액과 횟수를 같이 쓰면 둘 다 걸린다', () => {
  const benefits = [benefitRow(11, 50, [{ window: 'month', amount: 5000, count: 1 }])];
  const cards = cardsWith(benefits);
  const transactions = [
    tx(1, '2026-03-05', 40000),
    tx(2, '2026-03-06', 40000)
  ];
  
  const result = compareCards({ transactions, cards });
  assert.ok(result.comparable);
  
  const detail1 = result.details.find((d) => d.transactionId === 1);
  const detail2 = result.details.find((d) => d.transactionId === 2);
  
  assert.strictEqual(detail1.actual.benefit, 5000); // 20000 (요율) -> 5000 (금액 한도)
  assert.strictEqual(detail2.actual.benefit, 0); // 횟수를 다 써서 0
});

test('횟수 한도 - 일 단위 횟수도 된다', () => {
  const benefits = [benefitRow(11, 50, [{ window: 'day', count: 1 }])];
  const cards = cardsWith(benefits);
  const transactions = [
    tx(1, '2026-03-05', 40000),
    tx(2, '2026-03-05', 40000),
    tx(3, '2026-03-06', 40000)
  ];
  
  const result = compareCards({ transactions, cards });
  assert.ok(result.comparable);
  
  const detail1 = result.details.find((d) => d.transactionId === 1);
  const detail2 = result.details.find((d) => d.transactionId === 2);
  const detail3 = result.details.find((d) => d.transactionId === 3);
  
  assert.strictEqual(detail1.actual.benefit, 20000);
  assert.strictEqual(detail2.actual.benefit, 0);
  assert.strictEqual(detail3.actual.benefit, 20000);
});

test('횟수 한도 - 달이 바뀌면 쓴 횟수가 0 부터 다시 센다', () => {
  const benefits = [benefitRow(11, 50, [{ window: 'month', count: 2 }])];
  const cards = cardsWith(benefits);
  const transactions = [
    tx(1, '2026-03-05', 40000),
    tx(2, '2026-03-06', 40000),
    tx(3, '2026-03-07', 40000),
    tx(4, '2026-04-05', 40000),
    tx(5, '2026-04-06', 40000),
    tx(6, '2026-04-07', 40000)
  ];
  
  const result = compareCards({ transactions, cards });
  assert.ok(result.comparable);
  
  const detail1 = result.details.find((d) => d.transactionId === 1);
  const detail2 = result.details.find((d) => d.transactionId === 2);
  const detail3 = result.details.find((d) => d.transactionId === 3);
  const detail4 = result.details.find((d) => d.transactionId === 4);
  const detail5 = result.details.find((d) => d.transactionId === 5);
  const detail6 = result.details.find((d) => d.transactionId === 6);
  
  assert.strictEqual(detail1.actual.benefit, 20000);
  assert.strictEqual(detail2.actual.benefit, 20000);
  assert.strictEqual(detail3.actual.benefit, 0);
  assert.strictEqual(detail4.actual.benefit, 20000);
  assert.strictEqual(detail5.actual.benefit, 20000);
  assert.strictEqual(detail6.actual.benefit, 0);
});

test('횟수 한도 - 날이 바뀌어도 쓴 횟수가 0 부터 다시 센다', () => {
  const benefits = [benefitRow(11, 50, [{ window: 'day', count: 2 }])];
  const cards = cardsWith(benefits);
  const transactions = [
    tx(1, '2026-03-05', 40000),
    tx(2, '2026-03-05', 40000),
    tx(3, '2026-03-05', 40000),
    tx(4, '2026-03-06', 40000),
    tx(5, '2026-03-06', 40000),
    tx(6, '2026-03-06', 40000)
  ];
  
  const result = compareCards({ transactions, cards });
  assert.ok(result.comparable);
  
  const detail1 = result.details.find((d) => d.transactionId === 1);
  const detail2 = result.details.find((d) => d.transactionId === 2);
  const detail3 = result.details.find((d) => d.transactionId === 3);
  const detail4 = result.details.find((d) => d.transactionId === 4);
  const detail5 = result.details.find((d) => d.transactionId === 5);
  const detail6 = result.details.find((d) => d.transactionId === 6);
  
  assert.strictEqual(detail1.actual.benefit, 20000);
  assert.strictEqual(detail2.actual.benefit, 20000);
  assert.strictEqual(detail3.actual.benefit, 0);
  assert.strictEqual(detail4.actual.benefit, 20000);
  assert.strictEqual(detail5.actual.benefit, 20000);
  assert.strictEqual(detail6.actual.benefit, 0);
});

test('횟수 한도 - validateRule 이 잘못된 횟수를 막는다', () => {
  // 통과해야 하는 케이스
  const rule1 = { kind: 'rate', rate: 50, caps: [{ window: 'month', count: 1 }] };
  assert.strictEqual(validateRule(rule1), null);
  
  const rule2 = { kind: 'rate', rate: 50, caps: [{ window: 'month', amount: 5000, count: 1 }] };
  assert.strictEqual(validateRule(rule2), null);
  
  // 막아야 하는 케이스
  const rule3 = { kind: 'rate', rate: 50, caps: [{ window: 'month', count: 0 }] };
  assert.ok(typeof validateRule(rule3) === 'string');
  
  const rule4 = { kind: 'rate', rate: 50, caps: [{ window: 'month', count: 1.5 }] };
  assert.ok(typeof validateRule(rule4) === 'string');
  
  const rule5 = { kind: 'rate', rate: 50, caps: [{ window: 'month' }] };
  assert.ok(typeof validateRule(rule5) === 'string');
});
