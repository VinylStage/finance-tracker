const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// FND-12(감사, B안): revolving 라우트에 HTTP 테스트가 전무했다. POST/PUT
// 잔액 계산(FND-06과 연계)뿐 아니라 current_carried_balance가 항상 "최신 달"
// 기준인지, 월/카드 중복 등록이 막히는지까지 왕복으로 확인한다.

const PORT = 34574; // 다른 테스트와 충돌 안 나게 임의 포트 사용
const BASE = `http://127.0.0.1:${PORT}`;
let serverProcess;
let dbPath;

let serverOutput = '';

before(async () => {
  dbPath = path.join(os.tmpdir(), `finance-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  serverProcess = spawn('node', ['src/server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(PORT), DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.on('data', (d) => { serverOutput += d.toString(); });
  serverProcess.stderr.on('data', (d) => { serverOutput += d.toString(); });
  serverProcess.on('exit', (code, signal) => { serverOutput += `\n[server exited] code=${code} signal=${signal}\n`; });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`서버가 15초 안에 기동하지 않음. 서버 출력:\n${serverOutput || '(출력 없음)'}`);
});

after(() => {
  if (serverProcess) serverProcess.kill();
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix); } catch {}
  }
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

// 거부 경로와 조회 필터가 통째로 비어 있었다(분기 70.6%). 리볼빙은 이월 잔액이
// 다음 달로 넘어가는 구조라, 잘못된 입력이 저장되면 그 뒤 달이 전부 어긋난다.
test('H-1. 필수 값이 빠지면 400 이고 저장되지 않는다', async () => {
  const pms = await (await fetch(`${BASE}/api/payment-methods`)).json();
  const pmId = (Array.isArray(pms) ? pms : pms.data)[0].id;

  const before = await (await fetch(`${BASE}/api/revolving`)).json();

  const cases = [
    { name: '월 없음', body: { payment_method_id: pmId, paid_amount: 10000 } },
    { name: '결제수단 없음', body: { month: '2026-07', paid_amount: 10000 } },
    { name: '결제금액 없음', body: { month: '2026-07', payment_method_id: pmId } },
  ];
  for (const c of cases) {
    const r = await fetch(`${BASE}/api/revolving`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c.body),
    });
    const body = await r.json();
    assert.strictEqual(r.status, 400, `${c.name}: ${JSON.stringify(body)}`);
    assert.ok(body.error, `${c.name}: 거부 사유가 없다`);
    for (const bad of ['payment_method_id', 'paid_amount']) {
      assert.ok(!body.error.includes(bad), `문구에 내부 필드명 노출: ${body.error}`);
    }
  }

  const after = await (await fetch(`${BASE}/api/revolving`)).json();
  assert.strictEqual(after.data.length, before.data.length, '거부됐는데 저장됐다');
});

test('H-2. 없는 내역을 수정하면 404 다', async () => {
  const r = await fetch(`${BASE}/api/revolving/999999`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paid_amount: 50000 }),
  });
  const body = await r.json();
  assert.strictEqual(r.status, 404, JSON.stringify(body));
  assert.ok(body.error, '거부 사유가 없다');
});

// from/to 필터는 화면의 기간 선택이 쓴다. 필터가 조용히 무시되면 사용자가 고른
// 기간과 다른 목록을 보게 되는데, 리볼빙은 월 단위 이월이라 알아채기 어렵다.
test('H-3. 월 범위 필터가 실제로 걸러 준다', async () => {
  const pms = await (await fetch(`${BASE}/api/payment-methods`)).json();
  const pmId = (Array.isArray(pms) ? pms : pms.data)[0].id;

  for (const month of ['2027-01', '2027-02', '2027-03']) {
    await fetch(`${BASE}/api/revolving`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, payment_method_id: pmId, carried_amount: 100000, paid_amount: 30000, fee: 1000, rate: 19.9 }),
    });
  }

  const all = await (await fetch(`${BASE}/api/revolving?payment_method_id=${pmId}`)).json();
  const in2027 = all.data.filter((r) => r.month.startsWith('2027'));
  assert.ok(in2027.length >= 3, `준비한 3건이 안 보인다: ${in2027.length}`);

  const ranged = await (await fetch(`${BASE}/api/revolving?payment_method_id=${pmId}&from=2027-02&to=2027-02`)).json();
  const months = ranged.data.map((r) => r.month);
  assert.ok(months.includes('2027-02'), `범위 안 항목이 빠졌다: ${months}`);
  assert.ok(!months.includes('2027-01'), `from 이 안 걸렸다: ${months}`);
  assert.ok(!months.includes('2027-03'), `to 가 안 걸렸다: ${months}`);
});
