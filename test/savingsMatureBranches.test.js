'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const PORT = 35050;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => { server = await startTestServer({ port: PORT }); });
after(() => { if (server) server.stop(); });

// 저축 상품을 하나 만들고 id 를 돌려준다.
async function createProduct(over = {}) {
  const body = {
    name: `적금-${Math.round(performance.now() * 1000)}`,
    monthly_contribution: 100000,
    start_date: '2026-01-10',
    maturity_date: '2026-04-10',
    ...over,
  };
  const r = await fetch(`${BASE}/api/savings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  // 본문은 **한 번만** 읽는다. `assert(..., await r.text())` 처럼 쓰면 단언이
  // 통과하든 말든 본문이 먼저 소비돼, 뒤의 `r.json()` 이
  // `Body is unusable: Body has already been read` 로 죽는다.
  const raw = await r.text();
  assert.strictEqual(r.status, 201, raw);
  const j = JSON.parse(raw);
  return j.id;
}

async function mature(id, body = {}) {
  return fetch(`${BASE}/api/savings/${id}/mature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// 거래 목록 스냅샷. 만기 처리 전후로 찍어 **새로 생긴 것만** 골라낸다.
// 목록 전체를 가맹점 이름으로 거르면 다른 테스트가 만든 행에 걸릴 수 있다.
async function snapshot() {
  const r = await fetch(`${BASE}/api/transactions?limit=500`);
  return (await r.json()).data;
}

function addedSince(before, after) {
  return after.filter((t) => !before.some((b) => b.id === t.id));
}

test('없는 상품을 만기 처리하면 404 다', async () => {
  const r = await mature(999999);
  assert.strictEqual(r.status, 404);
  const raw = await r.text();
  const j = JSON.parse(raw);
  assert.ok(j.error && typeof j.error === 'string' && j.error.length > 0);
});

test('이미 만기 처리된 상품은 400 이다', async () => {
  const id = await createProduct();
  assert.strictEqual((await mature(id)).status, 200);
  const again = await mature(id);
  assert.strictEqual(again.status, 400);
});

test('만기 처리는 원금·이자·수령액을 돌려준다', async () => {
  const id = await createProduct({ expected_payout: 420000 });
  const r = await mature(id);
  assert.strictEqual(r.status, 200);
  const j = await r.json();
  assert.strictEqual(j.principal, 400000);
  assert.strictEqual(j.payout, 420000);
  assert.strictEqual(j.interest, 20000);
});

test('수령액을 안 적으면 이자는 0 이다', async () => {
  const id = await createProduct();
  const j = await (await mature(id)).json();
  assert.strictEqual(j.payout, j.principal);
  assert.strictEqual(j.interest, 0);
});

test('이자가 0 이면 이자 거래를 안 만든다', async () => {
  const id = await createProduct();
  const before = await snapshot();
  await mature(id);
  const added = addedSince(before, await snapshot());
  assert.strictEqual(added.filter((t) => t.memo === '적금 만기 - 이자').length, 0);
});

test('이자가 있으면 이자 거래가 생긴다', async () => {
  const id = await createProduct({ expected_payout: 420000 });
  const before = await snapshot();
  await mature(id);
  const added = addedSince(before, await snapshot());
  const interestTx = added.find((t) => t.memo === '적금 만기 - 이자');
  assert.ok(interestTx);
  assert.strictEqual(interestTx.amount, 20000);
});

test('카테고리가 없으면 원금 회수 거래를 안 만든다', async () => {
  const id = await createProduct({ category_id: null });
  const before = await snapshot();
  await mature(id);
  const added = addedSince(before, await snapshot());
  assert.strictEqual(added.filter((t) => t.memo === '적금 만기 - 원금 회수').length, 0);
});

test('정산일을 직접 주면 그 날짜로 계산한다', async () => {
  const id = await createProduct();
  const j = await (await mature(id, { settle_date: '2026-03-10' })).json();
  assert.strictEqual(j.principal, 300000);
});
