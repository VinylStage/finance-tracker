'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers/testServer');

const PORT = 21066;
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
const put = (p, body) => json(p, { method: 'PUT', body: JSON.stringify(body) });

after(() => server && server.stop());

before(async () => {
  server = await startTestServer({ port: PORT });
});

let seq = 0;
// 테스트 하나가 쓸 카드 한 장. 이름을 매번 다르게 해서 서로 안 섞이게 한다.
async function newCard() {
  seq += 1;
  const pm = (await post('/api/payment-methods', { name: `구간카드${seq}`, type: '체크' })).body.id;
  const card = (await post('/api/card-products', {
    payment_method_id: pm,
    issuer: '예시카드사',
    product_name: `예시 구간 카드${seq}`,
    card_type: '체크',
  })).body.id;
  return card;
}

test('라벨과 한도만 고치면 구간 id 가 그대로다', async () => {
  const card = await newCard();
  const first = await put(`/api/card-strategy/tiers/${card}`, { tiers: [
    { min_spend: 0, label: '기본', monthly_cap: 5000 },
    { min_spend: 300000, label: '30만', monthly_cap: 30000 },
  ] });
  const before = first.body.data.map((t) => t.id);

  const second = await put(`/api/card-strategy/tiers/${card}`, { tiers: [
    { min_spend: 0, label: '기본', monthly_cap: 7000 },
    { min_spend: 300000, label: '30만원 이상', monthly_cap: 35000 },
  ] });

  assert.strictEqual(second.status, 200);
  assert.deepStrictEqual(
    second.body.data.map((t) => t.id),
    before
  );
  assert.strictEqual(second.body.data[0].monthly_cap, 7000);
  assert.strictEqual(second.body.data[1].monthly_cap, 35000);
});

test('구간을 가리키는 혜택의 참조가 살아남는다', async () => {
  const card = await newCard();
  const first = await put(`/api/card-strategy/tiers/${card}`, { tiers: [
    { min_spend: 0, label: '기본', monthly_cap: 5000 },
    { min_spend: 300000, label: '30만', monthly_cap: 30000 },
  ] });
  const tierId = first.body.data[1].id;

  await post('/api/card-benefits', {
    card_product_id: card,
    merchant_pattern: '참조가맹점',
    benefit_type: '적립',
    rate: 10,
    card_threshold_tier_id: tierId,
  });

  const second = await put(`/api/card-strategy/tiers/${card}`, { tiers: [
    { min_spend: 0, label: '기본', monthly_cap: 7000 },
    { min_spend: 300000, label: '30만원 이상', monthly_cap: 35000 },
  ] });

  assert.strictEqual(second.status, 200);

  const benefits = await json(`/api/card-benefits?card_product_id=${card}`);
  assert.strictEqual(benefits.body.data[0].card_threshold_tier_id, tierId);
});

test('구간을 새로 더할 수 있다', async () => {
  const card = await newCard();
  const first = await put(`/api/card-strategy/tiers/${card}`, { tiers: [
    { min_spend: 0, label: '기본', monthly_cap: 5000 },
    { min_spend: 300000, label: '30만', monthly_cap: 30000 },
  ] });

  const second = await put(`/api/card-strategy/tiers/${card}`, { tiers: [
    { min_spend: 0, label: '기본', monthly_cap: 5000 },
    { min_spend: 100000, label: '10만', monthly_cap: 10000 },
    { min_spend: 300000, label: '30만', monthly_cap: 30000 },
  ] });

  assert.strictEqual(second.status, 200);
  assert.strictEqual(second.body.data.length, 3);
  assert.deepStrictEqual(
    second.body.data.map((t) => t.min_spend),
    [0, 100000, 300000]
  );
});

test('참조가 걸린 구간을 없애려 하면 400 이다', async () => {
  const card = await newCard();
  const first = await put(`/api/card-strategy/tiers/${card}`, { tiers: [
    { min_spend: 0, label: '기본', monthly_cap: 5000 },
    { min_spend: 300000, label: '30만', monthly_cap: 30000 },
  ] });
  const tierId = first.body.data[1].id;

  await post('/api/card-benefits', {
    card_product_id: card,
    merchant_pattern: '참조가맹점',
    benefit_type: '적립',
    rate: 10,
    card_threshold_tier_id: tierId,
  });

  const second = await put(`/api/card-strategy/tiers/${card}`, { tiers: [
    { min_spend: 0, label: '기본', monthly_cap: 7000 },
  ] });

  assert.strictEqual(second.status, 400);
  assert.strictEqual(typeof second.body.error, 'string');
  assert(second.body.error.includes('300,000원'));
  assert(second.body.error.includes('1개'));
});

test('막혔으면 아무것도 안 바뀐다', async () => {
  const card = await newCard();
  const first = await put(`/api/card-strategy/tiers/${card}`, { tiers: [
    { min_spend: 0, label: '기본', monthly_cap: 5000 },
    { min_spend: 300000, label: '30만', monthly_cap: 30000 },
  ] });
  const tierId = first.body.data[1].id;

  await post('/api/card-benefits', {
    card_product_id: card,
    merchant_pattern: '참조가맹점',
    benefit_type: '적립',
    rate: 10,
    card_threshold_tier_id: tierId,
  });

  const second = await put(`/api/card-strategy/tiers/${card}`, { tiers: [
    { min_spend: 0, label: '기본', monthly_cap: 7000 },
  ] });
  assert.strictEqual(second.status, 400);

  // 참조가 살아 있는지 확인
  const benefits = await json(`/api/card-benefits?card_product_id=${card}`);
  assert.strictEqual(benefits.body.data[0].card_threshold_tier_id, tierId);
});

test('참조가 없는 구간은 그냥 없어진다', async () => {
  const card = await newCard();
  const first = await put(`/api/card-strategy/tiers/${card}`, { tiers: [
    { min_spend: 0, label: '기본', monthly_cap: 5000 },
    { min_spend: 100000, label: '10만', monthly_cap: 10000 },
    { min_spend: 300000, label: '30만', monthly_cap: 30000 },
  ] });

  const second = await put(`/api/card-strategy/tiers/${card}`, { tiers: [
    { min_spend: 0, label: '기본', monthly_cap: 7000 },
  ] });

  assert.strictEqual(second.status, 200);
  assert.strictEqual(second.body.data.length, 1);
  assert.deepStrictEqual(
    second.body.data.map((t) => t.min_spend),
    [0]
  );
});

test('문구가 «걸린 구간만» 과 «혜택 수» 를 정확히 말한다', async () => {
  const card = await newCard();
  const first = await put(`/api/card-strategy/tiers/${card}`, { tiers: [
    { min_spend: 0, label: '기본', monthly_cap: 5000 },
    { min_spend: 100000, label: '10만', monthly_cap: 10000 },
    { min_spend: 300000, label: '30만', monthly_cap: 30000 },
  ] });

  await post('/api/card-benefits', {
    card_product_id: card,
    merchant_pattern: '혜택가맹점1',
    benefit_type: '적립',
    rate: 10,
    card_threshold_tier_id: first.body.data[2].id,
  });
  await post('/api/card-benefits', {
    card_product_id: card,
    merchant_pattern: '혜택가맹점2',
    benefit_type: '적립',
    rate: 10,
    card_threshold_tier_id: first.body.data[2].id,
  });

  const second = await put(`/api/card-strategy/tiers/${card}`, { tiers: [
    { min_spend: 0, label: '기본', monthly_cap: 7000 },
  ] });

  assert.strictEqual(second.status, 400);
  assert.strictEqual(typeof second.body.error, 'string');
  assert(second.body.error.includes('300,000원'));
  assert(!second.body.error.includes('100,000원'));
  assert(second.body.error.includes('2개'));
});
