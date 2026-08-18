const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { startTestServer } = require('./helpers/testServer');

// 포트는 20000~21999 에서 고른다(#627). 21621 은 아직 아무 테스트도 쓰지 않는다.
const PORT = 21621;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
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

// 정상 부채 본문. over 로 한 필드만 오염시켜 쓴다.
function payload(name, over = {}) {
  return {
    name,
    balance: 1000000,
    annual_rate: 5,
    interest_day: 25,
    ...over,
  };
}

test('정상 부채는 201 이다', async () => {
  const res = await req('POST', '/api/debts', payload('정상부채'));
  assert.strictEqual(res.status, 201);
});

test('잔액이 음수면 400 이다', async () => {
  const res = await req('POST', '/api/debts', payload('음수잔액', { balance: -1000000 }));
  assert.strictEqual(res.status, 400);
  assert.ok(res.body.error.includes('잔액'));
});

test('잔액 0 은 통과한다', async () => {
  const res = await req('POST', '/api/debts', payload('완납부채', { balance: 0 }));
  assert.strictEqual(res.status, 201);
});

test('이자일이 달력 밖이면 400 이다', async () => {
  // 0 일
  const res0 = await req('POST', '/api/debts', payload('이자일0', { interest_day: 0 }));
  assert.strictEqual(res0.status, 400);
  assert.ok(res0.body.error.includes('이자일'));

  // 40 일
  const res40 = await req('POST', '/api/debts', payload('이자일40', { interest_day: 40 }));
  assert.strictEqual(res40.status, 400);
  assert.ok(res40.body.error.includes('이자일'));
});

test('이자일을 안 주면 통과한다', async () => {
  const res = await req('POST', '/api/debts', payload('이자일없음', { interest_day: null }));
  assert.strictEqual(res.status, 201);
});

test('수정으로도 못 넣는다', async () => {
  // 먼저 생성
  const createRes = await req('POST', '/api/debts', payload('수정대상'));
  assert.strictEqual(createRes.status, 201);
  const id = createRes.body.id;

  // 수정 시도 - 이자일이 40이면 안 됨
  const updateRes = await req('PUT', `/api/debts/${id}`, { interest_day: 40 });
  assert.strictEqual(updateRes.status, 400);

  // 이어서 정상 수정
  const normalUpdateRes = await req('PUT', `/api/debts/${id}`, { name: '이름만고침' });
  assert.strictEqual(normalUpdateRes.status, 200);
});

// 예전에 들어온 나쁜 값이 행에 남아 있어도 다른 필드는 고칠 수 있어야 한다.
//
// PUT 이 `req.body` 가 아니라 `merged` 를 보면 이 부채는 **이름조차 못 고친다** —
// 저장된 interest_day 40 이 매번 400 을 낸다. 그 축을 가르려면 나쁜 값이 이미
// 들어 있는 행이 필요하고, 라우트가 이제 그걸 안 받으므로 DB 에 직접 넣는다.
test('예전에 들어온 나쁜 값이 남아 있어도 이름은 고칠 수 있다', async () => {
  const db = require('better-sqlite3')(server.dbPath);
  const id = db.prepare("INSERT INTO debts (name, balance, annual_rate, interest_day) VALUES ('묵은부채', 1000000, 5, 40)").run().lastInsertRowid;
  db.close();

  const res = await req('PUT', `/api/debts/${id}`, { name: '고친이름' });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
});
