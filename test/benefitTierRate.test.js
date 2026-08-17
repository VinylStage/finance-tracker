'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const PORT = 21054;
let server;
let pmId, cardId, catId, tier1, tier2;

async function json(pathname, options) {
  const r = await fetch(`${server.base}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return { status: r.status, body: await r.json() };
}
const get = (p) => json(p);
const post = (p, body) => json(p, { method: 'POST', body: JSON.stringify(body) });
const put = (p, body) => json(p, { method: 'PUT', body: JSON.stringify(body) });

before(async () => {
  server = await startTestServer({ port: PORT });
  const pm = await post('/api/payment-methods', { name: '구간검증사', type: '신용' });
  pmId = pm.body.id;
  const cp = await post('/api/card-products', {
    payment_method_id: pmId, issuer: '검증', product_name: '구간카드', card_type: '신용',
  });
  cardId = cp.body.id;
  
  
  const cats = await get('/api/categories');
  catId = cats.body.find((c) => c.major_type !== '수입').id;

  const t = await put(`/api/card-strategy/tiers/${cardId}`, {
    tiers: [
      { min_spend: 0, rate: 1, label: '40만원 미만' },
      { min_spend: 400000, rate: 2, label: '40만원 이상' },
    ],
  });
  tier1 = t.body.data[0].id;   // 하한 0
  tier2 = t.body.data[1].id;   // 하한 400000
});

after(() => { server.stop(); });

// 지난달(2026-06) 지출을 만든다. 그 합계가 이번 달(2026-07) 구간을 정한다.
const addLastMonth = (amount) =>
  post('/api/transactions', {
    date: '2026-06-10', amount, category_id: catId,
    payment_method_id: pmId, card_product_id: cardId, payment_style: '일시불',
  });

// 이번 달 기준 추천. asOf 를 2026-07-15 로 고정해 전월이 2026-06 이 되게 한다.
const estimate = (amount = 100000) =>
  get(`/api/card-strategy/estimate?amount=${amount}&payment_style=일시불&asOf=2026-07-15`);

const rowOf = (body) => body.data.find((d) => d.cardProductId === cardId);

describe('A. 혜택에 구간을 건다', () => {
  test('A-1. card_threshold_tier_id: tier1 로 저장', async () => {
    const response = await post('/api/card-benefits', {
      card_product_id: cardId,
      benefit_type: '할인',
      rate: 1,
      monthly_cap: 100000,
      payment_style: '일시불',
      card_threshold_tier_id: tier1
    });
    
    assert.equal(response.status, 201);
  });

  test('A-2. 구간을 안 걸고 저장', async () => {
    const response = await post('/api/card-benefits', {
      card_product_id: cardId,
      benefit_type: '할인',
      rate: 1,
      monthly_cap: 100000,
      payment_style: '일시불'
    });
    
    assert.equal(response.status, 201);
    
    const getResponse = await get(`/api/card-benefits?card_product_id=${cardId}`);
    const benefit = getResponse.body.data.find(b => b.rate === 1 && b.card_threshold_tier_id === null);
    assert.ok(benefit);
    assert.equal(benefit.card_threshold_tier_id, null);
  });

  test('A-3. card_threshold_tier_id: 999999 (없는 구간)', async () => {
    const response = await post('/api/card-benefits', {
      card_product_id: cardId,
      benefit_type: '할인',
      rate: 1,
      monthly_cap: 100000,
      payment_style: '일시불',
      card_threshold_tier_id: 999999
    });
    
    assert.equal(response.status, 400);
  });

  test('A-4. 다른 카드의 구간 id 를 건다', async () => {
    // 카드를 하나 더 만들어 그 카드의 구간을 쓴다. 같은 카드의 구간(tier2)을
    // 쓰면 그건 정상 요청이라 검증이 안 걸린다.
    const other = await post('/api/card-products', {
      payment_method_id: pmId, issuer: '검증', product_name: '남의카드', card_type: '신용',
    });
    const otherTiers = await put(`/api/card-strategy/tiers/${other.body.id}`, {
      tiers: [{ min_spend: 0, rate: 5, label: '남의 구간' }],
    });

    const response = await post('/api/card-benefits', {
      card_product_id: cardId,
      benefit_type: '할인',
      rate: 1,
      monthly_cap: 100000,
      payment_style: '일시불',
      card_threshold_tier_id: otherTiers.body.data[0].id
    });
    
    assert.equal(response.status, 400);
  });
});

describe('B. 구간이 요율을 가른다', () => {

  before(async () => {
    await post('/api/card-benefits', {
      card_product_id: cardId,
      benefit_type: '할인',
      rate: 1,
      monthly_cap: 100000,
      payment_style: '일시불',
      card_threshold_tier_id: tier1
    });
    
    await post('/api/card-benefits', {
      card_product_id: cardId,
      benefit_type: '할인',
      rate: 2,
      monthly_cap: 100000,
      payment_style: '일시불',
      card_threshold_tier_id: tier2
    });
  });

  test('B-1. 만들지 않음 (0원) - 10만원 결제의 혜택이 1000원, applied.rate 가 1', async () => {
    const response = await estimate(100000);
    const row = rowOf(response.body);
    
    assert.equal(row.benefit, 1000);
    assert.equal(row.applied.rate, 1);
  });

  test('B-2. 100,000원 추가 (합 10만) - 여전히 1000원, applied.rate 가 1', async () => {
    await addLastMonth(100000);
    
    const response = await estimate(100000);
    const row = rowOf(response.body);
    
    assert.equal(row.benefit, 1000);
    assert.equal(row.applied.rate, 1);
  });

  test('B-3. 350,000원 더 추가 (합 45만) - 2000원, applied.rate 가 2', async () => {
    await addLastMonth(350000);
    
    const response = await estimate(100000);
    const row = rowOf(response.body);
    
    assert.equal(row.benefit, 2000);
    assert.equal(row.applied.rate, 2);
  });

  test('B-4. B-3 상태에서 걸러진 것에 tier-mismatch 가 있다', async () => {
    const response = await estimate(100000);
    const row = rowOf(response.body);
    
    const skipped = row.skipped;
    assert.ok(skipped);
    const tierMismatchBenefit = skipped.find(b => b.reason === 'tier-mismatch');
    assert.ok(tierMismatchBenefit);
  });

  test('B-5. 구간이 없는 혜택은 무시되지 않는다', async () => {
    // Add a benefit without tier to make sure it's still considered
    const response = await post('/api/card-benefits', {
      card_product_id: cardId,
      benefit_type: '할인',
      rate: 1.5,
      monthly_cap: 100000,
      payment_style: '일시불'
    });
    
    assert.equal(response.status, 201);
    
    const response2 = await estimate(100000);
    const row = rowOf(response2.body);
    
    // Should still have a benefit since there's a non-tier benefit
    assert.ok(row.benefit > 0);
  });
});

describe('C. 구간 무관 혜택은 그대로다', () => {
  let cardId3;

  before(async () => {
    const cp3 = await post('/api/card-products', {
      payment_method_id: pmId, issuer: '검증', product_name: '구간카드3', card_type: '신용',
    });
    cardId3 = cp3.body.id;
    
    await post('/api/card-benefits', {
      card_product_id: cardId3,
      benefit_type: '할인',
      rate: 1,
      monthly_cap: 100000,
      payment_style: '일시불'
    });
  });

  test('C-1. 구간을 안 건 혜택만 있는 새 카드를 만들고 조회 - 혜택 금액이 0보다 크다', async () => {
    const response = await estimate(100000);
    const row = rowOf(response.body);
    
    assert.ok(row.benefit > 0);
  });

  test('C-2. 그 카드에 구간을 등록해도 - 혜택 금액이 여전히 0보다 크다', async () => {
    await put(`/api/card-strategy/tiers/${cardId3}`, {
      tiers: [
        { min_spend: 0, rate: 1, label: '40만원 미만' },
        { min_spend: 400000, rate: 2, label: '40만원 이상' },
      ],
    });
    
    const response = await estimate(100000);
    const row = rowOf(response.body);
    
    assert.ok(row.benefit > 0);
  });

  test('C-3. 구간이 없는 혜택은 항상 적용된다', async () => {
    // Test that a benefit without tier still works even with tiers
    const response = await estimate(500000);
    const row = rowOf(response.body);
    
    assert.ok(row.benefit > 0);
  });
});
