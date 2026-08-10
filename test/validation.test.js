// 서버 기동은 공용 헬퍼가 맣는다(#379). 조기 종료를 즉시 감지한다.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const PORT = 34597; // 다른 테스트와 충돌 안 나게 임의 포트 사용
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
});

after(() => {
  if (server) server.stop();
});

test('POST /api/transactions - 허용되지 않은 payment_style은 400', async () => {
  const categoriesResp = await fetch(`${BASE}/api/categories`);
  const categories = await categoriesResp.json();
  const categoryId = categories[0].id;

  const resp = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: '2026-01-15', category_id: categoryId, amount: 1000, payment_style: '없는값' })
  });
  assert.strictEqual(resp.status, 400);
  const body = await resp.json();
  assert.match(body.error, /payment_style/);
});

test('POST /api/transactions - 정상 payment_style(할부)은 201', async () => {
  const categoriesResp = await fetch(`${BASE}/api/categories`);
  const categories = await categoriesResp.json();
  const categoryId = categories[0].id;

  const resp = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: '2026-01-15', category_id: categoryId, amount: 1000, payment_style: '할부' })
  });
  assert.strictEqual(resp.status, 201);
});

test('POST /api/categories - 허용되지 않은 major_type은 400', async () => {
  const resp = await fetch(`${BASE}/api/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ major_type: '없는분류', name: '테스트카테고리' })
  });
  assert.strictEqual(resp.status, 400);
  const body = await resp.json();
  assert.match(body.error, /major_type/);
});

test('POST /api/categories - 카드 임포트가 자동 생성하는 미분류는 허용', async () => {
  const resp = await fetch(`${BASE}/api/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ major_type: '미분류', name: '미분류-검증테스트' })
  });
  assert.strictEqual(resp.status, 201);
});

test('PUT /api/categories/:id - 허용되지 않은 major_type은 400', async () => {
  const categoriesResp = await fetch(`${BASE}/api/categories`);
  const categories = await categoriesResp.json();
  const target = categories[0];

  const resp = await fetch(`${BASE}/api/categories/${target.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ major_type: '없는분류', name: target.name, monthly_budget: target.monthly_budget })
  });
  assert.strictEqual(resp.status, 400);
});

// PUT 은 400 경로만 테스트돼 있었다. 성공 경로에서 `monthly_budget ?? 0` 과
// `is_active ?? 1` 로 기본값을 채우는 분기가 비어 있다(커버리지 45~46행).
//
// 이 기본값이 사라지면 두 필드를 안 보낸 PUT 이 NULL 을 쓴다. 예산이 NULL 이면
// 대시보드의 예산 대비 지출이 계산되지 않고, is_active 가 NULL 이면 카테고리가
// 목록에서 사라진다. 화면은 항상 두 값을 채워 보내지만 API 는 직접 호출된다.
test('PUT /api/categories/:id - 예산과 사용여부를 생략하면 기본값이 들어간다', async () => {
  const created = await fetch(`${BASE}/api/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ major_type: '선택지출', name: '기본값검증-' + Date.now(), monthly_budget: 50000 }),
  });
  assert.strictEqual(created.status, 201);
  const { id } = await created.json();

  // major_type 과 name 만 보낸다.
  const resp = await fetch(`${BASE}/api/categories/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ major_type: '선택지출', name: '기본값검증-수정' }),
  });
  assert.strictEqual(resp.status, 200, await resp.text());

  const list = await (await fetch(`${BASE}/api/categories`)).json();
  const rows = Array.isArray(list) ? list : list.data;
  const after = rows.find((c) => c.id === id);

  assert.ok(after, '수정한 카테고리를 목록에서 찾을 수 없다');
  assert.strictEqual(after.name, '기본값검증-수정');
  assert.strictEqual(after.monthly_budget, 0, '예산을 안 보내면 0 이어야 한다 (NULL 이면 예산 계산이 깨진다)');
  assert.strictEqual(after.is_active, 1, '사용여부를 안 보내면 1 이어야 한다 (NULL 이면 목록에서 사라진다)');
});
