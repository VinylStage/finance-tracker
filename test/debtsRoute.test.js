const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const PORT = 34575;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
  // 기존 before 안에 있던 나머지 준비 작업은 이 아래에 그대로 남긴다
});

after(() => {
  if (server) server.stop();
});

test('debts 라우트 — 생성/조회/이자흐름/이력조회/수정/삭제 전체 왕복', async () => {
  // 생성
  const createResp = await fetch(`${BASE}/api/debts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '학자금대출', balance: 1000000, annual_rate: 12 }),
  });
  assert.strictEqual(createResp.status, 201);
  const { id } = await createResp.json();

  // 조회 — monthly_interest = 1000000 * 12 / 100 / 12 = 10000
  const list1 = await (await fetch(`${BASE}/api/debts`)).json();
  const created = list1.data.find(d => d.id === id);
  assert.ok(created);
  assert.strictEqual(created.monthly_interest, 10000);
  assert.ok(list1.total_balance >= 1000000);
  assert.ok(list1.total_monthly_interest >= 10000);

  // 이자 추가 — 잔액에 정확히 반영되는지(FND-06 이자 계산 흐름)
  const interestResp = await fetch(`${BASE}/api/debts/${id}/interest`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rate: 12, interest_amount: 10000, log_date: '2026-01-15' }),
  });
  assert.strictEqual(interestResp.status, 201);
  const interestBody = await interestResp.json();
  assert.strictEqual(interestBody.balance_after, 1010000);

  // 이자 이력 조회
  const logResp = await (await fetch(`${BASE}/api/debts/${id}/interest-log`)).json();
  assert.strictEqual(logResp.data.length, 1);
  assert.strictEqual(logResp.data[0].balance_before, 1000000);
  assert.strictEqual(logResp.data[0].balance_after, 1010000);

  // 수정 — 잔액 직접 조정
  const putResp = await fetch(`${BASE}/api/debts/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ balance: 500000 }),
  });
  assert.strictEqual(putResp.status, 200);

  const list2 = await (await fetch(`${BASE}/api/debts`)).json();
  const updated = list2.data.find(d => d.id === id);
  assert.strictEqual(updated.balance, 500000);
  assert.strictEqual(updated.name, '학자금대출', 'PUT은 부분 갱신이라 보내지 않은 필드가 유지돼야 함');

  // 삭제 — 이자 이력도 함께 지워지는지(FK 위반 없이 삭제 자체가 증거)
  const delResp = await fetch(`${BASE}/api/debts/${id}`, { method: 'DELETE' });
  assert.strictEqual(delResp.status, 200);

  const list3 = await (await fetch(`${BASE}/api/debts`)).json();
  assert.ok(!list3.data.some(d => d.id === id));
});
