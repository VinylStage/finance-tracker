const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// FND-12(감사, B안): debts 라우트에 HTTP 테스트가 전무했다. 이자 계산 흐름
// (FND-06과 연계)뿐 아니라 기본 CRUD·집계(monthly_interest, total_*)까지
// 왕복으로 확인한다.

const PORT = 34575; // 다른 테스트와 충돌 안 나게 임의 포트 사용
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
