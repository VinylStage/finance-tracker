const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { startTestServer } = require('./helpers/testServer');

const PORT = 21500;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
});

after(() => {
  if (server) server.stop();
});

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function put(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function del(path) {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' });
  return { status: res.status, body: await res.json() };
}

async function categories() {
  const res = await fetch(`${BASE}/api/categories?include_inactive=1`);
  const json = await res.json();
  return json.data || json;
}

let categoryId;

test('정상 생성은 201 과 id 를 준다', async () => {
  const resp = await post('/api/categories', { major_type: '고정지출', name: '프로브', monthly_budget: 1000 });
  assert.strictEqual(resp.status, 201);
  assert.ok(Number.isInteger(resp.body.id));
  categoryId = resp.body.id;
});

test('같은 이름을 또 만들면 500 이고 내부 오류가 새지 않는다', async () => {
  const resp = await post('/api/categories', { major_type: '고정지출', name: '프로브', monthly_budget: 1000 });
  assert.strictEqual(resp.status, 500);
  assert.strictEqual(resp.body.error, '처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.');
  assert.ok(!resp.body.error.includes('SQLITE'));
  assert.ok(!resp.body.error.includes('UNIQUE'));
  assert.ok(!resp.body.error.includes('constraint'));
});

test('모르는 대분류는 400 으로 막는다', async () => {
  const resp = await post('/api/categories', { major_type: 'X', name: 'y' });
  assert.strictEqual(resp.status, 400);
  assert.ok(resp.body.error.startsWith('major_type must be one of '));
});

test('수정에서 예산과 활성 여부를 생략하면 기본값이 들어간다', async () => {
  const resp = await put(`/api/categories/${categoryId}`, { major_type: '고정지출', name: '프로브2' });
  assert.strictEqual(resp.status, 200);

  const cats = await categories();
  const cat = cats.find(c => c.id === categoryId);
  assert.strictEqual(cat.monthly_budget, 0);
  assert.strictEqual(cat.is_active, 1);
});

test('수정도 모르는 대분류를 막는다', async () => {
  const resp = await put(`/api/categories/${categoryId}`, { major_type: 'X', name: 'z' });
  assert.strictEqual(resp.status, 400);

  const cats = await categories();
  const cat = cats.find(c => c.id === categoryId);
  assert.strictEqual(cat.name, '프로브2');
});

test('삭제는 행을 지우지 않고 비활성으로 둔다', async () => {
  const resp = await del(`/api/categories/${categoryId}`);
  assert.strictEqual(resp.status, 200);
  assert.strictEqual(resp.body.ok, true);

  const cats = await categories();
  const cat = cats.find(c => c.id === categoryId);
  assert.ok(cat);
  assert.strictEqual(cat.is_active, 0);
});

test('결제수단도 같은 이름을 또 만들면 500 이고 문구가 같다', async () => {
  const resp1 = await post('/api/payment-methods', { name: '프로브카드', type: '신용' });
  assert.strictEqual(resp1.status, 201);

  const resp2 = await post('/api/payment-methods', { name: '프로브카드', type: '신용' });
  assert.strictEqual(resp2.status, 500);
  assert.strictEqual(resp2.body.error, '처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.');
  assert.ok(!resp2.body.error.includes('UNIQUE'));
});
