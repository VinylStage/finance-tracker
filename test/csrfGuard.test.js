const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const PORT = 34594; // 다른 테스트와 충돌 안 나게 임의 포트 사용
const BASE = `http://127.0.0.1:${PORT}`;
const SELF_ORIGIN = BASE;
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
  // 기존 before 안에 있던 나머지 준비 작업은 이 아래에 그대로 남긴다
});

after(() => {
  if (server) server.stop();
});

test('FND-01: Sec-Fetch-Site: cross-site 인 POST는 403으로 차단 (감사 PoC 재현)', async () => {
  const resp = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'http://evil.example',
      'Sec-Fetch-Site': 'cross-site',
    },
    body: JSON.stringify({ date: '2026-01-15', category_id: 1, amount: 1000 }),
  });
  assert.strictEqual(resp.status, 403);
});

test('FND-01: 감사 PoC — data/import mode=overwrite 공격도 차단됨', async () => {
  const resp = await fetch(`${BASE}/api/data/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': 'http://evil.example',
      'Sec-Fetch-Site': 'cross-site',
    },
    body: 'mode=overwrite&confirm=DELETE_ALL&transactions=x&transactions=y',
  });
  assert.strictEqual(resp.status, 403);
});

test('FND-01: Sec-Fetch-Site: same-origin 인 POST는 정상 통과', async () => {
  const catResp = await fetch(`${BASE}/api/categories`);
  const cats = await catResp.json();
  const resp = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Sec-Fetch-Site': 'same-origin',
    },
    body: JSON.stringify({ date: '2026-01-15', category_id: cats[0].id, amount: 1000 }),
  });
  assert.strictEqual(resp.status, 201);
});

test('FND-01: Sec-Fetch-Site 없고 Origin이 자기 자신과 일치하면 통과 (구형 브라우저 폴백)', async () => {
  const catResp = await fetch(`${BASE}/api/categories`);
  const cats = await catResp.json();
  const resp = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': SELF_ORIGIN },
    body: JSON.stringify({ date: '2026-01-15', category_id: cats[0].id, amount: 2000 }),
  });
  assert.strictEqual(resp.status, 201);
});

test('FND-01: Sec-Fetch-Site 없고 Origin이 다르면 403 (구형 브라우저 폴백)', async () => {
  const resp = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': 'http://evil.example' },
    body: JSON.stringify({ date: '2026-01-15', category_id: 1, amount: 1000 }),
  });
  assert.strictEqual(resp.status, 403);
});

test('FND-01: Sec-Fetch-Site/Origin 둘 다 없으면 통과 (curl·테스트스위트·서버간 호출 호환)', async () => {
  const catResp = await fetch(`${BASE}/api/categories`);
  const cats = await catResp.json();
  const resp = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: '2026-01-15', category_id: cats[0].id, amount: 3000 }),
  });
  assert.strictEqual(resp.status, 201);
});

test('FND-01: GET 요청은 Sec-Fetch-Site/Origin 값과 무관하게 항상 통과', async () => {
  const resp = await fetch(`${BASE}/api/categories`, {
    headers: { 'Origin': 'http://evil.example', 'Sec-Fetch-Site': 'cross-site' },
  });
  assert.strictEqual(resp.status, 200);
});
