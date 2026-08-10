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

// 위 테스트는 성공 경로만 지난다. 사용자가 만나는 거부 경로가 통째로 비어 있었다
// (분기 커버리지 69.5%). 아래는 그중 실제 로직인 것들이다 — catch 방어 블록은
// DB 를 강제로 깨뜨려야 도달해서 제외했다.

test('E-1. 없는 부채를 건드리면 404 다', async () => {
  const gone = 999999;

  const put = await fetch(`${BASE}/api/debts/${gone}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ balance: 1000 }),
  });
  const putBody = await put.json();
  assert.strictEqual(put.status, 404, JSON.stringify(putBody));
  assert.ok(putBody.error, '거부 사유가 없다');

  const interest = await fetch(`${BASE}/api/debts/${gone}/interest`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rate: 5, interest_amount: 100, log_date: '2026-01-01' }),
  });
  const interestBody = await interest.json();
  assert.strictEqual(interest.status, 404, JSON.stringify(interestBody));
  assert.ok(interestBody.error, '거부 사유가 없다');
});

test('E-2. 생성에 이름이나 잔액이 없으면 400 이다', async () => {
  for (const body of [{ balance: 1000 }, { name: '이름만' }, { name: '', balance: 1000 }]) {
    const r = await fetch(`${BASE}/api/debts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.strictEqual(r.status, 400, `거부돼야 한다: ${JSON.stringify(body)}`);
    const err = await r.json();
    assert.ok(err.error, '거부 사유가 없다');
    for (const bad of ['balance', 'name']) {
      assert.ok(!err.error.includes(bad), `문구에 내부 필드명 노출: ${err.error}`);
    }
  }
});

test('E-3. 이자 기록에 필수 값이 빠지면 400 이고 잔액이 안 바뀐다', async () => {
  const created = await fetch(`${BASE}/api/debts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '거부검증부채', balance: 500000, annual_rate: 5 }),
  });
  const { id } = await created.json();

  const cases = [
    { name: '이자율 없음', body: { interest_amount: 1000, log_date: '2026-01-01' } },
    { name: '금액 없음', body: { rate: 5, log_date: '2026-01-01' } },
    { name: '기록일 없음', body: { rate: 5, interest_amount: 1000 } },
    { name: '이자율이 범위 밖', body: { rate: -3, interest_amount: 1000, log_date: '2026-01-01' } },
  ];
  for (const c of cases) {
    const r = await fetch(`${BASE}/api/debts/${id}/interest`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c.body),
    });
    assert.strictEqual(r.status, 400, `${c.name}: 거부돼야 한다`);
  }

  // 전부 거부됐으니 잔액은 그대로여야 한다. 400 만 보면 거부하고도 쓰는 경우를 놓친다.
  const list = await (await fetch(`${BASE}/api/debts`)).json();
  const after = list.data.find((d) => d.id === id);
  assert.strictEqual(after.balance, 500000, '거부됐는데 잔액이 바뀌었다');
});

test('E-4. 금리 조회는 날짜 형식을 본다', async () => {
  const created = await fetch(`${BASE}/api/debts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '금리조회부채', balance: 100000, annual_rate: 4.17 }),
  });
  const { id } = await created.json();

  for (const date of ['', '2026-1-1', '20260101', 'abc']) {
    const r = await fetch(`${BASE}/api/debts/${id}/rate-on?date=${encodeURIComponent(date)}`);
    assert.strictEqual(r.status, 400, `형식이 틀렸는데 통과했다: "${date}"`);
  }

  const ok = await fetch(`${BASE}/api/debts/${id}/rate-on?date=2026-01-01`);
  assert.strictEqual(ok.status, 200, await ok.text());
});

test('E-5. 없는 상환 기록을 지우면 404 다', async () => {
  const created = await fetch(`${BASE}/api/debts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '상환삭제부채', balance: 100000 }),
  });
  const { id } = await created.json();

  const r = await fetch(`${BASE}/api/debts/${id}/repayments/999999`, { method: 'DELETE' });
  const err = await r.json();
  assert.strictEqual(r.status, 404, JSON.stringify(err));
  assert.ok(err.error, '거부 사유가 없다');
});
