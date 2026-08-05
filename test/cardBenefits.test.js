'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');
const path = require('node:path');
const os = require('node:os');

// 카드 혜택·청구 주기 라우트의 HTTP 테스트(#274).
//
// **DB_PATH 를 반드시 넘긴다.** 안 넘기면 src/server.js 가 data/finance.db 를 연다 —
// 실거래 데이터다. 이 저장소는 과거 2,212건 유실 사고가 있었고, 테스트가 실거래
// DB 를 여는 것은 그 사고와 같은 범주다. 서버를 띄우는 테스트를 새로 쓸 때
// 이 줄을 먼저 확인한다.

const PORT = 34627;
const BASE = `http://127.0.0.1:${PORT}`;
let server;
let dbPath;

async function api(method, url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* 본문이 JSON 이 아닐 수 있다 */ }
  return { status: res.status, body: json, text };
}

let pmId;
let catId;
let seq = 0;

// (payment_method_id, product_name) 이 UNIQUE 라 카드는 테스트마다 새로 만든다.
async function makeCard(over = {}) {
  seq += 1;
  return api('POST', '/api/card-products', {
    payment_method_id: pmId, issuer: '테스트카드사',
    product_name: `상품${seq}`, card_type: '신용', ...over,
  });
}

async function makeCardId(over) {
  const res = await makeCard(over);
  assert.equal(res.status, 201, `카드 생성 실패: ${res.text}`);
  return res.body.id;
}

function benefit(cardId, over = {}) {
  return { card_product_id: cardId, benefit_type: '할인', rate: 5, ...over };
}

before(async () => {
  server = await startTestServer({ port: PORT });
  dbPath = server.dbPath;

  const pms = await api('GET', '/api/payment-methods');
  const pmRows = Array.isArray(pms.body) ? pms.body : pms.body.data;
  pmId = pmRows[0].id;
  const cats = await api('GET', '/api/categories');
  const catRows = Array.isArray(cats.body) ? cats.body : cats.body.data;
  catId = catRows[0].id;
});

after(() => {
  if (server) server.stop();
});

test('A-1. 혜택을 만들면 201 이고 id 가 온다', async () => {
  const cardId = await makeCardId();
  const res = await api('POST', '/api/card-benefits', benefit(cardId));
  assert.equal(res.status, 201, `생성 실패: ${res.text}`);
  assert.ok(res.body.id, 'id 가 안 왔다');
});

test('A-2. 만든 혜택이 그 카드 목록에 나온다', async () => {
  const cardId = await makeCardId();
  await api('POST', '/api/card-benefits', benefit(cardId, { rate: 7, category_id: catId }));

  const list = await api('GET', `/api/card-benefits?card_product_id=${cardId}`);
  assert.equal(list.status, 200);
  assert.equal(list.body.data.length, 1);
  assert.equal(Number(list.body.data[0].rate), 7);
});

test('A-3. 카테고리를 안 주면 전 가맹점(null)이다', async () => {
  const cardId = await makeCardId();
  await api('POST', '/api/card-benefits', benefit(cardId));
  const list = await api('GET', `/api/card-benefits?card_product_id=${cardId}`);
  assert.equal(list.body.data[0].category_id, null);
});

test('A-4. 월 한도를 안 주면 무제한(null)이다', async () => {
  const cardId = await makeCardId();
  await api('POST', '/api/card-benefits', benefit(cardId));
  const list = await api('GET', `/api/card-benefits?card_product_id=${cardId}`);
  assert.equal(list.body.data[0].monthly_cap, null);
});

test('A-5. 최소 결제액을 안 주면 0 이다', async () => {
  // NULL 로 두면 비교할 때마다 NULL 처리를 해야 한다.
  const cardId = await makeCardId();
  await api('POST', '/api/card-benefits', benefit(cardId));
  const list = await api('GET', `/api/card-benefits?card_product_id=${cardId}`);
  assert.equal(Number(list.body.data[0].min_amount), 0);
});

test('A-6. 다른 카드의 혜택이 섞이지 않는다', async () => {
  const a = await makeCardId();
  const b = await makeCardId();
  await api('POST', '/api/card-benefits', benefit(a, { rate: 1 }));
  await api('POST', '/api/card-benefits', benefit(b, { rate: 2 }));

  const listA = await api('GET', `/api/card-benefits?card_product_id=${a}`);
  assert.equal(listA.body.data.length, 1);
  assert.equal(Number(listA.body.data[0].rate), 1);
});

test('B-1. 혜택 종류가 목록에 없으면 거부한다', async () => {
  const cardId = await makeCardId();
  const res = await api('POST', '/api/card-benefits', benefit(cardId, { benefit_type: '캐시백' }));
  assert.equal(res.status, 400);
  assert.ok(res.body.error, '사유가 비어 있다');
});

test('B-2. 비율이 100 을 넘으면 거부한다', async () => {
  const cardId = await makeCardId();
  const res = await api('POST', '/api/card-benefits', benefit(cardId, { rate: 101 }));
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('B-3. 비율이 음수면 거부한다', async () => {
  const cardId = await makeCardId();
  const res = await api('POST', '/api/card-benefits', benefit(cardId, { rate: -1 }));
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('B-4. 비율 0 은 받는다', async () => {
  // "이 카테고리에는 혜택 없음" 을 명시적으로 적어 두는 쓰임이 있다.
  // 안 적은 것과 없다고 적은 것은 다르다.
  const cardId = await makeCardId();
  const res = await api('POST', '/api/card-benefits', benefit(cardId, { rate: 0 }));
  assert.equal(res.status, 201, res.text);
});

test('B-5. 비율 100 은 받는다', async () => {
  const cardId = await makeCardId();
  const res = await api('POST', '/api/card-benefits', benefit(cardId, { rate: 100 }));
  assert.equal(res.status, 201, res.text);
});

test('B-6. 없는 카드로는 만들 수 없다', async () => {
  const res = await api('POST', '/api/card-benefits', benefit(999999));
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('B-7. 월 한도가 음수면 거부한다', async () => {
  const cardId = await makeCardId();
  const res = await api('POST', '/api/card-benefits', benefit(cardId, { monthly_cap: -100 }));
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('B-8. 최소 결제액이 음수면 거부한다', async () => {
  const cardId = await makeCardId();
  const res = await api('POST', '/api/card-benefits', benefit(cardId, { min_amount: -1 }));
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('C-1. 비율을 고치면 반영된다', async () => {
  const cardId = await makeCardId();
  const made = await api('POST', '/api/card-benefits', benefit(cardId, { rate: 3 }));

  const put = await api('PUT', `/api/card-benefits/${made.body.id}`, { rate: 9 });
  assert.equal(put.status, 200, put.text);

  const list = await api('GET', `/api/card-benefits?card_product_id=${cardId}`);
  assert.equal(Number(list.body.data[0].rate), 9);
});

test('C-2. 안 보낸 필드는 기존 값을 잇는다', async () => {
  // 일부만 보내는 호출부가 안 보낸 값을 기본값으로 덮으면 사용자가 적어 둔
  // 한도가 조용히 사라진다.
  const cardId = await makeCardId();
  const made = await api('POST', '/api/card-benefits', benefit(cardId, { monthly_cap: 20000, min_amount: 5000 }));

  await api('PUT', `/api/card-benefits/${made.body.id}`, { rate: 9 });

  const row = (await api('GET', `/api/card-benefits?card_product_id=${cardId}`)).body.data[0];
  assert.equal(Number(row.monthly_cap), 20000);
  assert.equal(Number(row.min_amount), 5000);
});

test('C-3. 수정에서도 비율 범위를 본다', async () => {
  const cardId = await makeCardId();
  const made = await api('POST', '/api/card-benefits', benefit(cardId));
  const res = await api('PUT', `/api/card-benefits/${made.body.id}`, { rate: 101 });
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('C-4. 지우면 목록에서 사라진다', async () => {
  const cardId = await makeCardId();
  const made = await api('POST', '/api/card-benefits', benefit(cardId));

  assert.equal((await api('DELETE', `/api/card-benefits/${made.body.id}`)).status, 200);
  const list = await api('GET', `/api/card-benefits?card_product_id=${cardId}`);
  assert.equal(list.body.data.length, 0);
});

test('C-5. 없는 혜택을 지우면 404', async () => {
  const res = await api('DELETE', '/api/card-benefits/999999');
  assert.equal(res.status, 404);
});

test('D-1. 청구 주기를 넣으면 그대로 돌아온다', async () => {
  const cardId = await makeCardId({
    prev_month_threshold: 300000, billing_cycle_day: 14, statement_close_day: 1,
  });
  const list = await api('GET', `/api/card-products?payment_method_id=${pmId}`);
  const card = list.body.data.find((c) => c.id === cardId);
  assert.equal(Number(card.prev_month_threshold), 300000);
  assert.equal(Number(card.billing_cycle_day), 14);
  assert.equal(Number(card.statement_close_day), 1);
});

test('D-2. 결제일이 0 이면 거부한다', async () => {
  const res = await makeCard({ billing_cycle_day: 0 });
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('D-3. 결제일이 32 면 거부한다', async () => {
  const res = await makeCard({ billing_cycle_day: 32 });
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('D-4. 마감일이 32 면 거부한다', async () => {
  const res = await makeCard({ statement_close_day: 32 });
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('D-5. 전월 실적 기준액이 음수면 거부한다', async () => {
  const res = await makeCard({ prev_month_threshold: -1 });
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('D-6. 셋 다 생략하면 비워 둔다', async () => {
  // 모르는 값을 0 이나 1 로 채우면 전월 실적과 청구월 계산이 틀린 답을 낸다.
  const cardId = await makeCardId();
  const list = await api('GET', `/api/card-products?payment_method_id=${pmId}`);
  const card = list.body.data.find((c) => c.id === cardId);
  assert.equal(card.prev_month_threshold, null);
  assert.equal(card.billing_cycle_day, null);
  assert.equal(card.statement_close_day, null);
});

test('D-7. 수정에서도 결제일 범위를 본다', async () => {
  const cardId = await makeCardId({ billing_cycle_day: 14 });
  const res = await api('PUT', `/api/card-products/${cardId}`, { billing_cycle_day: 40 });
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});
