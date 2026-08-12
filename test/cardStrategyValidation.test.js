'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const PORT = 35044;
let server;
let cardId;
let txId;

async function json(pathname, options) {
  const r = await fetch(`${server.base}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return { status: r.status, body: await r.json() };
}
const get = (p) => json(p);
const put = (p, body) => json(p, { method: 'PUT', body: JSON.stringify(body) });
const post = (p, body) => json(p, { method: 'POST', body: JSON.stringify(body) });

before(async () => {
  server = await startTestServer({ port: PORT });
  const pm = await post('/api/payment-methods', { name: '하나카드', type: '신용' });
  const cp = await post('/api/card-products', {
    payment_method_id: pm.body.id, issuer: '하나', product_name: 'A', card_type: '신용',
  });
  cardId = cp.body.id;
  // 카테고리는 새로 만들지 않는다. 초기 데이터에 기본 카테고리가 이미 들어 있어서
  // 같은 이름으로 넣으면 500 이 난다. 있는 것 중 하나를 골라 쓴다.
  const cats = await get('/api/categories');
  const cat = cats.body.find((c) => c.major_type !== '수입');
  const tx = await post('/api/transactions', {
    date: '2026-07-15', amount: 10000, category_id: cat.id, payment_method_id: pm.body.id,
  });
  txId = tx.body.id;
});

after(() => { server.stop(); });

describe('A. 구간 조회 GET /api/card-strategy/tiers/:cardProductId', () => {
  test('A-1. 카드 id 자리에 `abc`', async () => {
    const response = await get(`/api/card-strategy/tiers/abc`);
    assert.strictEqual(response.status, 400);
  });

  test('A-2. 없는 카드 id `999999`', async () => {
    const response = await get(`/api/card-strategy/tiers/999999`);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.data.length, 0);
  });
  
  test('A-3. 유효한 카드 id로 조회', async () => {
    const response = await get(`/api/card-strategy/tiers/${cardId}`);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.data.length, 0);
  });
  
  test('A-4. 헤더에 Content-Type이 없을 때', async () => {
    const r = await fetch(`${server.base}/api/card-strategy/tiers/${cardId}`);
    assert.strictEqual(r.status, 200);
  });
  
  test('A-5. 잘못된 날짜 형식으로 조회', async () => {
    const response = await get(`/api/card-strategy/tiers/123abc`);
    assert.strictEqual(response.status, 400);
  });
  
  test('A-6. 유효한 카드 id로 조회 후 구간 저장 후 다시 조회', async () => {
    // 먼저 구간 저장
    const putResponse = await put(`/api/card-strategy/tiers/${cardId}`, {
      tiers: [
        { min_spend: 0, rate: 0.5 },
        { min_spend: 400000, rate: 1.5 }
      ]
    });
    assert.strictEqual(putResponse.status, 200);
    
    // 저장 후 다시 조회
    const getResponse = await get(`/api/card-strategy/tiers/${cardId}`);
    assert.strictEqual(getResponse.status, 200);
    assert.strictEqual(getResponse.body.data.length, 2);
  });
});

describe('B. 구간 저장 PUT /api/card-strategy/tiers/:cardProductId', () => {
  test('B-1. 카드 id 자리에 `abc`, body `{ tiers: [] }`', async () => {
    const response = await put(`/api/card-strategy/tiers/abc`, { tiers: [] });
    assert.strictEqual(response.status, 400);
  });

  test('B-2. 없는 카드 `999999`, body `{ tiers: [] }`', async () => {
    const response = await put(`/api/card-strategy/tiers/999999`, { tiers: [] });
    assert.strictEqual(response.status, 404);
  });

  test('B-3. 있는 카드, body 에 `tiers` 가 아예 없음 `{}`', async () => {
    const response = await put(`/api/card-strategy/tiers/${cardId}`, {});
    assert.strictEqual(response.status, 400);
  });

  test('B-4. 있는 카드, `tiers` 가 배열이 아님 `{ tiers: "abc" }`', async () => {
    const response = await put(`/api/card-strategy/tiers/${cardId}`, { tiers: 'abc' });
    assert.strictEqual(response.status, 400);
  });

  test('B-5. 있는 카드, `tiers` 가 `null`', async () => {
    const response = await put(`/api/card-strategy/tiers/${cardId}`, { tiers: null });
    assert.strictEqual(response.status, 400);
  });

  test('B-5b. 있는 카드, `tiers` 가 **숫자** `{ tiers: 123 }`', async () => {
    const response = await put(`/api/card-strategy/tiers/${cardId}`, { tiers: 123 });
    assert.strictEqual(response.status, 400);
  });

  test('B-5c. 있는 카드, `tiers` 가 **객체** `{ tiers: { a: 1 } }`', async () => {
    const response = await put(`/api/card-strategy/tiers/${cardId}`, { tiers: { a: 1 } });
    assert.strictEqual(response.status, 400);
  });

  test('B-6. 있는 카드, `{ tiers: [] }` — 빈 배열은 **정상**이다(구간 전부 지우기)', async () => {
    const response = await put(`/api/card-strategy/tiers/${cardId}`, { tiers: [] });
    assert.strictEqual(response.status, 200);
  });
  
  test('B-7. 유효한 구간 데이터 저장', async () => {
    const response = await put(`/api/card-strategy/tiers/${cardId}`, {
      tiers: [
        { min_spend: 0, rate: 0.5 },
        { min_spend: 400000, rate: 1.5 }
      ]
    });
    assert.strictEqual(response.status, 200);
  });
  
  test('B-8. 중복된 min_spend 값으로 저장 시도', async () => {
    const response = await put(`/api/card-strategy/tiers/${cardId}`, {
      tiers: [
        { min_spend: 0, rate: 0.5 },
        { min_spend: 0, rate: 1.5 }
      ]
    });
    assert.strictEqual(response.status, 400);
  });
  
  test('B-9. 음수 min_spend로 저장 시도', async () => {
    const response = await put(`/api/card-strategy/tiers/${cardId}`, {
      tiers: [
        { min_spend: -100000, rate: 0.5 }
      ]
    });
    assert.strictEqual(response.status, 400);
  });
  
  test('B-10. 음수 rate로 저장 시도', async () => {
    const response = await put(`/api/card-strategy/tiers/${cardId}`, {
      tiers: [
        { min_spend: 0, rate: -0.5 }
      ]
    });
    assert.strictEqual(response.status, 400);
  });
});

describe('C. 실적 제외 POST /api/card-strategy/exclusions', () => {
  test('C-1. body 가 `{}` — `transaction_id` 없음', async () => {
    const response = await post(`/api/card-strategy/exclusions`, {});
    assert.strictEqual(response.status, 400);
  });

  test('C-2. `transaction_id` 가 `abc`', async () => {
    const response = await post(`/api/card-strategy/exclusions`, { transaction_id: 'abc' });
    assert.strictEqual(response.status, 400);
  });

  test('C-3. 없는 거래 `{ transaction_id: 999999 }`', async () => {
    const response = await post(`/api/card-strategy/exclusions`, { transaction_id: 999999 });
    assert.strictEqual(response.status, 404);
  });

  test('C-4. 있는 거래 `{ transaction_id: txId }`', async () => {
    const response = await post(`/api/card-strategy/exclusions`, { transaction_id: txId });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.ok, true);
  });

  test('C-5. C-4 를 **한 번 더** 보낸다', async () => {
    const response = await post(`/api/card-strategy/exclusions`, { transaction_id: txId });
    assert.strictEqual(response.status, 200);
  });

  test('C-6. 있는 거래에 `{ transaction_id: txId, reason: "상품권 구매" }`', async () => {
    const response = await post(`/api/card-strategy/exclusions`, { transaction_id: txId, reason: '상품권 구매' });
    assert.strictEqual(response.status, 200);
  });

  test('C-7. DELETE /api/card-strategy/exclusions/:transactionId', async () => {
    const response = await post(`/api/card-strategy/exclusions`, { transaction_id: txId });
    assert.strictEqual(response.status, 200);
    
    const deleteResponse = await fetch(`${server.base}/api/card-strategy/exclusions/${txId}`, {
      method: 'DELETE'
    });
    assert.strictEqual(deleteResponse.status, 200);
  });

  test('C-8. DELETE with non-existent transaction', async () => {
    const response = await fetch(`${server.base}/api/card-strategy/exclusions/999999`, {
      method: 'DELETE'
    });
    assert.strictEqual(response.status, 200);
  });
  
  test('C-9. 빈 reason으로 제외 요청', async () => {
    const response = await post(`/api/card-strategy/exclusions`, { transaction_id: txId, reason: '' });
    assert.strictEqual(response.status, 200);
  });
  
  test('C-10. 너무 긴 reason으로 제외 요청', async () => {
    const longReason = 'a'.repeat(256);
    const response = await post(`/api/card-strategy/exclusions`, { transaction_id: txId, reason: longReason });
    assert.strictEqual(response.status, 200);
  });
  
  test('C-11. 제외된 거래가 다시 포함되는지 확인', async () => {
    // 먼저 제외
    const excludeResponse = await post(`/api/card-strategy/exclusions`, { transaction_id: txId });
    assert.strictEqual(excludeResponse.status, 200);
    
    // 삭제로 복구
    const deleteResponse = await fetch(`${server.base}/api/card-strategy/exclusions/${txId}`, {
      method: 'DELETE'
    });
    assert.strictEqual(deleteResponse.status, 200);
    
    // 다시 제외 확인
    const reExcludeResponse = await post(`/api/card-strategy/exclusions`, { transaction_id: txId });
    assert.strictEqual(reExcludeResponse.status, 200);
  });
});
