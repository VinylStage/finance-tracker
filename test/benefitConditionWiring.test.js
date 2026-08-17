'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers/testServer');

const PORT = 21062;
let server;
const ids = {};

async function json(pathname, options) {
  const r = await fetch(`${server.base}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return { status: r.status, body: await r.json() };
}
const post = (p, body) => json(p, { method: 'POST', body: JSON.stringify(body) });

const listBenefits = async () => (await json('/api/card-benefits')).body.data;

after(() => server && server.stop());

before(async () => {
  server = await startTestServer({ port: PORT });

  // 주의: 이 엔드포인트만 배열을 그대로 낸다. `body.data` 가 아니라 `body` 다.
  const cats = (await json('/api/categories')).body;
  ids.category = cats.find((c) => c.major_type !== '수입').id;

  ids.pm = (await post('/api/payment-methods', { name: '조건배선카드', type: '체크' })).body.id;
  ids.card = (await post('/api/card-products', {
    payment_method_id: ids.pm,
    issuer: '예시카드사',
    product_name: '예시 조건 카드',
    card_type: '체크',
  })).body.id;

  // 대조용. 혜택을 안 붙인다.
  const pm2 = (await post('/api/payment-methods', { name: '대조카드', type: '신용' })).body.id;
  await post('/api/card-products', {
    payment_method_id: pm2,
    issuer: '예시카드사',
    product_name: '대조 카드',
    card_type: '신용',
  });
});

test('상한이 저장되고 그대로 읽힌다', async () => {
  const created = await post('/api/card-benefits', {
    card_product_id: ids.card,
    merchant_pattern: '상한저장가맹점',
    benefit_type: '할인',
    rate: 30,
    max_amount: 100000,
    threshold_exempt: true,
  });

  assert.strictEqual(created.status, 201);

  const benefits = await listBenefits();
  const benefit = benefits.find((b) => b.id === created.body.id);
  assert.strictEqual(benefit.max_amount, 100000);
});

test('날짜 조건이 저장되고 그대로 읽힌다', async () => {
  const created = await post('/api/card-benefits', {
    card_product_id: ids.card,
    merchant_pattern: '날짜저장가맹점',
    benefit_type: '할인',
    rate: 30,
    rule: { kind: 'rate', rate: 30, when: { dates: ['10-01'] } },
  });

  assert.strictEqual(created.status, 201);

  const benefits = await listBenefits();
  const benefit = benefits.find((b) => b.id === created.body.id);
  assert.deepStrictEqual(JSON.parse(benefit.rule_json).when.dates, ['10-01']);
});

test('상한이 계산에 닿는다', async () => {
  await post('/api/card-benefits', {
    card_product_id: ids.card,
    merchant_pattern: '계산가맹점',
    benefit_type: '할인',
    rate: 30,
    max_amount: 100000,
    threshold_exempt: true,
  });

  for (const [date, amount] of [['2026-03-10', 50000], ['2026-03-11', 150000]]) {
    await post('/api/transactions', {
      date, merchant: '계산가맹점', amount,
      payment_method_id: ids.pm, type: '지출', category_id: ids.category,
    });
  }

  const cmp = await json('/api/card-strategy/comparison?from=2026-03-01&to=2026-03-31');
  const small = cmp.body.details.find((d) => d.amount === 50000);
  const big = cmp.body.details.find((d) => d.amount === 150000);

  assert.ok(small);
  assert.ok(big);
  assert.strictEqual(small.actual.benefit, 15000);
  assert.strictEqual(big.actual.benefit, 0);
});

test('상한이 하한보다 크지 않으면 거부한다', async () => {
  const same = await post('/api/card-benefits', {
    card_product_id: ids.card,
    merchant_pattern: '거부가맹점',
    benefit_type: '할인',
    rate: 30,
    min_amount: 50000,
    max_amount: 50000,
  });

  assert.strictEqual(same.status, 400);
  assert.strictEqual(typeof same.body.error, 'string');

  const smaller = await post('/api/card-benefits', {
    card_product_id: ids.card,
    merchant_pattern: '거부가맹점',
    benefit_type: '할인',
    rate: 30,
    min_amount: 50000,
    max_amount: 30000,
  });

  assert.strictEqual(smaller.status, 400);
  assert.strictEqual(typeof smaller.body.error, 'string');
});

test('두 칸을 안 보내면 예전대로다', async () => {
  const created = await post('/api/card-benefits', {
    card_product_id: ids.card,
    merchant_pattern: '기본가맹점',
    benefit_type: '할인',
    rate: 30,
  });

  assert.strictEqual(created.status, 201);

  const benefits = await listBenefits();
  const benefit = benefits.find((b) => b.id === created.body.id);
  assert.strictEqual(benefit.max_amount, null);
});
