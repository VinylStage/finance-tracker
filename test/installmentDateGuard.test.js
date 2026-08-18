const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { startTestServer } = require('./helpers/testServer');

// 포트는 20000~21999 에서 고른다(#627). 21615 는 아직 아무 테스트도 쓰지 않는다.
const PORT = 21615;
const BASE = `http://127.0.0.1:${PORT}`;
let server;
let categoryId;

before(async () => {
  server = await startTestServer({ port: PORT });
  // 카테고리는 초기 데이터에 있다. **id 를 숫자로 적지 않고 목록에서 읽는다.**
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

test('정상 할부는 201 이고 회차가 12건 생긴다', async () => {
  const res = await req('POST', '/api/installments', payload('정상할부'));
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.derived.created, 12);
});

test('글자로 된 구입일은 400 이다', async () => {
  const res = await req('POST', '/api/installments', payload('깨진구입일', { purchase_date: '언젠가' }));
  assert.strictEqual(res.status, 400);
  assert.ok(res.body.error.includes('YYYY-MM-DD'));
});

test('글자로 된 첫 청구월은 400 이고, 거래가 하나도 안 생긴다', async () => {
  const res = await req('POST', '/api/installments', payload('깨진청구월', { start_billing_month: '언젠가' }));
  assert.strictEqual(res.status, 400);

  const all = await req('GET', '/api/transactions');
  const rows = Array.isArray(all.body) ? all.body : all.body.data;
  assert.ok(!rows.some((t) => String(t.date).includes('NaN')), 'NaN 날짜 거래가 생겼다');
});

test('형식은 맞는데 없는 달은 400 이다', async () => {
  const res = await req('POST', '/api/installments', payload('없는달', { start_billing_month: '2026-13' }));
  assert.strictEqual(res.status, 400);
});

test('형식은 맞는데 없는 날짜도 400 이다', async () => {
  const res = await req('POST', '/api/installments', payload('없는날', { purchase_date: '2026-13-45' }));
  assert.strictEqual(res.status, 400);
});

test('수정으로도 깨진 값을 못 넣는다', async () => {
  const created = await req('POST', '/api/installments', payload('수정대상'));
  const id = created.body.id;

  const res = await req('PUT', `/api/installments/${id}`, { start_billing_month: '언젠가' });
  assert.strictEqual(res.status, 400);
});

// 날짜를 안 보낸 수정까지 막으면 「이름만 고치기」 가 400 이 된다.
// PUT 의 검사가 `!== undefined` 를 잃으면 이 테스트만 깨진다 — 나머지 여섯 개는
// 전부 통과하므로 이 축을 따로 가르지 않으면 그 회귀가 안 보인다.
test('날짜를 안 보낸 수정은 그대로 통과한다', async () => {
  const created = await req('POST', '/api/installments', payload('이름만고침'));
  const id = created.body.id;

  const res = await req('PUT', `/api/installments/${id}`, { merchant: '고친이름' });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
});
