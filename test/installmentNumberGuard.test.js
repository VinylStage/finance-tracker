const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { startTestServer } = require('./helpers/testServer');

// 포트는 20000~21999 에서 고른다(#627). 21653 은 아직 아무 테스트도 쓰지 않는다.
const PORT = 21653;
const BASE = `http://127.0.0.1:${PORT}`;
let server;
let categoryId;

before(async () => {
  server = await startTestServer({ port: PORT });
  const listed = await req('GET', '/api/categories');
  const rows = Array.isArray(listed.body) ? listed.body : listed.body.data;
  categoryId = rows[0].id;
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

// 정상 할부 본문. over 로 한 필드만 오염시켜 쓴다.
function payload(merchant, over = {}) {
  return {
    purchase_date: '2026-01-05',
    merchant,
    total_amount: 120000,
    months: 12,
    monthly_amount: 10000,
    fee_per_month: 0,
    payment_method_id: null,
    start_billing_month: '2026-03',
    category_id: categoryId,
    ...over,
  };
}

// 전체 거래 수. 회차가 실제로 생겼는지 볼 때 쓴다.
async function totalTransactions() {
  const listed = await req('GET', '/api/transactions?limit=1');
  return listed.body.total;
}

test('정상 할부는 201 이고 회차가 12건 생긴다', async () => {
  const res = await req('POST', '/api/installments', payload('정상할부'));
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.derived.created, 12);
});

test('개월수가 상한을 넘으면 400 이고, 거래가 하나도 안 생긴다', async () => {
  const beforeCount = await totalTransactions();
  const res = await req('POST', '/api/installments', payload('천개월', { months: 1000 }));
  assert.strictEqual(res.status, 400);
  assert.ok(res.body.error.includes('120'));
  const afterCount = await totalTransactions();
  assert.strictEqual(beforeCount, afterCount);
});

test('상한 바로 위는 400 이다', async () => {
  const res = await req('POST', '/api/installments', payload('백이십일개월', { months: 121 }));
  assert.strictEqual(res.status, 400);
});

test('상한 자체는 통과한다', async () => {
  const res = await req('POST', '/api/installments', payload('백이십개월', { months: 120, total_amount: 1200000, monthly_amount: 10000 }));
  assert.strictEqual(res.status, 201);
});

test('총액이 음수면 400 이고 500 이 아니다', async () => {
  const res = await req('POST', '/api/installments', payload('음수총액', { total_amount: -120000 }));
  assert.strictEqual(res.status, 400);
  assert.ok(!res.body.error.includes('처리 중 문제가 생겼습니다'));
});

test('월 납입액이 음수면 400 이다', async () => {
  const res = await req('POST', '/api/installments', payload('음수월납', { monthly_amount: -10000 }));
  assert.strictEqual(res.status, 400);
});

test('이름만 고치는 수정은 그대로 통과한다', async () => {
  const created = await req('POST', '/api/installments', payload('수정대상'));
  const id = created.body.id;

  const res1 = await req('PUT', `/api/installments/${id}`, { merchant: '고친이름' });
  assert.strictEqual(res1.status, 200);

  const res2 = await req('PUT', `/api/installments/${id}`, { months: 1000 });
  assert.strictEqual(res2.status, 400);
});

// 예전에 들어온 나쁜 값이 행에 남아 있어도 다른 필드는 고칠 수 있어야 한다.
//
// PUT 이 `changes` 가 아니라 합쳐진 값을 보면 이 할부는 **이름조차 못 고친다** —
// 저장된 months 1000 이 매번 400 을 낸다. 그 축을 가르려면 나쁜 값이 이미 들어 있는
// 행이 필요하고, 생성 라우트가 이제 그걸 막으므로 DB 에 직접 넣는다.
test('예전에 들어온 큰 개월수가 남아 있어도 이름은 고칠 수 있다', async () => {
  const db = require('better-sqlite3')(server.dbPath);
  const id = db.prepare(`
    INSERT INTO installments (purchase_date, merchant, total_amount, months, monthly_amount, fee_per_month, start_billing_month, category_id)
    VALUES ('2026-01-05', '묵은할부', 120000, 1000, 10000, 0, '2026-03', ?)
  `).run(categoryId).lastInsertRowid;
  db.close();

  const res = await req('PUT', `/api/installments/${id}`, { merchant: '고친이름' });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
});
