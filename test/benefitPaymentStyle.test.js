'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const PORT = 35052;
let server;
let pmId, cardId;

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
  const pm = await post('/api/payment-methods', { name: '검증카드사', type: '신용' });
  pmId = pm.body.id;
  const cp = await post('/api/card-products', {
    payment_method_id: pmId, issuer: '검증', product_name: '검증카드', card_type: '신용',
  });
  cardId = cp.body.id;
});

after(() => { server.stop(); });

describe('A. 혜택 저장', () => {
  test('A-1. payment_style 없이 저장하면 status 201이다', async () => {
    const response = await post('/api/card-benefits', {
      card_product_id: cardId,
      benefit_type: '적립',
      rate: 10,
    });
    
    assert.strictEqual(response.status, 201);
  });

  test('A-2. A-1 을 조회하면 그 혜택의 payment_style 이 null이다', async () => {
    const created = await post('/api/card-benefits', {
      card_product_id: cardId,
      benefit_type: '적립',
      rate: 10,
    });
    
    const list = await get(`/api/card-benefits?card_product_id=${cardId}`);
    const row = list.body.data.find((b) => b.id === created.body.id);
    assert.strictEqual(row.payment_style, null);
  });

  test('A-3. payment_style: "일시불" 로 저장하면 status 201이고 조회하면 "일시불"이다', async () => {
    const response = await post('/api/card-benefits', {
      card_product_id: cardId,
      benefit_type: '적립',
      rate: 10,
      payment_style: '일시불'
    });
    
    assert.strictEqual(response.status, 201);
    
    const list = await get(`/api/card-benefits?card_product_id=${cardId}`);
    const row = list.body.data.find((b) => b.id === response.body.id);
    assert.strictEqual(row.payment_style, '일시불');
  });

  test('A-4. payment_style: "할부" 로 저장하면 status 201이다', async () => {
    const response = await post('/api/card-benefits', {
      card_product_id: cardId,
      benefit_type: '적립',
      rate: 10,
      payment_style: '할부'
    });
    
    assert.strictEqual(response.status, 201);
  });

  test('A-5. payment_style: "" (빈 문자열) 로 저장하면 status 201이고 조회하면 null이다', async () => {
    const response = await post('/api/card-benefits', {
      card_product_id: cardId,
      benefit_type: '적립',
      rate: 10,
      payment_style: ''
    });
    
    assert.strictEqual(response.status, 201);
    
    const list = await get(`/api/card-benefits?card_product_id=${cardId}`);
    const row = list.body.data.find((b) => b.id === response.body.id);
    assert.strictEqual(row.payment_style, null);
  });

  test('A-6. payment_style: "없는방식" 으로 저장하면 status 400이다', async () => {
    const response = await post('/api/card-benefits', {
      card_product_id: cardId,
      benefit_type: '적립',
      rate: 10,
      payment_style: '없는방식'
    });
    
    assert.strictEqual(response.status, 400);
  });

  test('A-7. payment_style: "리볼빙" — 허용 목록에 있다 로 저장하면 status 201이다', async () => {
    const response = await post('/api/card-benefits', {
      card_product_id: cardId,
      benefit_type: '적립',
      rate: 10,
      payment_style: '리볼빙'
    });
    
    assert.strictEqual(response.status, 201);
  });
});

describe('B. 혜택 수정', () => {
  test('B-1. 제약 없던 혜택에 payment_style: "일시불" 을 넣는다 status 200이고 조회하면 "일시불"이다', async () => {
    const created = await post('/api/card-benefits', {
      card_product_id: cardId,
      benefit_type: '적립',
      rate: 10,
    });
    
    const response = await put(`/api/card-benefits/${created.body.id}`, {
      payment_style: '일시불'
    });
    
    assert.strictEqual(response.status, 200);
    
    const list = await get(`/api/card-benefits?card_product_id=${cardId}`);
    const row = list.body.data.find((b) => b.id === created.body.id);
    assert.strictEqual(row.payment_style, '일시불');
  });

  test('B-2. 제약이 있던 혜택에서 payment_style: "" 로 지운다 status 200이고 조회하면 null이다', async () => {
    const created = await post('/api/card-benefits', {
      card_product_id: cardId,
      benefit_type: '적립',
      rate: 10,
      payment_style: '일시불'
    });
    
    const response = await put(`/api/card-benefits/${created.body.id}`, {
      payment_style: ''
    });
    
    assert.strictEqual(response.status, 200);
    
    const list = await get(`/api/card-benefits?card_product_id=${cardId}`);
    const row = list.body.data.find((b) => b.id === created.body.id);
    assert.strictEqual(row.payment_style, null);
  });

  test('B-3. 수정 요청에 payment_style 을 아예 안 보낸다 status 200이고 기존 값이 그대로 남는다', async () => {
    const created = await post('/api/card-benefits', {
      card_product_id: cardId,
      benefit_type: '적립',
      rate: 10,
      payment_style: '일시불'
    });
    
    const response = await put(`/api/card-benefits/${created.body.id}`, {
      rate: 15
    });
    
    assert.strictEqual(response.status, 200);
    
    const list = await get(`/api/card-benefits?card_product_id=${cardId}`);
    const row = list.body.data.find((b) => b.id === created.body.id);
    assert.strictEqual(row.payment_style, '일시불');
  });

  test('B-4. payment_style: "없는방식" 으로 수정하면 status 400이다', async () => {
    const created = await post('/api/card-benefits', {
      card_product_id: cardId,
      benefit_type: '적립',
      rate: 10,
    });
    
    const response = await put(`/api/card-benefits/${created.body.id}`, {
      payment_style: '없는방식'
    });
    
    assert.strictEqual(response.status, 400);
  });
});

describe('C. 계산에 실제로 반영되는가', () => {
  test('C-1. 제약 없는 혜택(적립 10%)만 있는 카드에 payment_style=일시불 로 조회하면 그 카드의 혜택 금액이 0보다 크다', async () => {
    const cp = await post('/api/card-products', {
      payment_method_id: pmId, issuer: '검증', product_name: '검증카드-1', card_type: '신용',
    });
    
    await post('/api/card-benefits', {
      card_product_id: cp.body.id,
      benefit_type: '적립',
      rate: 10,
    });
    
    const est = await get(`/api/card-strategy/estimate?amount=100000&payment_style=일시불`);
    const row = est.body.data.find((d) => d.cardProductId === cp.body.id);
    assert.strictEqual(row.benefit > 0, true);
  });

  test('C-2. 같은 상태에서 payment_style=할부 로 조회하면 혜택 금액이 여전히 0보다 크다 — 제약이 없으면 가리지 않는다', async () => {
    const cp = await post('/api/card-products', {
      payment_method_id: pmId, issuer: '검증', product_name: '검증카드-2', card_type: '신용',
    });
    
    await post('/api/card-benefits', {
      card_product_id: cp.body.id,
      benefit_type: '적립',
      rate: 10,
    });
    
    const est = await get(`/api/card-strategy/estimate?amount=100000&payment_style=할부`);
    const row = est.body.data.find((d) => d.cardProductId === cp.body.id);
    assert.strictEqual(row.benefit > 0, true);
  });

  test('C-3. 혜택에 payment_style: "일시불" 을 걸고 payment_style=일시불 로 조회하면 혜택 금액이 0보다 크다', async () => {
    const cp = await post('/api/card-products', {
      payment_method_id: pmId, issuer: '검증', product_name: '검증카드-3', card_type: '신용',
    });
    
    await post('/api/card-benefits', {
      card_product_id: cp.body.id,
      benefit_type: '적립',
      rate: 10,
      payment_style: '일시불'
    });
    
    const est = await get(`/api/card-strategy/estimate?amount=100000&payment_style=일시불`);
    const row = est.body.data.find((d) => d.cardProductId === cp.body.id);
    assert.strictEqual(row.benefit > 0, true);
  });

  test('C-4. 같은 혜택에 payment_style=할부 로 조회하면 혜택 금액이 0 이다', async () => {
    const cp = await post('/api/card-products', {
      payment_method_id: pmId, issuer: '검증', product_name: '검증카드-4', card_type: '신용',
    });
    
    await post('/api/card-benefits', {
      card_product_id: cp.body.id,
      benefit_type: '적립',
      rate: 10,
      payment_style: '일시불'
    });
    
    const est = await get(`/api/card-strategy/estimate?amount=100000&payment_style=할부`);
    const row = est.body.data.find((d) => d.cardProductId === cp.body.id);
    assert.strictEqual(row.benefit, 0);
  });

  test('C-5. 같은 혜택에 payment_style 을 안 주고 조회하면 혜택 금액이 0 이다 — 모르면 안 붙인다', async () => {
    const cp = await post('/api/card-products', {
      payment_method_id: pmId, issuer: '검증', product_name: '검증카드-5', card_type: '신용',
    });
    
    await post('/api/card-benefits', {
      card_product_id: cp.body.id,
      benefit_type: '적립',
      rate: 10,
      payment_style: '일시불'
    });
    
    const est = await get(`/api/card-strategy/estimate?amount=100000`);
    const row = est.body.data.find((d) => d.cardProductId === cp.body.id);
    assert.strictEqual(row.benefit, 0);
  });

  test('C-6. 혜택에 payment_style: "할부" 을 걸고 payment_style=할부 로 조회하면 혜택 금액이 0보다 크다', async () => {
    const cp = await post('/api/card-products', {
      payment_method_id: pmId, issuer: '검증', product_name: '검증카드-6', card_type: '신용',
    });
    
    await post('/api/card-benefits', {
      card_product_id: cp.body.id,
      benefit_type: '적립',
      rate: 10,
      payment_style: '할부'
    });
    
    const est = await get(`/api/card-strategy/estimate?amount=100000&payment_style=할부`);
    const row = est.body.data.find((d) => d.cardProductId === cp.body.id);
    assert.strictEqual(row.benefit > 0, true);
  });

  test('C-7. 혜택에 payment_style: "할부" 을 걸고 payment_style=일시불 로 조회하면 혜택 금액이 0 이다', async () => {
    const cp = await post('/api/card-products', {
      payment_method_id: pmId, issuer: '검증', product_name: '검증카드-7', card_type: '신용',
    });
    
    await post('/api/card-benefits', {
      card_product_id: cp.body.id,
      benefit_type: '적립',
      rate: 10,
      payment_style: '할부'
    });
    
    const est = await get(`/api/card-strategy/estimate?amount=100000&payment_style=일시불`);
    const row = est.body.data.find((d) => d.cardProductId === cp.body.id);
    assert.strictEqual(row.benefit, 0);
  });
});
