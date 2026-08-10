'use strict';
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

// 중복 후보를 "중복 아님" 으로 지나친 뒤 되돌리는 동선(#445 §2).
//
// `findDuplicateCandidates` 는 지나친 것을 걸러내고 목록에 안 낸다. 그게 맞는
// 동작이지만, 그래서 **실수로 지나친 것을 사용자가 다시 찾을 방법이 없었다** —
// 서버에는 `undismiss` 가 있는데 목록이 없어 손이 닿지 않았다.
//
// 여기서 잠그는 것.
//   1. 지나친 것이 후보 목록에서 빠지는가 (기존 동작 유지)
//   2. 지나친 것을 따로 볼 수 있는가
//   3. 되돌리면 후보로 다시 나오는가

const PORT = 34988;
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

const candidates = () => json('/api/installments/duplicates');
const dismissedList = () => json('/api/installments/duplicates/dismissed');
const dismiss = (ids) => post('/api/installments/duplicates/resolve', { keep_ids: ids });
const restore = (ids) => post('/api/installments/duplicates/restore', { ids });

let categoryId;
let cardMethodId;

before(async () => {
  server = await startTestServer({ port: PORT });
  const cats = await json('/api/categories');
  categoryId = (cats.body.data || cats.body)[0].id;
  const pms = await json('/api/payment-methods');
  const methods = pms.body.data || pms.body;
  cardMethodId = methods.find((m) => m.type === '신용').id;
});

after(() => { if (server) server.stop(); });

// 후보가 잡히려면 할부 원본과 같은 가맹점·금액·비슷한 날짜의 수동 거래가 있어야 한다.
async function seedCandidate({ merchant = '쿠팡', amount = 300000, date = '2026-05-15' } = {}) {
  const inst = await post('/api/installments', {
    purchase_date: date, merchant, total_amount: amount, months: 3,
    monthly_amount: Math.round(amount / 3),
    payment_method_id: cardMethodId, start_billing_month: '2026-06',
  });
  assert.strictEqual(inst.status, 201, JSON.stringify(inst.body));

  const tx = await post('/api/transactions', {
    date, category_id: categoryId, amount,
    payment_method_id: cardMethodId, merchant, payment_style: '할부',
  });
  assert.strictEqual(tx.status, 201, JSON.stringify(tx.body));
  return tx.body.id;
}

beforeEach(async () => {
  const list = await json('/api/transactions?limit=500');
  for (const t of list.body.data) {
    await json(`/api/transactions/${t.id}`, { method: 'DELETE' });
  }
  const insts = await json('/api/installments');
  for (const i of (insts.body.data || [])) {
    await json(`/api/installments/${i.id}`, { method: 'DELETE' });
  }
  const d = await dismissedList();
  const ids = (d.body.data || []).map((r) => r.transaction_id);
  if (ids.length) await restore(ids);
});

describe('A. 지나치기', () => {
  test('A-1. 후보가 잡힌다', async () => {
    await seedCandidate();
    const res = await candidates();
    assert.ok(res.body.data.length >= 1, '후보가 잡히지 않았다');
  });

  test('A-2. 지나치면 후보에서 빠진다', async () => {
    const txId = await seedCandidate();
    const res = await dismiss([txId]);
    assert.strictEqual(res.body.kept, 1);
    assert.strictEqual(res.body.deleted, 0);

    const candidatesRes = await candidates();
    const candidateIds = candidatesRes.body.data.map((c) => c.transaction_id ?? c.id);
    assert.ok(!candidateIds.includes(txId), '지나친 후보가 여전히 목록에 있다');
  });
});

describe('B. 지나친 것을 볼 수 있다', () => {
  test('B-1. 지나친 목록에 나온다', async () => {
    const txId = await seedCandidate();
    await dismiss([txId]);
    const res = await dismissedList();
    assert.strictEqual(res.body.data.length, 1);
  });

  test('B-2. 무엇을 지나쳤는지 알아볼 수 있다', async () => {
    const txId = await seedCandidate({ merchant: '쿠팡', amount: 300000 });
    await dismiss([txId]);
    const res = await dismissedList();
    const item = res.body.data[0];
    assert.ok(item.date, 'date 필드가 없다');
    assert.ok(item.merchant, 'merchant 필드가 없다');
    assert.ok(item.amount, 'amount 필드가 없다');
    assert.ok(item.dismissed_at, 'dismissed_at 필드가 없다');
    assert.strictEqual(item.merchant, '쿠팡', 'merchant 가 예상과 다르다');
  });

  test('B-3. 지나친 것이 없으면 빈 배열이다', async () => {
    const res = await dismissedList();
    assert.deepStrictEqual(res.body.data, []);
  });
});

describe('C. 되돌리기', () => {
  test('C-1. 되돌리면 후보로 다시 나온다', async () => {
    const txId = await seedCandidate();
    await dismiss([txId]);
    await restore([txId]);
    const res = await candidates();
    assert.ok(res.body.data.length >= 1, '되돌린 후 보이지 않는다');
  });

  test('C-2. 되돌리면 지나친 목록에서 빠진다', async () => {
    const txId = await seedCandidate();
    await dismiss([txId]);
    await restore([txId]);
    const res = await dismissedList();
    assert.strictEqual(res.body.data.length, 0);
  });
});
