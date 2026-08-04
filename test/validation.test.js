// 서버 기동은 공용 헬퍼가 맣는다(#379). 조기 종료를 즉시 감지한다.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const PORT = 34597; // 다른 테스트와 충돌 안 나게 임의 포트 사용
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
});

after(() => {
  if (server) server.stop();
});

test('POST /api/transactions - 허용되지 않은 payment_style은 400', async () => {
  const categoriesResp = await fetch(`${BASE}/api/categories`);
  const categories = await categoriesResp.json();
  const categoryId = categories[0].id;

  const resp = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: '2026-01-15', category_id: categoryId, amount: 1000, payment_style: '없는값' })
  });
  assert.strictEqual(resp.status, 400);
  const body = await resp.json();
  assert.match(body.error, /payment_style/);
});

test('POST /api/transactions - 정상 payment_style(할부)은 201', async () => {
  const categoriesResp = await fetch(`${BASE}/api/categories`);
  const categories = await categoriesResp.json();
  const categoryId = categories[0].id;

  const resp = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: '2026-01-15', category_id: categoryId, amount: 1000, payment_style: '할부' })
  });
  assert.strictEqual(resp.status, 201);
});

test('POST /api/categories - 허용되지 않은 major_type은 400', async () => {
  const resp = await fetch(`${BASE}/api/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ major_type: '없는분류', name: '테스트카테고리' })
  });
  assert.strictEqual(resp.status, 400);
  const body = await resp.json();
  assert.match(body.error, /major_type/);
});

test('POST /api/categories - 카드 임포트가 자동 생성하는 미분류는 허용', async () => {
  const resp = await fetch(`${BASE}/api/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ major_type: '미분류', name: '미분류-검증테스트' })
  });
  assert.strictEqual(resp.status, 201);
});

test('PUT /api/categories/:id - 허용되지 않은 major_type은 400', async () => {
  const categoriesResp = await fetch(`${BASE}/api/categories`);
  const categories = await categoriesResp.json();
  const target = categories[0];

  const resp = await fetch(`${BASE}/api/categories/${target.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ major_type: '없는분류', name: target.name, monthly_budget: target.monthly_budget })
  });
  assert.strictEqual(resp.status, 400);
});
