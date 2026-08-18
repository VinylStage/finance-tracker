const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { startTestServer } = require('./helpers/testServer');

// 포트는 20000~21999 에서 고른다(#627). 21625 는 아직 아무 테스트도 쓰지 않는다.
const PORT = 21625;
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
  let parsed = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed };
}

// 「글자꼴은 맞는데 날짜가 아닌」 값들. 예전 정규식은 이 넷을 전부 통과시켰다.
const BAD_DATES = ['2026-13-45', '2026-02-30', '0000-00-00', '2026-04-31'];

function txBody(merchant, over = {}) {
  return {
    date: '2026-03-01',
    category_id: categoryId,
    amount: -1000,
    payment_style: '해당없음',
    merchant,
    ...over,
  };
}

function ruleBody(merchant, over = {}) {
  return {
    merchant,
    category_id: categoryId,
    amount: -1000,
    day_of_month: 15,
    payment_style: '해당없음',
    freq: 'monthly',
    interval: 1,
    starts_on: '2026-01-01',
    ...over,
  };
}

test('거래는 네 값을 전부 400 으로 되돌린다', async () => {
  for (const date of BAD_DATES) {
    const res = await req('POST', '/api/transactions', txBody('나쁜날짜' + date, { date }));
    assert.strictEqual(res.status, 400);
  }
});

test('거래 수정도 막는다', async () => {
  const created = await req('POST', '/api/transactions', txBody('수정대상'));
  assert.strictEqual(created.status, 201);
  const id = created.body.id;

  const res = await req('PUT', `/api/transactions/${id}`, { date: '2026-13-45' });
  assert.strictEqual(res.status, 400);
});

test('제대로 된 날짜는 그대로 통과한다', async () => {
  const res1 = await req('POST', '/api/transactions', txBody('정상거래'));
  assert.strictEqual(res1.status, 201);

  const res2 = await req('POST', '/api/transactions', txBody('윤년거래', { date: '2024-02-29' }));
  assert.strictEqual(res2.status, 201);
});

test('반복규칙의 starts_on 도 네 값을 전부 400 으로 되돌린다', async () => {
  for (const date of BAD_DATES) {
    const res = await req('POST', '/api/recurring-rules', ruleBody('나쁜시작' + date, { starts_on: date }));
    assert.strictEqual(res.status, 400);
  }
});

test('반복규칙의 ends_on 도 막는다', async () => {
  const res = await req('POST', '/api/recurring-rules', ruleBody('나쁜끝', { ends_on: '2026-02-30' }));
  assert.strictEqual(res.status, 400);
});

test('제대로 된 반복규칙은 통과한다', async () => {
  const res = await req('POST', '/api/recurring-rules', ruleBody('정상규칙'));
  assert.strictEqual(res.status, 201);

  // 저장되지 않았는지 확인
  const all = await req('GET', '/api/transactions');
  const rows = Array.isArray(all.body) ? all.body : all.body.data;
  const dates = rows.map((t) => String(t.date));
  for (const bad of BAD_DATES) {
    assert.ok(!dates.includes(bad), `${bad} 인 거래가 저장됐다`);
  }
});
