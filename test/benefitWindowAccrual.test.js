const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compareCards } = require('../src/services/cardComparison.js');

function benefitRow(id, rate, caps, merchant = 'PX') {
  return {
    id,
    category_id: null,
    merchant_pattern: merchant,
    benefit_type: '적립',
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

function tx(id, date, amount, merchant = 'PX') {
  return {
    id, date, amount, merchant,
    category_id: null,
    card_product_id: 1,          // 1번 카드로 결제했다는 뜻
    payment_method_type: '체크',
    origin: 'manual',
  };
}

test('테스트 1 — 같은 날 두 건이면 일 한도가 걸린다', () => {
  const result = compareCards({
    transactions: [
      tx(1, '2026-03-10', 150000),
      tx(2, '2026-03-10', 150000),
    ],
    cards: cardsWith([
      benefitRow(11, 20, [{ window: 'day', amount: 20000 }]),
    ]),
  });

  const detail1 = result.details.find((d) => d.transactionId === 1);
  const detail2 = result.details.find((d) => d.transactionId === 2);

  assert.equal(detail1.actual.benefit, 20000);
  assert.equal(detail2.actual.benefit, 0);
});

test('테스트 2 — 날이 바뀌면 일 한도가 다시 열린다', () => {
  const result = compareCards({
    transactions: [
      tx(1, '2026-03-10', 150000),
      tx(2, '2026-03-11', 150000),
    ],
    cards: cardsWith([
      benefitRow(11, 20, [{ window: 'day', amount: 20000 }]),
    ]),
  });

  const detail1 = result.details.find((d) => d.transactionId === 1);
  const detail2 = result.details.find((d) => d.transactionId === 2);

  assert.equal(detail1.actual.benefit, 20000);
  assert.equal(detail2.actual.benefit, 20000);
});

test('테스트 3 — 달이 바뀌면 월 누적이 비워진다', () => {
  const result = compareCards({
    transactions: [
      tx(1, '2026-03-05', 100000),
      tx(2, '2026-03-06', 100000),
      tx(3, '2026-04-05', 100000),
      tx(4, '2026-04-06', 100000),
    ],
    cards: cardsWith([
      benefitRow(11, 20, [{ window: 'month', amount: 10000 }]),
    ]),
  });

  const detail1 = result.details.find((d) => d.transactionId === 1);
  const detail2 = result.details.find((d) => d.transactionId === 2);
  const detail3 = result.details.find((d) => d.transactionId === 3);
  const detail4 = result.details.find((d) => d.transactionId === 4);

  assert.equal(detail1.actual.benefit, 10000);
  assert.equal(detail2.actual.benefit, 0);
  assert.equal(detail3.actual.benefit, 10000);
  assert.equal(detail4.actual.benefit, 0);
});

test('테스트 4 — 날짜를 못 읽으면 일 한도를 걸지 않는다', () => {
  const result = compareCards({
    transactions: [
      { ...tx(1, '2026-03-10', 150000), date: null },
    ],
    cards: cardsWith([
      benefitRow(11, 20, [{ window: 'day', amount: 20000 }]),
    ]),
  });

  const detail = result.details.find((d) => d.transactionId === 1);

  assert.equal(detail.actual.benefit, 30000);
});

test('테스트 5 — 항목이 다르면 서로의 한도를 깎지 않는다', () => {
  const result = compareCards({
    transactions: [
      tx(1, '2026-03-05', 100000, 'PX'),
      tx(2, '2026-03-06', 100000, 'CU'),
    ],
    cards: cardsWith([
      benefitRow(11, 20, [{ window: 'month', amount: 10000 }], 'PX'),
      benefitRow(12, 20, [{ window: 'month', amount: 10000 }], 'CU'),
    ]),
  });

  const detail1 = result.details.find((d) => d.transactionId === 1);
  const detail2 = result.details.find((d) => d.transactionId === 2);

  assert.equal(detail1.actual.benefit, 10000);
  assert.equal(detail2.actual.benefit, 10000);
});

test('테스트 6 — 아무 혜택도 안 걸린 거래는 한도를 소진하지 않는다', () => {
  const result = compareCards({
    transactions: [
      tx(1, '2026-03-10', 150000, '무관한가맹점'),
      tx(2, '2026-03-10', 150000, 'PX'),
      tx(3, '2026-03-10', 150000, 'PX'),
    ],
    cards: cardsWith([
      benefitRow(11, 20, [{ window: 'day', amount: 20000 }]),
    ]),
  });

  const detail1 = result.details.find((d) => d.transactionId === 1);
  const detail2 = result.details.find((d) => d.transactionId === 2);
  const detail3 = result.details.find((d) => d.transactionId === 3);

  assert.equal(detail1.actual.benefit, 0);
  assert.equal(detail2.actual.benefit, 20000);
  assert.equal(detail3.actual.benefit, 0);
});

test('테스트 7 — 카드 통합 한도도 달마다 다시 열린다', () => {
  const cards = [
    { id: 1, product_name: '대상카드', thresholdMet: true,
      threshold: { tier: { id: 9, monthly_cap: 10000 } },
      benefits: [benefitRow(11, 20, [])] },
    { id: 2, product_name: '대조카드', thresholdMet: true, threshold: { tier: null }, benefits: [] },
  ];

  const result = compareCards({
    transactions: [
      tx(1, '2026-03-05', 100000),
      tx(2, '2026-04-05', 100000),
    ],
    cards,
  });

  const detail1 = result.details.find((d) => d.transactionId === 1);
  const detail2 = result.details.find((d) => d.transactionId === 2);

  assert.equal(detail1.actual.benefit, 10000);
  assert.equal(detail2.actual.benefit, 10000);
});
