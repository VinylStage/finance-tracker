const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const PORT = 34595;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
  // 기존 before 안에 있던 나머지 준비 작업은 이 아래에 그대로 남긴다
});

after(() => {
  if (server) server.stop();
});

async function createRule(overrides = {}) {
  const categoriesResp = await fetch(`${BASE}/api/categories`);
  const categories = await categoriesResp.json();
  const category_id = categories[0].id;
  const resp = await fetch(`${BASE}/api/recurring-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category_id, merchant: '테스트구독', amount: 9900, day_of_month: 15, ...overrides }),
  });
  assert.strictEqual(resp.status, 201);
  return (await resp.json()).id;
}

test('POST /api/recurring-rules - day_of_month 범위 밖이면 400', async () => {
  const categoriesResp = await fetch(`${BASE}/api/categories`);
  const categories = await categoriesResp.json();
  const resp = await fetch(`${BASE}/api/recurring-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category_id: categories[0].id, merchant: '테스트', amount: 1000, day_of_month: 32 }),
  });
  assert.strictEqual(resp.status, 400);
});

test('POST /api/recurring-rules - 허용되지 않은 payment_style은 400', async () => {
  const categoriesResp = await fetch(`${BASE}/api/categories`);
  const categories = await categoriesResp.json();
  const resp = await fetch(`${BASE}/api/recurring-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category_id: categories[0].id, merchant: '테스트', amount: 1000, day_of_month: 1, payment_style: '없는값' }),
  });
  assert.strictEqual(resp.status, 400);
});

test('생성한 규칙은 GET /due?month=에 나타나고, confirm하면 거래가 생기고 사라짐', async () => {
  const id = await createRule();

  const dueBefore = await (await fetch(`${BASE}/api/recurring-rules/due?month=2026-03`)).json();
  assert.ok(dueBefore.data.some(r => r.id === id));

  const confirmResp = await fetch(`${BASE}/api/recurring-rules/${id}/confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: '2026-03' }),
  });
  assert.strictEqual(confirmResp.status, 201);
  const { transaction_id } = await confirmResp.json();

  const txResp = await fetch(`${BASE}/api/transactions/${transaction_id}`);
  const tx = await txResp.json();
  assert.strictEqual(tx.date, '2026-03-15');
  assert.strictEqual(tx.amount, 9900);
  assert.strictEqual(tx.merchant, '테스트구독');

  const dueAfter = await (await fetch(`${BASE}/api/recurring-rules/due?month=2026-03`)).json();
  assert.ok(!dueAfter.data.some(r => r.id === id), 'confirm 처리된 규칙은 같은 달 due 목록에서 빠져야 함');
});

test('confirm 후 같은 달에 다시 confirm/skip하면 409', async () => {
  const id = await createRule();
  await fetch(`${BASE}/api/recurring-rules/${id}/confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: '2026-04' }),
  });
  const second = await fetch(`${BASE}/api/recurring-rules/${id}/confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: '2026-04' }),
  });
  assert.strictEqual(second.status, 409);
});

test('skip하면 거래 없이 이번 달 due 목록에서 빠짐', async () => {
  const id = await createRule();
  const skipResp = await fetch(`${BASE}/api/recurring-rules/${id}/skip`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: '2026-05' }),
  });
  assert.strictEqual(skipResp.status, 200);

  const dueAfter = await (await fetch(`${BASE}/api/recurring-rules/due?month=2026-05`)).json();
  assert.ok(!dueAfter.data.some(r => r.id === id));

  const listResp = await fetch(`${BASE}/api/transactions?limit=500`);
  const list = await listResp.json();
  assert.ok(!list.data.some(t => t.merchant === '테스트구독' && t.date.startsWith('2026-05')), 'skip은 거래를 만들면 안 됨');
});

test('day_of_month가 그 달 마지막 날보다 크면 마지막 날로 clamp', async () => {
  const id = await createRule({ day_of_month: 31 });
  const confirmResp = await fetch(`${BASE}/api/recurring-rules/${id}/confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: '2026-02' }),
  });
  const { transaction_id } = await confirmResp.json();
  const tx = await (await fetch(`${BASE}/api/transactions/${transaction_id}`)).json();
  assert.strictEqual(tx.date, '2026-02-28', '2026년은 평년이라 2월 마지막 날은 28일');
});

test('비활성 규칙(DELETE)은 GET 기본 목록과 due 목록에서 빠짐', async () => {
  const id = await createRule();
  const delResp = await fetch(`${BASE}/api/recurring-rules/${id}`, { method: 'DELETE' });
  assert.strictEqual(delResp.status, 200);

  const list = await (await fetch(`${BASE}/api/recurring-rules`)).json();
  assert.ok(!list.some(r => r.id === id));

  const due = await (await fetch(`${BASE}/api/recurring-rules/due?month=2026-06`)).json();
  assert.ok(!due.data.some(r => r.id === id));
});
