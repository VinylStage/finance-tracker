const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { startTestServer } = require('./helpers/testServer');

// 포트는 20000~21999 에서 고른다(#627). 21623 은 아직 아무 테스트도 쓰지 않는다.
const PORT = 21623;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
});

after(() => {
  if (server) server.stop();
});

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let parsed = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed };
}

test('없는 분류를 지우면 404 다', async () => {
  const res = await req('DELETE', '/api/categories/99999');
  assert.strictEqual(res.status, 404);
  assert.ok(res.body.error);
});

test('없는 결제수단을 지우면 404 다', async () => {
  const res = await req('DELETE', '/api/payment-methods/99999');
  assert.strictEqual(res.status, 404);
});

test('있는 분류를 지우면 200 이고 목록에서 빠진다', async () => {
  const created = await req('POST', '/api/categories', { name: '지울분류', major_type: '선택지출' });
  assert.strictEqual(created.status, 201);
  const id = created.body.id;

  const deleted = await req('DELETE', `/api/categories/${id}`);
  assert.strictEqual(deleted.status, 200);

  const listed = await req('GET', '/api/categories');
  const rows = Array.isArray(listed.body) ? listed.body : listed.body.data;
  assert.ok(!rows.some((c) => c.id === id), '지운 분류가 목록에 남았다');
});

test('있는 결제수단을 지우면 200 이다', async () => {
  const created = await req('POST', '/api/payment-methods', { name: '지울수단', type: '카드' });
  assert.strictEqual(created.status, 201);
  const id = created.body.id;

  const deleted = await req('DELETE', `/api/payment-methods/${id}`);
  assert.strictEqual(deleted.status, 200);
});

test('이미 지운 분류를 다시 지워도 404 가 아니다', async () => {
  const created = await req('POST', '/api/categories', { name: '두번지울분류', major_type: '선택지출' });
  assert.strictEqual(created.status, 201);
  const id = created.body.id;

  const firstDelete = await req('DELETE', `/api/categories/${id}`);
  assert.strictEqual(firstDelete.status, 200);

  const secondDelete = await req('DELETE', `/api/categories/${id}`);
  assert.strictEqual(secondDelete.status, 200);
});

test('글자로 된 id 를 지워도 404 다', async () => {
  const res = await req('DELETE', '/api/categories/abc');
  assert.strictEqual(res.status, 404);
});
