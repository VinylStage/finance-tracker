'use strict';
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

// 거래 입력 자동완성 두 엔드포인트.
//
// 화면(`TransactionForm.jsx`)이 가맹점을 치는 동안 이 둘을 부른다 — 카테고리를
// 자동으로 제안하고, 최근 가맹점을 datalist 로 띄운다. **둘 다 테스트가 0 이었다**
// (커버리지 실측에서 `src/routes/transactions.js` 687-712 구간이 통째로 안 덮여
// 있었다).
//
// 여기서 잠그는 것.
//   1. 제안의 확신도가 실제 근거와 맞는가 — 사용자는 이 값을 보고 그냥 저장한다
//   2. LIKE 와일드카드가 새지 않는가 — `_` 하나로 전 건이 걸리면 엉뚱한 카테고리를
//      "부분일치" 라고 제안한다
//   3. 최근 가맹점이 정말 최근순인가

const PORT = 34991;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

async function json(pathname, options) {
  const r = await fetch(`${BASE}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return { status: r.status, body: await r.json() };
}
const post = (p, b) => json(p, { method: 'POST', body: JSON.stringify(b) });

const suggestCategory = (merchant) =>
  json(`/api/transactions/suggest/category?merchant=${encodeURIComponent(merchant)}`);

let catA;
let catB;
let methodId;

async function addTx({ merchant, categoryId, date = '2026-05-15', amount = 10000 }) {
  const r = await post('/api/transactions', {
    date, category_id: categoryId, amount, payment_method_id: methodId, merchant,
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  return r.body.id;
}

before(async () => {
  server = await startTestServer({ port: PORT });
  const cats = await json('/api/categories');
  const list = cats.body.data || cats.body;
  catA = list[0].id;
  catB = list.find((c) => c.id !== catA).id;
  const pms = await json('/api/payment-methods');
  methodId = (pms.body.data || pms.body)[0].id;
});

after(() => { if (server) server.stop(); });

// 각 케이스가 자기 거래만 보게 매번 비운다. 제안은 전체 이력을 훑으므로 앞
// 케이스가 남긴 거래가 섞이면 확신도 판정이 뒤집힌다.
beforeEach(async () => {
  const list = await json('/api/transactions?limit=500');
  for (const t of list.body.data) {
    await json(`/api/transactions/${t.id}`, { method: 'DELETE' });
  }
});

describe('A. 카테고리 제안', () => {
  test('A-1. 똑같은 가맹점이 있으면 완전일치다', async () => {
    await addTx({ merchant: '스타벅스', categoryId: catA });

    const r = await suggestCategory('스타벅스');

    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.confidence, '완전일치');
    assert.strictEqual(r.body.category_id, catA);
  });

  test('A-2. 가맹점을 안 주면 없음이다', async () => {
    const r = await json('/api/transactions/suggest/category');

    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.confidence, '없음');
    assert.strictEqual(r.body.category_id, null);
  });

  test('A-3. 같은 가맹점이 여러 건이면 최근 것의 카테고리를 준다', async () => {
    await addTx({ merchant: '이마트', categoryId: catA, date: '2026-01-10' });
    await addTx({ merchant: '이마트', categoryId: catB, date: '2026-06-20' });

    const r = await suggestCategory('이마트');

    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.category_id, catB);
  });

  test('A-4. 부분일치는 가장 많이 쓴 카테고리를 준다', async () => {
    await addTx({ merchant: '스타벅스 강남', categoryId: catA, date: '2026-01-01' });
    await addTx({ merchant: '스타벅스 홍대', categoryId: catB, date: '2026-01-02' });
    await addTx({ merchant: '스타벅스 강남', categoryId: catA, date: '2026-01-03' });

    const r = await suggestCategory('스타벅스');

    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.confidence, '부분일치');
    assert.strictEqual(r.body.category_id, catA);
  });

  test('A-5. `_` 를 와일드카드로 쓰지 않는다', async () => {
    await addTx({ merchant: '스타벅스', categoryId: catA });

    const r = await suggestCategory('_');

    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.confidence, '없음');
  });

  test('A-6. `%` 를 와일드카드로 쓰지 않는다', async () => {
    await addTx({ merchant: '스타벅스', categoryId: catA });

    const r = await suggestCategory('%');

    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.confidence, '없음');
  });

  test('A-7. 아무것도 안 맞으면 없음이다', async () => {
    await addTx({ merchant: '스타벅스', categoryId: catA });

    const r = await suggestCategory('없는가맹점');

    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.confidence, '없음');
    assert.strictEqual(r.body.category_id, null);
  });
});

// 최근 가맹점 자동완성. 화면이 datalist 로 띄운다.
describe('B. 최근 가맹점', () => {
  test('B-1. 최근 순으로 준다', async () => {
    await addTx({ merchant: '가', categoryId: catA, date: '2026-01-05' });
    await addTx({ merchant: '나', categoryId: catA, date: '2026-06-20' });
    await addTx({ merchant: '다', categoryId: catA, date: '2026-03-10' });

    const r = await json('/api/transactions/suggest/merchants');

    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body.data, ['나', '다', '가']);
  });

  test('B-2. limit 을 지킨다', async () => {
    await addTx({ merchant: '가', categoryId: catA, date: '2026-01-05' });
    await addTx({ merchant: '나', categoryId: catA, date: '2026-06-20' });
    await addTx({ merchant: '다', categoryId: catA, date: '2026-03-10' });

    const r = await json('/api/transactions/suggest/merchants?limit=2');

    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.data.length, 2);
  });

  test('B-3. 같은 가맹점은 한 번만 준다', async () => {
    await addTx({ merchant: '가', categoryId: catA, date: '2026-01-05' });
    await addTx({ merchant: '가', categoryId: catA, date: '2026-02-05' });
    await addTx({ merchant: '가', categoryId: catA, date: '2026-03-05' });

    const r = await json('/api/transactions/suggest/merchants');

    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body.data, ['가']);
  });

  test('B-4. 빈 가맹점은 안 준다', async () => {
    await addTx({ merchant: '', categoryId: catA });
    await addTx({ merchant: '가', categoryId: catA });

    const r = await json('/api/transactions/suggest/merchants');

    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body.data, ['가']);
  });
});
