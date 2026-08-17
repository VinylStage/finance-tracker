'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

// 카드 실적 구간과 거래별 실적 제외(#526).
//
// 구간이 없으면 단일 임계값으로 예전처럼 판정한다 — 그 하위호환도 함께 잠근다.

const PORT = 21010;
let server;
let cardId;

async function json(pathname, options) {
  const r = await fetch(`${server.base}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return { status: r.status, body: await r.json() };
}

const put = (p, body) => json(p, { method: 'PUT', body: JSON.stringify(body) });
const post = (p, body) => json(p, { method: 'POST', body: JSON.stringify(body) });
const del = (p) => json(p, { method: 'DELETE' });

before(async () => {
  server = await startTestServer({ port: PORT });
  const pm = await post('/api/payment-methods', { name: '하나카드', type: '신용' });
  const cp = await post('/api/card-products', {
    payment_method_id: pm.body.id, issuer: '하나', product_name: 'A', card_type: '신용',
  });
  cardId = cp.body.id;
});

after(() => {
  server.stop();
});

describe('A. 구간 저장과 조회', () => {
  test('A-1. 구간을 저장하면 200이고 응답 body.data 길이가 2다', async () => {
    const response = await put(`/api/card-strategy/tiers/${cardId}`, {
      tiers: [
        { min_spend: 0, rate: 0.5 },
        { min_spend: 400000, rate: 1.5, label: '40만' }
      ]
    });
    
    assert.equal(response.status, 200);
    assert.equal(response.body.data.length, 2);
  });

  test('A-2. 저장한 구간을 조회하면 min_spend 오름차순이다', async () => {
    const response = await json(`/api/card-strategy/tiers/${cardId}`);
    
    assert.equal(response.status, 200);
    assert.equal(response.body.data[0].min_spend, 0);
    assert.equal(response.body.data[1].min_spend, 400000);
  });

  test('A-3. 같은 경로에 PUT하면 통째로 교체돼 body.data 길이가 1 이다', async () => {
    const response = await put(`/api/card-strategy/tiers/${cardId}`, {
      tiers: [
        { min_spend: 0, rate: 1.0 }
      ]
    });
    
    assert.equal(response.status, 200);
    assert.equal(response.body.data.length, 1);
  });
});

describe('B. 잘못된 구간은 저장하지 않는다', () => {
  test('B-1. 같은 min_spend가 두 번 들어오면 400이다', async () => {
    const response = await put(`/api/card-strategy/tiers/${cardId}`, {
      tiers: [
        { min_spend: 0, rate: 0.5 },
        { min_spend: 0, rate: 1.5 }
      ]
    });
    
    assert.equal(response.status, 400);
  });

  test('B-2. min_spend가 음수면 400이다', async () => {
    const response = await put(`/api/card-strategy/tiers/${cardId}`, {
      tiers: [
        { min_spend: -100000, rate: 0.5 }
      ]
    });
    
    assert.equal(response.status, 400);
  });

  test('B-3. rate가 음수면 400이다', async () => {
    const response = await put(`/api/card-strategy/tiers/${cardId}`, {
      tiers: [
        { min_spend: 0, rate: -0.5 }
      ]
    });
    
    assert.equal(response.status, 400);
  });
});

describe('C. 실적 제외', () => {
  test('C-1. 없는 거래 id로 POST하면 404이다', async () => {
    const response = await post('/api/card-strategy/exclusions', {
      transaction_id: 999999
    });
    
    assert.equal(response.status, 404);
  });

  test('C-2. transaction_id가 없으면 400이다', async () => {
    const response = await post('/api/card-strategy/exclusions', {});
    
    assert.equal(response.status, 400);
  });

  test('C-3. 없는 거래 id로 DELETE하면 200이고 body.restored가 0이다', async () => {
    const response = await del('/api/card-strategy/exclusions/999999');
    
    assert.equal(response.status, 200);
    assert.equal(response.body.restored, 0);
  });
});
