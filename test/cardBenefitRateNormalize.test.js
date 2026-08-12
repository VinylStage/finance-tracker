'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const PORT = 34715;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

async function api(method, url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* JSON 이 아닐 수 있다 */ }
  return { status: res.status, body: json, text };
}

let pmId;
let seq = 0;

// (payment_method_id, product_name) 이 UNIQUE 라 카드는 테스트마다 새로 만든다.
async function makeCardId() {
  seq += 1;
  const res = await api('POST', '/api/card-products', {
    payment_method_id: pmId, issuer: '테스트카드사',
    product_name: `상품${seq}`, card_type: '신용',
  });
  assert.equal(res.status, 201, `카드 생성 실패: ${res.text}`);
  return res.body.id;
}

// 그 카드의 혜택 목록. 만든 순서와 무관하게 서버가 준 순서 그대로다.
async function listOf(cardId) {
  const res = await api('GET', `/api/card-benefits?card_product_id=${cardId}`);
  assert.equal(res.status, 200, res.text);
  return res.body.data;
}

const FLAT = {
  kind: 'flat_monthly',
  tiers: [{ min_spend: 300000, amount: 3000, label: null }],
};

before(async () => {
  server = await startTestServer({ port: PORT });
  const pms = await api('GET', '/api/payment-methods');
  const rows = Array.isArray(pms.body) ? pms.body : pms.body.data;
  pmId = rows[0].id;
});

after(() => {
  if (server) server.stop();
});

test('1. 정액구간형으로 만들면 rate 가 0 으로 저장된다', async () => {
  const cardId = await makeCardId();
  const res = await api('POST', '/api/card-benefits', {
    card_product_id: cardId, benefit_type: '할인', rate: 5, rule: FLAT,
  });
  assert.equal(res.status, 201, res.text);
  const [row] = await listOf(cardId);
  assert.equal(row.rate, 0);
});

test('2. 규칙을 지우면 그때 보낸 요율이 산다', async () => {
  const cardId = await makeCardId();
  const made = await api('POST', '/api/card-benefits', {
    card_product_id: cardId, benefit_type: '할인', rate: 5, rule: FLAT,
  });
  assert.equal(made.status, 201, made.text);
  
  const res = await api('PUT', `/api/card-benefits/${made.body.id}`, {
    rule: null, rate: 2.5,
  });
  assert.equal(res.status, 200, res.text);
  
  const [row] = await listOf(cardId);
  assert.equal(row.rate, 2.5);
  assert.equal(row.rule_json, null);
});

test('3. 요율형은 보낸 요율이 그대로 저장된다', async () => {
  const cardId = await makeCardId();
  const res = await api('POST', '/api/card-benefits', {
    card_product_id: cardId, benefit_type: '할인', rate: 1.5,
  });
  assert.equal(res.status, 201, res.text);
  
  const [row] = await listOf(cardId);
  assert.equal(row.rate, 1.5);
  assert.equal(row.rule_json, null);
});

test('4. 규칙을 안 보낸 부분 수정은 규칙도 rate 도 지킨다', async () => {
  const cardId = await makeCardId();
  const made = await api('POST', '/api/card-benefits', {
    card_product_id: cardId, benefit_type: '할인', rate: 5, rule: FLAT,
  });
  assert.equal(made.status, 201, made.text);
  
  const res = await api('PUT', `/api/card-benefits/${made.body.id}`, {
    memo: 'updated memo',
  });
  assert.equal(res.status, 200, res.text);
  
  const [row] = await listOf(cardId);
  assert.equal(JSON.parse(row.rule_json).kind, 'flat_monthly');
  assert.equal(row.rate, 0);
  assert.equal(row.memo, 'updated memo');
});

test('5. 목록은 요율형을 먼저 준다', async () => {
  const cardId = await makeCardId();
  // Create benefits in specific order to test sorting
  await api('POST', '/api/card-benefits', {
    card_product_id: cardId, benefit_type: '할인', rate: 1.0,
  });
  await api('POST', '/api/card-benefits', {
    card_product_id: cardId, benefit_type: '할인', rate: 3.0,
  });
  // Create a rule-based benefit
  const res = await api('POST', '/api/card-benefits', {
    card_product_id: cardId, benefit_type: '할인', rate: 0, rule: FLAT,
  });
  assert.equal(res.status, 201, res.text);
  
  const rows = await listOf(cardId);
  assert.equal(rows.length, 3);
  // Check that rate-based benefits come first (higher rates first)
  assert.equal(rows[0].rate, 3);
  assert.equal(rows[1].rate, 1);
  // The rule-based benefit should be last
  assert.ok(rows[2].rule_json, '정액구간형이 마지막이어야 한다');
});

test('6. 같은 요율이면 id 순이다', async () => {
  const cardId = await makeCardId();
  await api('POST', '/api/card-benefits', {
    card_product_id: cardId, benefit_type: '할인', rate: 2.0,
  });
  await api('POST', '/api/card-benefits', {
    card_product_id: cardId, benefit_type: '할인', rate: 2.0,
  });
  await api('POST', '/api/card-benefits', {
    card_product_id: cardId, benefit_type: '할인', rate: 2.0,
  });
  
  const ids = (await listOf(cardId)).map((r) => r.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
});

test('7. 카드를 안 고른 전체 조회에서도 같은 순서다', async () => {
  const cardId = await makeCardId();
  // Create benefits in specific order to test sorting
  await api('POST', '/api/card-benefits', {
    card_product_id: cardId, benefit_type: '할인', rate: 1.0,
  });
  await api('POST', '/api/card-benefits', {
    card_product_id: cardId, benefit_type: '할인', rate: 3.0,
  });
  // Create a rule-based benefit
  const res = await api('POST', '/api/card-benefits', {
    card_product_id: cardId, benefit_type: '할인', rate: 0, rule: FLAT,
  });
  assert.equal(res.status, 201, res.text);
  
  const all = await api('GET', '/api/card-benefits');
  const mine = all.body.data.filter((r) => r.card_product_id === cardId);
  assert.equal(mine.length, 3);
  assert.equal(mine[0].rate, 3);
  assert.ok(mine[2].rule_json);
});

test('8. 모르는 유형은 저장되지 않는다', async () => {
  const cardId = await makeCardId();
  const res = await api('POST', '/api/card-benefits', {
    card_product_id: cardId, benefit_type: '할인',
    rule: { kind: 'flat_montly', tiers: [] }, // 오타
  });
  assert.equal(res.status, 400);
});

// 요율 0 인 요율형이 정액구간형보다 위에 온다.
//
// 5번만으로는 «유형끼리 묶는 것» 과 «요율로만 줄 세우는 것» 이 구분되지 않는다.
// 정액구간형은 rate 가 0 이라 어느 쪽이든 맨 아래로 가기 때문이다. 요율형에도
// 0 을 하나 두면 그때 갈린다 — 묶으면 그 0% 가 위, 안 묶으면 id 순으로 섞인다.
//
// 요율 0 은 실제로 쓰는 값이다. «이 카테고리에는 혜택 없음» 을 적어 두는 자리다.
test('9. 요율 0 인 요율형이 정액구간형보다 위에 온다', async () => {
  const cardId = await makeCardId();
  const flat = await api('POST', '/api/card-benefits', {
    card_product_id: cardId, benefit_type: '할인', rate: 0, rule: FLAT,
  });
  assert.equal(flat.status, 201, flat.text);
  const zero = await api('POST', '/api/card-benefits', {
    card_product_id: cardId, benefit_type: '할인', rate: 0,
  });
  assert.equal(zero.status, 201, zero.text);

  const rows = await listOf(cardId);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].rule_json, null, '요율형이 먼저여야 한다');
  assert.ok(rows[1].rule_json, '정액구간형이 뒤여야 한다');
});
