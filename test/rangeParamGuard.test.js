const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { startTestServer } = require('./helpers/testServer');

// 포트는 20000~21999 에서 고른다(#627). 21619 는 아직 아무 테스트도 쓰지 않는다.
const PORT = 21619;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
});

after(() => {
  if (server) server.stop();
});

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

// 이 이슈가 다루는 값들. 셋 다 「날짜가 아니다」 인데 예전 검사는 뒤의 둘을 놓쳤다.
const BAD_DATES = ['abcd-ef-gh', '2026-13-45', '2026-02-30'];

test('거래목록은 날짜가 아닌 from 을 전부 400 으로 되돌린다', async () => {
  for (const date of BAD_DATES) {
    const res = await get(`/api/transactions?from=${date}&to=2026-12-31`);
    assert.strictEqual(res.status, 400);
    assert(res.body.error !== '');
  }
});

test('거래목록은 날짜가 아닌 to 도 400 이다', async () => {
  for (const date of BAD_DATES) {
    const res = await get(`/api/transactions?from=2026-01-01&to=${date}`);
    assert.strictEqual(res.status, 400);
  }
});

test('기간을 안 주면 그대로 목록이 나온다', async () => {
  const res = await get(`/api/transactions`);
  assert.strictEqual(res.status, 200);
  assert(Array.isArray(res.body.data));
});

test('내보내기도 세 값을 전부 400 으로 되돌린다', async () => {
  for (const date of BAD_DATES) {
    const res = await get(`/api/export/json?from=${date}&to=2026-12-31`);
    assert.strictEqual(res.status, 400);
  }
});

test('제대로 준 기간은 두 곳 다 200 이다', async () => {
  // 윤년 테스트
  let res = await get(`/api/transactions?from=2024-02-29`);
  assert.strictEqual(res.status, 200);
  
  res = await get(`/api/transactions?from=2026-01-01&to=2026-12-31`);
  assert.strictEqual(res.status, 200);
  
  res = await get(`/api/export/json?from=2026-01-01&to=2026-12-31`);
  assert.strictEqual(res.status, 200);
});
