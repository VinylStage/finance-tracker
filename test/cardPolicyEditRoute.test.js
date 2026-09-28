'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const PORT = 21649;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

async function api(method, url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* JSON 이 아닐 수 있다 */ }
  return { status: res.status, body: json, text };
}

let pmId;    // 숫자. 결제수단 id
let months = 1;   // 테스트마다 다른 개월수를 써서 서로 안 부딪치게 한다

// 다음 개월수를 준다. 2 부터 시작해 하나씩 올린다.
function nextMonths() {
  months += 1;
  return months;
}

// 정책 한 건을 만든다. 돌려주는 값은 숫자 id.
async function makePolicy(over = {}) {
  const res = await api('POST', '/api/card-policies', {
    payment_method_id: pmId,
    months: nextMonths(),
    policy_type: '무이자',
    annual_rate: 0,
    effective_from: '2026-01-01',
    effective_to: null,
    ...over,
  });
  assert.equal(res.status, 201, res.text);
  return res.body.id;
}

// 정책 한 건을 다시 읽는다. 없으면 undefined.
async function readPolicy(id) {
  const res = await api('GET', '/api/card-policies');
  assert.equal(res.status, 200, res.text);
  return (res.body.data || []).find((p) => p.id === id);
}

before(async () => {
  server = await startTestServer({ port: PORT });
  const pms = await api('GET', '/api/payment-methods');
  const rows = Array.isArray(pms.body) ? pms.body : pms.body.data;
  pmId = rows[0].id;
});

after(() => {
  // 단언이 던져도 자식을 죽인다. 살아남으면 러너가 상한까지 붙잡힌다.
  if (server) server.stop();
});

test('없는 id 를 고치면 404 다.', async () => {
  const res = await api('PUT', '/api/card-policies/999999', { policy_type: '무이자' });
  assert.equal(res.status, 404);
});

test('고치면 값이 실제로 바뀐다.', async () => {
  const id = await makePolicy();
  const res = await api('PUT', `/api/card-policies/${id}`, { memo: '고친메모' });
  assert.equal(res.status, 200);
  const policy = await readPolicy(id);
  assert.equal(policy.memo, '고친메모');
});

test('안 보낸 필드는 기존 값이 남는다.', async () => {
  const m = nextMonths();
  const id = await makePolicy({ months: m, memo: '원래메모' });
  const res = await api('PUT', `/api/card-policies/${id}`, { policy_type: '유이자', annual_rate: 15.9 });
  assert.equal(res.status, 200);
  const policy = await readPolicy(id);
  assert.equal(policy.memo, '원래메모');
  assert.equal(policy.months, m);
});

test('모르는 정책 종류는 400 이다.', async () => {
  const id = await makePolicy();
  const res = await api('PUT', `/api/card-policies/${id}`, { policy_type: '반값' });
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('무이자인데 이자율이 있으면 400 이다.', async () => {
  const id = await makePolicy();
  const res = await api('PUT', `/api/card-policies/${id}`, { policy_type: '무이자', annual_rate: 5 });
  assert.equal(res.status, 400);
});

test('부분무이자인데 면제 시작 회차가 1이면 400 이다.', async () => {
  const id = await makePolicy();
  const res = await api('PUT', `/api/card-policies/${id}`, { policy_type: '부분무이자', free_from_sequence: 1 });
  assert.equal(res.status, 400);
});

test('시작일이 종료일보다 늦으면 400 이다.', async () => {
  const id = await makePolicy();
  const res = await api('PUT', `/api/card-policies/${id}`, { effective_from: '2026-06-01', effective_to: '2026-03-01' });
  assert.equal(res.status, 400);
});

test('같은 결제수단·개월수에서 기간이 겹치면 409 다.', async () => {
  const m = nextMonths();
  await makePolicy({ months: m, effective_from: '2026-01-01', effective_to: '2026-06-30' });
  const b = await makePolicy({ months: m, effective_from: '2026-07-01', effective_to: null });
  const res = await api('PUT', `/api/card-policies/${b}`, { effective_from: '2026-03-01', effective_to: '2026-08-31' });
  assert.equal(res.status, 409);
});

test('자기 자신과는 안 겹친다고 본다.', async () => {
  const id = await makePolicy();
  const res = await api('PUT', `/api/card-policies/${id}`, { memo: '자기자신' });
  assert.equal(res.status, 200);
});

test('지우면 없어지고, 같은 것을 또 지우면 404 다.', async () => {
  const id = await makePolicy();
  let res = await api('DELETE', `/api/card-policies/${id}`);
  assert.equal(res.status, 200);
  assert.ok(await readPolicy(id) === undefined);
  res = await api('DELETE', `/api/card-policies/${id}`);
  assert.equal(res.status, 404);
});
