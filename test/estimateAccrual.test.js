'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers/testServer');

const PORT = 21068;
let server;

async function json(pathname, options) {
  const r = await fetch(`${server.base}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return { status: r.status, body: await r.json() };
}
const post = (p, body) => json(p, { method: 'POST', body: JSON.stringify(body) });

after(() => server && server.stop());

let seq = 0;
let categoryId;

before(async () => {
  server = await startTestServer({ port: PORT });
  // 거래에는 category_id 가 필수다. GET /api/categories 는 **배열 그대로**를 낸다
  // (`body.data` 가 아니라 `body`). 다른 엔드포인트와 다르니 주의한다.
  categoryId = (await json('/api/categories')).body.find((c) => c.major_type !== '수입').id;
});

// 카드 한 장과 그 결제수단. 가맹점 이름도 테스트마다 다르게 만든다.
async function newCard() {
  seq += 1;
  const merchant = `추정가맹점${seq}`;
  const pm = (await post('/api/payment-methods', { name: `추정카드${seq}`, type: '체크' })).body.id;
  const card = (await post('/api/card-products', {
    payment_method_id: pm,
    issuer: '예시카드사',
    product_name: `예시 추정 카드${seq}`,
    card_type: '체크',
  })).body.id;
  return { pm, card, merchant };
}

async function estimate({ card, merchant, amount = 50000, asOf = '2026-03-20' }) {
  const r = await json(`/api/card-strategy/estimate?amount=${amount}&merchant=${encodeURIComponent(merchant)}&asOf=${asOf}`);
  return r.body.data.find((d) => d.cardProductId === card);
}

test('이 달 결제가 없으면 한도가 다 남아 있다', async () => {
  const { pm, card, merchant } = await newCard();
  await post('/api/card-benefits', {
    card_product_id: card,
    merchant_pattern: merchant,
    benefit_type: '적립',
    rate: 10,
    threshold_exempt: true,
    rule: { kind: 'rate', rate: 10, caps: [{ window: 'month', amount: 5000 }] },
  });
  const result = await estimate({ card, merchant });
  assert.strictEqual(result.benefit, 5000);
});

test('같은 달에 이미 한도를 다 썼으면 0 이다', async () => {
  const { pm, card, merchant } = await newCard();
  await post('/api/card-benefits', {
    card_product_id: card,
    merchant_pattern: merchant,
    benefit_type: '적립',
    rate: 10,
    threshold_exempt: true,
    rule: { kind: 'rate', rate: 10, caps: [{ window: 'month', amount: 5000 }] },
  });
  await post('/api/transactions', {
    date: '2026-03-10', merchant, amount: 50000,
    payment_method_id: pm, type: '지출', category_id: categoryId,
  });
  const result = await estimate({ card, merchant, asOf: '2026-03-20' });
  assert.strictEqual(result.benefit, 0);
});

test('달이 바뀌면 다시 열린다', async () => {
  const { pm, card, merchant } = await newCard();
  await post('/api/card-benefits', {
    card_product_id: card,
    merchant_pattern: merchant,
    benefit_type: '적립',
    rate: 10,
    threshold_exempt: true,
    rule: { kind: 'rate', rate: 10, caps: [{ window: 'month', amount: 5000 }] },
  });
  await post('/api/transactions', {
    date: '2026-03-10', merchant, amount: 50000,
    payment_method_id: pm, type: '지출', category_id: categoryId,
  });
  const result = await estimate({ card, merchant, asOf: '2026-04-05' });
  assert.strictEqual(result.benefit, 5000);
});

test('한도를 일부만 썼으면 남은 만큼만 준다', async () => {
  const { pm, card, merchant } = await newCard();
  await post('/api/card-benefits', {
    card_product_id: card,
    merchant_pattern: merchant,
    benefit_type: '적립',
    rate: 10,
    threshold_exempt: true,
    rule: { kind: 'rate', rate: 10, caps: [{ window: 'month', amount: 5000 }] },
  });
  await post('/api/transactions', {
    date: '2026-03-10', merchant, amount: 20000,
    payment_method_id: pm, type: '지출', category_id: categoryId,
  });
  const result = await estimate({ card, merchant, asOf: '2026-03-20' });
  assert.strictEqual(result.benefit, 3000);
});

test('asOf 뒤의 거래는 안 센다', async () => {
  const { pm, card, merchant } = await newCard();
  await post('/api/card-benefits', {
    card_product_id: card,
    merchant_pattern: merchant,
    benefit_type: '적립',
    rate: 10,
    threshold_exempt: true,
    rule: { kind: 'rate', rate: 10, caps: [{ window: 'month', amount: 5000 }] },
  });
  await post('/api/transactions', {
    date: '2026-03-25', merchant, amount: 50000,
    payment_method_id: pm, type: '지출', category_id: categoryId,
  });
  const result = await estimate({ card, merchant, asOf: '2026-03-20' });
  assert.strictEqual(result.benefit, 5000);
});

test('다른 카드로 낸 결제는 이 카드의 한도를 안 깎는다', async () => {
  const { pm: pm1, card: card1, merchant } = await newCard();
  const { pm: pm2 } = await newCard();
  await post('/api/card-benefits', {
    card_product_id: card1,
    merchant_pattern: merchant,
    benefit_type: '적립',
    rate: 10,
    threshold_exempt: true,
    rule: { kind: 'rate', rate: 10, caps: [{ window: 'month', amount: 5000 }] },
  });
  await post('/api/transactions', {
    date: '2026-03-10', merchant, amount: 50000,
    payment_method_id: pm2, type: '지출', category_id: categoryId,
  });
  const result = await estimate({ card: card1, merchant });
  assert.strictEqual(result.benefit, 5000);
});

test('카드 통합 한도도 이 달 누적을 본다', async () => {
  const { pm, card, merchant } = await newCard();
  await json(`/api/card-strategy/tiers/${card}`, {
    method: 'PUT',
    body: JSON.stringify({ tiers: [{ min_spend: 0, label: '기본', monthly_cap: 5000 }] }),
  });
  await post('/api/card-benefits', {
    card_product_id: card,
    merchant_pattern: merchant,
    benefit_type: '적립',
    rate: 10,
    threshold_exempt: true,
  });
  const result1 = await estimate({ card, merchant });
  assert.strictEqual(result1.benefit, 5000);
  await post('/api/transactions', {
    date: '2026-03-10', merchant, amount: 50000,
    payment_method_id: pm, type: '지출', category_id: categoryId,
  });
  const result2 = await estimate({ card, merchant, asOf: '2026-03-20' });
  assert.strictEqual(result2.benefit, 0);
});

test('일 한도도 단건 추정에서 걸린다', async () => {
  const { pm, card, merchant } = await newCard();
  await post('/api/card-benefits', {
    card_product_id: card,
    merchant_pattern: merchant,
    benefit_type: '적립',
    rate: 10,
    threshold_exempt: true,
    rule: { kind: 'rate', rate: 10, caps: [{ window: 'day', amount: 3000 }] },
  });
  await post('/api/transactions', {
    date: '2026-03-20', merchant, amount: 50000,
    payment_method_id: pm, type: '지출', category_id: categoryId,
  });
  const result1 = await estimate({ card, merchant, asOf: '2026-03-20' });
  assert.strictEqual(result1.benefit, 0);
  const result2 = await estimate({ card, merchant, asOf: '2026-03-21' });
  assert.strictEqual(result2.benefit, 3000);
});

test('날짜 조건이 붙은 혜택은 그 날에만 잡힌다', async () => {
  const { pm, card, merchant } = await newCard();
  await post('/api/card-benefits', {
    card_product_id: card,
    merchant_pattern: merchant,
    benefit_type: '적립',
    rate: 10,
    threshold_exempt: true,
    rule: { kind: 'rate', rate: 10, when: { dates: ['10-01'] } },
  });
  const result1 = await estimate({ card, merchant, asOf: '2026-10-01' });
  assert.strictEqual(result1.benefit, 5000);
  const result2 = await estimate({ card, merchant, asOf: '2026-10-02' });
  assert.strictEqual(result2.benefit, 0);
});
