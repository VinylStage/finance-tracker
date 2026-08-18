const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { startTestServer } = require('./helpers/testServer');

// 포트는 20000~21999 에서 고른다(#627). 21509 는 아직 아무 테스트도 쓰지 않는다.
const PORT = 21509;
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

test('만든 상품은 201 과 id 를 준다', async () => {
  const id = await makeProduct('프로브적금A');
  assert.strictEqual(typeof id, 'number');
});

test('없는 카테고리로 고치면 500 이고 내부 오류가 새지 않는다', async () => {
  const id = await makeProduct('프로브적금B');
  const r = await req('PUT', `/api/savings/${id}`, { category_id: 99999 });
  assert.strictEqual(r.status, 500);
  assert.strictEqual(r.body.error, '처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.');
  assert.ok(!r.body.error.includes('SQLITE'));
  assert.ok(!r.body.error.includes('FOREIGN'));
  assert.ok(!r.body.error.includes('constraint'));
});

test('없는 상품을 고치면 404 다', async () => {
  const r = await req('PUT', '/api/savings/99999', { name: 'x' });
  assert.strictEqual(r.status, 404);
  assert.strictEqual(r.body.error, '찾는 저축 상품이 없습니다. 이미 삭제됐을 수 있어요.');
});

test('만기 처리는 원금과 이자를 갈라 낸다', async () => {
  const id = await makeProduct('프로브적금C');
  const r = await req('POST', `/api/savings/${id}/mature`, { settle_date: '2026-12-01' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.principal, 1200000);
  assert.strictEqual(r.body.interest, 50000);
  assert.strictEqual(r.body.payout, 1250000);
});

test('이미 만기 처리한 상품은 다시 안 된다', async () => {
  const id = await makeProduct('프로브적금D');
  await req('POST', `/api/savings/${id}/mature`, { settle_date: '2026-12-01' });
  const r = await req('POST', `/api/savings/${id}/mature`, {});
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.body.error, '이미 만기 처리된 상품입니다.');
});

test('없는 상품을 만기 처리하면 404 다', async () => {
  const r = await req('POST', '/api/savings/99999/mature', {});
  assert.strictEqual(r.status, 404);
});
