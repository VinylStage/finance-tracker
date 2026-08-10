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

// 없는 규칙을 건드리는 경로가 통째로 비어 있었다. 네 라우트가 각각 404 를 내는데
// 어느 것도 확인되지 않았다(분기 커버리지 69.8%). 규칙을 지운 뒤 다른 탭에서
// 확인 버튼을 누르면 사용자가 바로 만나는 상태다.
test('F-1. 없는 규칙을 건드리면 네 경로 모두 404 다', async () => {
  const gone = 999999;
  const cases = [
    ['PUT', `/api/recurring-rules/${gone}`, { amount: 1000 }],
    ['DELETE', `/api/recurring-rules/${gone}`, null],
    ['POST', `/api/recurring-rules/${gone}/confirm`, { month: '2026-03' }],
    ['POST', `/api/recurring-rules/${gone}/skip`, { month: '2026-03' }],
  ];
  for (const [method, path, body] of cases) {
    const r = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const parsed = await r.json();
    assert.strictEqual(r.status, 404, `${method} ${path}: ${JSON.stringify(parsed)}`);
    assert.ok(parsed.error, `${method} ${path}: 거부 사유가 없다`);
  }
});

// 월 형식은 세 라우트가 각각 본다. 형식이 틀린 값이 그대로 쿼리로 들어가면
// 빈 목록이 돌아오고, 사용자는 "이번 달에 낼 게 없다" 로 읽는다.
test('F-2. 월 형식이 틀리면 400 이다', async () => {
  const id = await createRule();
  const bad = ['2026-3', '202603', '2026/03', 'abc'];

  for (const month of bad) {
    const due = await fetch(`${BASE}/api/recurring-rules/due?month=${encodeURIComponent(month)}`);
    assert.strictEqual(due.status, 400, `GET /due?month=${month} 가 통과했다`);

    for (const action of ['confirm', 'skip']) {
      const r = await fetch(`${BASE}/api/recurring-rules/${id}/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      });
      assert.strictEqual(r.status, 400, `POST /${action} month=${month} 가 통과했다`);
    }
  }

  // 형식이 맞으면 통과한다 — 400 만 확인하면 전부 거부해도 통과한다.
  const ok = await fetch(`${BASE}/api/recurring-rules/due?month=2026-03`);
  assert.strictEqual(ok.status, 200);
});

// 필드 검증은 POST 에서 일부만 확인돼 있었다. 정수여야 하는 자리에 문자열이
// 들어가면 SQLite 가 그대로 저장하고, 나중에 산술에서 문자열 연결이 된다.
test('F-3. 정수여야 하는 필드에 문자열이 오면 400 이다', async () => {
  const categories = await (await fetch(`${BASE}/api/categories`)).json();
  const category_id = (Array.isArray(categories) ? categories : categories.data)[0].id;

  // merchant 를 빼면 missingFields 가 먼저 400 을 내서 정수 검사에 도달하지 않는다.
  // 필수 필드를 전부 채운 상태에서 타입만 틀려야 이 분기가 돈다.
  const base = { merchant: '정수검증', day_of_month: 1, freq: 'monthly' };
  const cases = [
    { name: 'category_id', body: { ...base, category_id: '첫번째', amount: 1000 } },
    { name: 'amount', body: { ...base, category_id, amount: '만원' } },
    { name: 'payment_method_id', body: { ...base, category_id, amount: 1000, payment_method_id: '카드' } },
  ];
  for (const c of cases) {
    const r = await fetch(`${BASE}/api/recurring-rules`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `검증-${c.name}`, ...c.body }),
    });
    assert.strictEqual(r.status, 400, `${c.name} 이 문자열인데 통과했다`);
  }
});
