const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// FND-12(감사, B안): revolving 라우트에 HTTP 테스트가 전무했다. POST/PUT
// 잔액 계산(FND-06과 연계)뿐 아니라 current_carried_balance가 항상 "최신 달"
// 기준인지, 월/카드 중복 등록이 막히는지까지 왕복으로 확인한다.

const PORT = 34574; // 다른 테스트와 충돌 안 나게 임의 포트 사용
const BASE = `http://127.0.0.1:${PORT}`;
let server;
let dbPath;

before(async () => {
  server = await startTestServer({ port: PORT });
  dbPath = server.dbPath;
});

after(() => {
  if (server) server.stop();
});

test('revolving 라우트 — 생성/중복거부/조회/수정/삭제와 잔액·최신월 계산', async () => {
  const pmResp = await fetch(`${BASE}/api/payment-methods`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '리볼빙라우트테스트카드', type: '신용카드' }),
  });
  const pm = await pmResp.json();

  // 1월 생성 — next_carried_balance = 100000+50000-30000+5000 = 125000
  const create1 = await fetch(`${BASE}/api/revolving`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      month: '2026-01', payment_method_id: pm.id,
      carried_balance: 100000, new_charge: 50000, paid_amount: 30000, interest: 5000,
    }),
  });
  assert.strictEqual(create1.status, 201);
  const { id: id1 } = await create1.json();

  // 동일 월/카드 중복 등록 — 409
  const dupResp = await fetch(`${BASE}/api/revolving`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month: '2026-01', payment_method_id: pm.id, paid_amount: 0 }),
  });
  assert.strictEqual(dupResp.status, 409);

  const list1 = await (await fetch(`${BASE}/api/revolving?payment_method_id=${pm.id}`)).json();
  assert.strictEqual(list1.data[0].next_carried_balance, 125000);
  assert.strictEqual(list1.current_carried_balance, 125000);

  // 2월 생성 — 완납(next_carried_balance = 0)
  const create2 = await fetch(`${BASE}/api/revolving`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      month: '2026-02', payment_method_id: pm.id,
      carried_balance: 125000, new_charge: 0, paid_amount: 125000, interest: 0,
    }),
  });
  assert.strictEqual(create2.status, 201);

  // current_carried_balance는 항상 최신(2월) 기준이어야 함(월 내림차순 정렬 첫 항목)
  const list2 = await (await fetch(`${BASE}/api/revolving?payment_method_id=${pm.id}`)).json();
  assert.strictEqual(list2.data.length, 2);
  assert.strictEqual(list2.data[0].month, '2026-02');
  assert.strictEqual(list2.current_carried_balance, 0);

  // 1월 항목 수정(부분 갱신) — paid_amount만 변경, 나머지는 기존값 유지돼 재계산
  const putResp = await fetch(`${BASE}/api/revolving/${id1}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paid_amount: 40000 }),
  });
  assert.strictEqual(putResp.status, 200);

  const list3 = await (await fetch(`${BASE}/api/revolving?payment_method_id=${pm.id}`)).json();
  const updated = list3.data.find(r => r.id === id1);
  assert.strictEqual(updated.next_carried_balance, 100000 + 50000 - 40000 + 5000);

  // 2월 항목 삭제 — 1월만 남아야 함
  const delResp = await fetch(`${BASE}/api/revolving/${list2.data[0].id}`, { method: 'DELETE' });
  assert.strictEqual(delResp.status, 200);

  const list4 = await (await fetch(`${BASE}/api/revolving?payment_method_id=${pm.id}`)).json();
  assert.strictEqual(list4.data.length, 1);
  assert.strictEqual(list4.data[0].id, id1);
});
