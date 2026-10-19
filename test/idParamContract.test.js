'use strict';

// #734 — 형식이 틀린 :id 와 limit·offset 은 400, 형식이 맞는데 없는 id 는 404.
// 비카드 라우터 8곳이 router.param('id', requireIdParam) 하나로 같은 답을 낸다.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const PORT = 21734;
const BASE = `http://127.0.0.1:${PORT}`;
const ID_ERROR = 'id 는 1 이상의 정수여야 합니다.';
const LIST_ERROR = 'limit·offset 은 정수여야 합니다.';
let server;

async function call(method, path) {
  const res = await fetch(`${BASE}${path}`, { method });
  return { status: res.status, body: await res.json() };
}

before(async () => { server = await startTestServer({ port: PORT }); });
after(() => { if (server) server.stop(); });

test('라우터 8곳 모두 글자 id 는 400 과 같은 문구', async () => {
  const paths = [
    '/api/categories/abc',
    '/api/payment-methods/abc',
    '/api/debts/abc',
    '/api/revolving/abc',
    '/api/recurring-rules/abc',
    '/api/savings/abc',
    '/api/installments/abc'
  ];
  
  for (const path of paths) {
    const res = await call('DELETE', path);
    assert.strictEqual(res.status, 400, `path: ${path}`);
    assert.strictEqual(res.body.error, ID_ERROR, `path: ${path}`);
  }
  
  const res = await call('GET', '/api/transactions/abc');
  assert.strictEqual(res.status, 400, `path: /api/transactions/abc`);
  assert.strictEqual(res.body.error, ID_ERROR, `path: /api/transactions/abc`);
});

test('0·음수·소수 id 도 400', async () => {
  const paths = [
    '/api/categories/0',
    '/api/savings/-3',
    '/api/installments/1.5'
  ];
  
  for (const path of paths) {
    const res = await call('DELETE', path);
    assert.strictEqual(res.status, 400, `path: ${path}`);
  }
});

test('형식이 맞는데 없는 id 는 404', async () => {
  const res1 = await call('DELETE', '/api/categories/999999');
  assert.strictEqual(res1.status, 404, `/api/categories/999999`);
  
  const res2 = await call('GET', '/api/transactions/999999');
  assert.strictEqual(res2.status, 404, `/api/transactions/999999`);
});

test('중첩 경로의 id 도 같은 검사', async () => {
  const res = await call('DELETE', '/api/debts/1/repayments/abc');
  assert.strictEqual(res.status, 400, `/api/debts/1/repayments/abc`);
  assert.strictEqual(res.body.error, ID_ERROR, `/api/debts/1/repayments/abc`);
});

test('거래 목록 limit·offset 이 정수가 아니면 400', async () => {
  const res1 = await call('GET', '/api/transactions?limit=12abc');
  assert.strictEqual(res1.status, 400, `/api/transactions?limit=12abc`);
  assert.strictEqual(res1.body.error, LIST_ERROR, `/api/transactions?limit=12abc`);
  
  const res2 = await call('GET', '/api/transactions?offset=x');
  assert.strictEqual(res2.status, 400, `/api/transactions?offset=x`);
  assert.strictEqual(res2.body.error, LIST_ERROR, `/api/transactions?offset=x`);
});

test('감사 이력 limit 이 정수가 아니면 400', async () => {
  const res = await call('GET', '/api/audit/log?limit=12abc');
  assert.strictEqual(res.status, 400, `/api/audit/log?limit=12abc`);
  assert.strictEqual(res.body.error, LIST_ERROR, `/api/audit/log?limit=12abc`);
});

test('정상 목록 요청과 limit=0 은 그대로 200', async () => {
  const res1 = await call('GET', '/api/transactions?limit=0');
  assert.strictEqual(res1.status, 200, `/api/transactions?limit=0`);
  
  const res2 = await call('GET', '/api/audit/log?limit=5');
  assert.strictEqual(res2.status, 200, `/api/audit/log?limit=5`);
});
