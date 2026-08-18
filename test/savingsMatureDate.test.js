const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { startTestServer } = require('./helpers/testServer');

// 포트는 20000~21999 에서 고른다(#627). 21613 은 아직 아무 테스트도 쓰지 않는다.
const PORT = 21613;
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

// 저축 상품 하나를 만들고 id 를 돌려준다. **id 는 응답에서 읽는다** — 숫자로 적지 않는다.
async function makeProduct(name, over = {}) {
  const r = await req('POST', '/api/savings', {
    name,
    monthly_contribution: 100000,
    start_date: '2026-01-01',
    maturity_date: '2026-12-01',
    expected_payout: 1250000,
    ...over,
  });
  assert.strictEqual(r.status, 201, '저축 상품을 못 만들었다');
  return r.body.id;
}

test('POST /api/savings/:id/mature — 잘못된 날짜 형식은 400', async () => {
  const id = await makeProduct('날짜적금A');
  const r = await req('POST', `/api/savings/${id}/mature`, { settle_date: '말도안되는날짜' });
  assert.strictEqual(r.status, 400);
  assert.ok(r.body.error.includes('YYYY-MM-DD'));
  assert.ok(!r.body.error.includes('처리 중 문제가 생겼습니다.'));
});

test('POST /api/savings/:id/mature — 형식은 맞는데 없는 날짜는 400', async () => {
  const id = await makeProduct('날짜적금B');
  const r = await req('POST', `/api/savings/${id}/mature`, { settle_date: '2026-13-45' });
  assert.strictEqual(r.status, 400);
});

test('POST /api/savings/:id/mature — 날짜를 안 주면 상품의 만기일로 정상 처리된다', async () => {
  const id = await makeProduct('날짜적금C');
  const r = await req('POST', `/api/savings/${id}/mature`, {});
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.principal, 1200000);
  assert.strictEqual(r.body.interest, 50000);
});

test('POST /api/savings/:id/mature — 제대로 준 날짜는 그대로 통과한다', async () => {
  const id = await makeProduct('날짜적금D');
  const r = await req('POST', `/api/savings/${id}/mature`, { settle_date: '2026-12-01' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.payout, 1250000);
});

test('POST /api/savings/:id/mature — 상품의 시작일이 깨져 있으면 400 이고 500 이 아니다', async () => {
  const id = await makeProduct('날짜적금E', { start_date: '언젠가' });
  const r = await req('POST', `/api/savings/${id}/mature`, { settle_date: '2026-12-01' });
  assert.strictEqual(r.status, 400);
  assert.ok(!r.body.error.includes('처리 중 문제가 생겼습니다.'));
});
