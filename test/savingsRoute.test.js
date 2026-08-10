const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { startTestServer } = require('./helpers/testServer');

// savings 라우트에 대한 HTTP 테스트
//
// 서버 기동은 공용 헬퍼가 맡는다(#379). 예전에는 이 파일이 직접 spawn 하고
// 15초를 폴링했는데, 서버가 준비 전에 죽어도 그걸 모르고 상한을 채웠다 —
// CI 에서 실제로 15,033ms 를 기다린 끝에 실패했다. 헬퍼는 종료를 즉시 잡는다.

const PORT = 34602; // 다른 테스트 파일과 충돌 안 나게 임의 포트 사용
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
});

after(() => {
  if (server) server.stop();
});

test('savings 라우트 — 생성/조회/수정/삭제/만기처리 전체 왕복', async () => {
  // 1. POST로 적금 상품 생성
  const createResp = await fetch(`${BASE}/api/savings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      name: '테스트 적금',
      monthly_contribution: 100000,
      start_date: '2024-01-01'
    }),
  });
  assert.strictEqual(createResp.status, 201);
  const { id } = await createResp.json();

  // GET 목록에 나타나는지 확인
  const list1 = await (await fetch(`${BASE}/api/savings`)).json();
  const created = list1.data.find(d => d.id === id);
  assert.ok(created);
  assert.strictEqual(created.name, '테스트 적금');
  assert.strictEqual(created.monthly_contribution, 100000);
  assert.strictEqual(created.start_date, '2024-01-01');

  // 필수 필드 누락 시 400 오류
  const badCreateResp = await fetch(`${BASE}/api/savings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '테스트 적금' }),
  });
  assert.strictEqual(badCreateResp.status, 400);

  // 2. PUT으로 일부 필드만 갱신 시 나머지 필드가 유지되는지 확인
  const putResp = await fetch(`${BASE}/api/savings/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ monthly_contribution: 150000 }),
  });
  assert.strictEqual(putResp.status, 200);

  const list2 = await (await fetch(`${BASE}/api/savings`)).json();
  const updated = list2.data.find(d => d.id === id);
  assert.strictEqual(updated.monthly_contribution, 150000);
  assert.strictEqual(updated.name, '테스트 적금', 'PUT은 부분 갱신이라 보내지 않은 필드가 유지돼야 함');

  // 3. POST /:id/mature 호출 시 응답에 principal/interest/payout이 들어있는지
  const matureResp = await fetch(`${BASE}/api/savings/${id}/mature`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settle_date: '2024-12-31' }),
  });
  assert.strictEqual(matureResp.status, 200);
  const matureBody = await matureResp.json();
  assert.ok(matureBody.principal !== undefined);
  assert.ok(matureBody.interest !== undefined);
  assert.ok(matureBody.payout !== undefined);

  // 이미 완료 처리된 상품에 다시 mature 호출하면 400 오류
  const repeatMatureResp = await fetch(`${BASE}/api/savings/${id}/mature`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
  });
  assert.strictEqual(repeatMatureResp.status, 400);

  // DELETE로 삭제
  const delResp = await fetch(`${BASE}/api/savings/${id}`, { method: 'DELETE' });
  assert.strictEqual(delResp.status, 200);

  const list3 = await (await fetch(`${BASE}/api/savings`)).json();
  assert.ok(!list3.data.some(d => d.id === id));
});

// 만기 처리에서 **이자 수입 거래를 만드는 분기**가 안 덮여 있었다. 위 테스트는
// expected_payout 을 주지 않아 이자가 항상 0 이고, 단언도 `interest !== undefined`
// 뿐이라 값이 0 이어도 통과한다. 거래가 실제로 생겼는지도 보지 않는다.
//
// 이 분기가 조용히 깨지면 만기 때 원금만 기록되고 이자 수입이 빠진다. 사용자
// 입장에서는 수입이 과소 계상된 상태로 남는다.
test('savings 만기 — 이자가 있으면 원금 회수와 이자 수입이 각각 거래로 남는다', async () => {
  const cats = await (await fetch(`${BASE}/api/categories`)).json();
  const rows = Array.isArray(cats) ? cats : cats.data;
  const savingCat = rows.find((c) => c.major_type !== '수입');

  // 12개월 × 10만원 = 120만원 납입, 만기 수령 126만원 → 이자 6만원
  const createResp = await fetch(`${BASE}/api/savings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '이자붙는적금',
      monthly_contribution: 100000,
      start_date: '2025-01-01',
      maturity_date: '2025-12-31',
      expected_payout: 1260000,
      category_id: savingCat.id,
    }),
  });
  assert.strictEqual(createResp.status, 201);
  const { id } = await createResp.json();

  const before = await (await fetch(`${BASE}/api/transactions?limit=200`)).json();

  const matureResp = await fetch(`${BASE}/api/savings/${id}/mature`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settle_date: '2025-12-31' }),
  });
  assert.strictEqual(matureResp.status, 200);
  const body = await matureResp.json();

  assert.strictEqual(body.principal, 1200000, '원금은 월납입 × 개월수다');
  assert.strictEqual(body.interest, 60000, '이자는 수령액에서 원금을 뺀 값이다');

  const after = await (await fetch(`${BASE}/api/transactions?limit=200`)).json();
  assert.strictEqual(after.data.length, before.data.length + 2, '원금과 이자가 각각 남아야 한다');

  const added = after.data.filter((t) => !before.data.some((b) => b.id === t.id));
  const principalTx = added.find((t) => t.amount === -1200000);
  const interestTx = added.find((t) => t.amount === 60000);

  assert.ok(principalTx, `원금 회수 거래가 없다: ${JSON.stringify(added.map((t) => t.amount))}`);
  assert.ok(interestTx, `이자 수입 거래가 없다: ${JSON.stringify(added.map((t) => t.amount))}`);
  assert.match(interestTx.memo || '', /이자/, '이자 거래임을 알 수 있어야 한다');
  assert.strictEqual(interestTx.major_type, '수입', '이자는 수입으로 잡혀야 한다');
});
