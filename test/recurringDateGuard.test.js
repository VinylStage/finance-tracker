const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { startTestServer } = require('./helpers/testServer');

// 포트는 20000~21999 에서 고른다(#627). 21633 은 아직 아무 테스트도 쓰지 않는다.
const PORT = 21633;
const BASE = `http://127.0.0.1:${PORT}`;
let server;
let categoryId;
let ruleId;

before(async () => {
  server = await startTestServer({ port: PORT });

  const listed = await req('GET', '/api/categories');
  const rows = Array.isArray(listed.body) ? listed.body : listed.body.data;
  categoryId = rows[0].id;

  const made = await req('POST', '/api/recurring-rules', {
    merchant: '달검사규칙',
    category_id: categoryId,
    amount: -1000,
    day_of_month: 15,
    payment_style: '해당없음',
    freq: 'monthly',
    interval: 1,
    starts_on: '2026-01-01',
  });
  assert.strictEqual(made.status, 201, JSON.stringify(made.body));
  ruleId = made.body.id;
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

// 「글자꼴은 맞는데 날짜가 아닌」 값들.
const BAD_DATES = ['2026-02-30', '2026-13-45', '0000-00-00', '2026-04-31'];
// 「글자꼴은 맞는데 달이 아닌」 값들.
const BAD_MONTHS = ['2026-13', '2026-00', '0000-00'];

test('따라잡기 기준일이 날짜가 아니면 400 이다', async () => {
  for (const date of BAD_DATES) {
    const res = await req('POST', '/api/recurring-rules/catchup/run', { today: date });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error);
  }
});

test('기준일을 안 주면 그대로 돈다', async () => {
  const res = await req('POST', '/api/recurring-rules/catchup/run', {});
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.today);
  assert.ok(!res.body.data);
});

test('조회할 달이 달이 아니면 400 이다', async () => {
  for (const month of BAD_MONTHS) {
    const res = await req('GET', `/api/recurring-rules/due?month=${month}`);
    assert.strictEqual(res.status, 400);
  }
});

test('제대로 된 달은 200 이다', async () => {
  const res = await req('GET', '/api/recurring-rules/due?month=2026-03');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.month, '2026-03');
});

test('확인·건너뛰기의 달도 막는다', async () => {
  const res1 = await req('POST', `/api/recurring-rules/${ruleId}/confirm`, { month: '2026-13' });
  assert.strictEqual(res1.status, 400);

  const res2 = await req('POST', `/api/recurring-rules/${ruleId}/skip`, { month: '2026-13' });
  assert.strictEqual(res2.status, 400);
});
