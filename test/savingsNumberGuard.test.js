const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { startTestServer } = require('./helpers/testServer');

// 포트는 20000~21999 에서 고른다(#627). 21651 은 아직 아무 테스트도 쓰지 않는다.
const PORT = 21651;
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
  return { status: res.status, body: await res.json() };
}

// 정상 저축 본문. over 로 한 필드만 오염시켜 쓴다.
function payload(name, over = {}) {
  return {
    name,
    monthly_contribution: 100000,
    start_date: '2026-01-01',
    maturity_date: '2026-12-01',
    expected_payout: 1250000,
    ...over,
  };
}

test('POST /api/savings — 정상 본문은 201 이다', async () => {
  const r = await req('POST', '/api/savings', payload('정상저축'));
  assert.strictEqual(r.status, 201);
});

test('POST /api/savings — 월 납입액이 음수면 400 이다', async () => {
  const r = await req('POST', '/api/savings', payload('음수납입', { monthly_contribution: -100000 }));
  assert.strictEqual(r.status, 400);
  assert.ok(r.body.error.includes('월 납입액'));
});

test('POST /api/savings — 만기일이 시작일보다 앞서면 400 이다', async () => {
  const r = await req('POST', '/api/savings', payload('역전기간', { start_date: '2026-12-01', maturity_date: '2026-01-01' }));
  assert.strictEqual(r.status, 400);
  assert.ok(r.body.error.includes('만기일'));
});

test('POST /api/savings — 같은 날이면 통과한다', async () => {
  const r = await req('POST', '/api/savings', payload('같은날', { start_date: '2026-06-01', maturity_date: '2026-06-01' }));
  assert.strictEqual(r.status, 201);
});

test('POST /api/savings — 만기일을 안 주면 통과한다', async () => {
  const r = await req('POST', '/api/savings', payload('만기없음', { maturity_date: null }));
  assert.strictEqual(r.status, 201);
});

test('PUT /api/savings/:id — 수정으로도 못 넣는다', async () => {
  const r1 = await req('POST', '/api/savings', payload('수정대상'));
  assert.strictEqual(r1.status, 201);
  const id = r1.body.id;

  const r2 = await req('PUT', `/api/savings/${id}`, { monthly_contribution: -50000 });
  assert.strictEqual(r2.status, 400);

  const r3 = await req('PUT', `/api/savings/${id}`, { maturity_date: '2025-01-01' });
  assert.strictEqual(r3.status, 400);
});

test('PUT /api/savings/:id — 이름만 고치는 수정은 그대로 통과한다', async () => {
  const r1 = await req('POST', '/api/savings', payload('수정대상2'));
  assert.strictEqual(r1.status, 201);
  const id = r1.body.id;

  const r2 = await req('PUT', `/api/savings/${id}`, { name: '고친이름' });
  assert.strictEqual(r2.status, 200);
});
