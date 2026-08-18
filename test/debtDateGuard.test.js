const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { startTestServer } = require('./helpers/testServer');

// 포트는 20000~21999 에서 고른다(#627). 21631 은 아직 아무 테스트도 쓰지 않는다.
const PORT = 21631;
const BASE = `http://127.0.0.1:${PORT}`;
let server;
let debtId;

before(async () => {
  server = await startTestServer({ port: PORT });

  const made = await req('POST', '/api/debts', {
    name: '기간테스트마통',
    balance: 1000000,
    annual_rate: 5,
    interest_day: 25,
    loan_type: 'credit_line',
    credit_limit: 5000000,
    interest_basis: 'daily',
  });
  assert.strictEqual(made.status, 201, JSON.stringify(made.body));
  debtId = made.body.id;

  const rate = await req('POST', `/api/debts/${debtId}/rates`, {
    annual_rate: 5,
    effective_from: '2025-01-01',
  });
  assert.strictEqual(rate.status, 201, JSON.stringify(rate.body));
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

function projection(from, to) {
  return req('GET', `/api/debts/${debtId}/interest-projection?from=${from}&to=${to}`);
}

// 「글자꼴은 맞는데 날짜가 아닌」 값들.
const BAD_DATES = ['2026-02-30', '2026-13-45', '0000-00-00', '2026-04-31'];

test('기간 시작일이 날짜가 아니면 400 이다', async () => {
  for (const date of BAD_DATES) {
    const res = await projection(date, '2026-12-31');
    assert.strictEqual(res.status, 400);
  }
});

test('기간 종료일도 막는다', async () => {
  for (const date of BAD_DATES) {
    const res = await projection('2026-01-01', date);
    assert.strictEqual(res.status, 400);
  }
});

test('정상 기간은 200 이고 이자가 일할로 나온다', async () => {
  const res = await projection('2026-01-01', '2026-01-31');
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.postings);
  assert.ok(res.body.data.postings.length > 0);
  assert.strictEqual(res.body.data.postings[0].interest, 3287);
  assert.strictEqual(res.body.data.postings[0].from, '2026-01-01');
});

test('금리 시작일이 날짜가 아니면 400 이다', async () => {
  for (const date of BAD_DATES) {
    const res = await req('POST', `/api/debts/${debtId}/rates`, {
      annual_rate: 6,
      effective_from: date
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error);
  }
});

test('제대로 된 금리 시작일은 201 이고, 그 뒤 계산이 여전히 된다', async () => {
  const res = await req('POST', `/api/debts/${debtId}/rates`, {
    annual_rate: 6,
    effective_from: '2026-06-01'
  });
  assert.strictEqual(res.status, 201);

  const projRes = await projection('2026-01-01', '2026-01-31');
  assert.strictEqual(projRes.status, 200);
});

// 「그 시점의 금리」 조회도 같은 문이다.
//
// 고치기 전에는 date=2026-02-30 이 200 { data: null } 을 냈다 — 없는 날짜인데
// 「그 시점에 금리가 없다」 고 답해서, 사용자는 금리 이력을 안 넣은 줄 안다.
test('금리 조회 날짜가 날짜가 아니면 400 이다', async () => {
  for (const bad of BAD_DATES) {
    const res = await req('GET', `/api/debts/${debtId}/rate-on?date=${bad}`);
    assert.strictEqual(res.status, 400, `${bad} 가 통과했다: ${JSON.stringify(res.body)}`);
  }

  // 정상 날짜는 그대로 답한다 — 검증을 넣다가 조회 자체를 막으면 안 된다.
  const ok = await req('GET', `/api/debts/${debtId}/rate-on?date=2026-01-15`);
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
});
