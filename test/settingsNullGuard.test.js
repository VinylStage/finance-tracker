const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { startTestServer } = require('./helpers/testServer');

// 포트는 20000~21999 에서 고른다(#627). 21635 는 아직 아무 테스트도 쓰지 않는다.
const PORT = 21635;
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

// 매 테스트 앞에서 기준값을 세운다. 서버를 공유하므로 앞 테스트의 값이 남는다.
async function seed() {
  const res = await req('PUT', '/api/settings', {
    initial_balance: 5000000,
    monthly_income: 3000000,
  });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
}

async function current() {
  const res = await req('GET', '/api/settings');
  assert.strictEqual(res.status, 200);
  return res.body;
}

test('null을 보내면 400이고 기존 값이 그대로다', async () => {
  await seed();
  const res = await req('PUT', '/api/settings', { monthly_income: null });
  assert.strictEqual(res.status, 400);
  const c = await current();
  assert.strictEqual(c.monthly_income, 3000000);
});

test('초기 잔액에 null을 보내도 같다', async () => {
  await seed();
  const res = await req('PUT', '/api/settings', { initial_balance: null });
  assert.strictEqual(res.status, 400);
  const c = await current();
  assert.strictEqual(c.initial_balance, 5000000);
});

test('빈 객체는 200이고 아무것도 안 바꾼다', async () => {
  await seed();
  const res = await req('PUT', '/api/settings', {});
  assert.strictEqual(res.status, 200);
  const c = await current();
  assert.strictEqual(c.initial_balance, 5000000);
  assert.strictEqual(c.monthly_income, 3000000);
});

test('월 수입이 음수면 400이다', async () => {
  await seed();
  const res = await req('PUT', '/api/settings', { monthly_income: -5000000 });
  assert.strictEqual(res.status, 400);
  const c = await current();
  assert.strictEqual(c.monthly_income, 3000000);
});

test('초기 잔액은 음수여도 저장된다 — 빚이다', async () => {
  await seed();
  const res = await req('PUT', '/api/settings', { initial_balance: -1000000 });
  assert.strictEqual(res.status, 200);
  const c = await current();
  assert.strictEqual(c.initial_balance, -1000000);
});

test('숫자 문자열과 소수는 그대로 통과한다', async () => {
  await seed();
  const res = await req('PUT', '/api/settings', { monthly_income: '4000000', initial_balance: 1000.5 });
  assert.strictEqual(res.status, 200);
  const c = await current();
  assert.strictEqual(c.monthly_income, 4000000);
  assert.strictEqual(c.initial_balance, 1000.5);
});
