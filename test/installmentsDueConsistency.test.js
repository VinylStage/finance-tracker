const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// FND-05(감사): /api/installments의 this_month_total과
// /api/transactions/summary/dashboard의 installmentsDue가 같은 DB 상태에서
// 서로 다른 값을 반환했다(전자는 청구 기간 종료를 반영하지 않아 종료된 할부까지
// 계속 합산). 이 파일은 두 엔드포인트가 항상 일치하는지 확인한다.

const PORT = 34589; // 다른 테스트와 충돌 안 나게 임의 포트 사용
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

test('FND-05: 감사 PoC — 종료된 할부가 있어도 /api/installments와 대시보드가 같은 값을 반환', async () => {
  const now = new Date();
  const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const twoMonthsAgoStr = `${twoMonthsAgo.getFullYear()}-${String(twoMonthsAgo.getMonth() + 1).padStart(2, '0')}`;
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, 1);
  const twelveMonthsAgoStr = `${twelveMonthsAgo.getFullYear()}-${String(twelveMonthsAgo.getMonth() + 1).padStart(2, '0')}`;

  // 활성 할부(청구 기간이 이번 달을 포함)
  const activeResp = await fetch(`${BASE}/api/installments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      purchase_date: `${twoMonthsAgoStr}-01`, merchant: '활성할부',
      total_amount: 300000, months: 6, monthly_amount: 50000,
      start_billing_month: twoMonthsAgoStr,
    }),
  });
  assert.strictEqual(activeResp.status, 201);

  // 청구가 이미 끝났지만 status는 여전히 '진행중'으로 남아있는 할부
  // (자동 전이가 없으므로 이 상태 자체는 정상 — 감사가 재현한 바로 그 상황)
  const expiredResp = await fetch(`${BASE}/api/installments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      purchase_date: `${twelveMonthsAgoStr}-01`, merchant: '종료된할부',
      total_amount: 300000, months: 3, monthly_amount: 99999,
      start_billing_month: twelveMonthsAgoStr,
    }),
  });
  assert.strictEqual(expiredResp.status, 201);

  const installmentsResp = await fetch(`${BASE}/api/installments`);
  assert.strictEqual(installmentsResp.status, 200);
  const installmentsBody = await installmentsResp.json();

  const dashboardResp = await fetch(`${BASE}/api/transactions/summary/dashboard`);
  assert.strictEqual(dashboardResp.status, 200);
  const dashboardBody = await dashboardResp.json();

  // 감사 시점 재현값: installments.js가 200000(활성+종료 이중합산), 대시보드가
  // 100000(활성만)을 반환해 서로 달랐다. 지금은 둘 다 활성 할부 금액만 반영해야 한다.
  assert.strictEqual(installmentsBody.this_month_total, 50000);
  assert.strictEqual(dashboardBody.installmentsDue, 50000);
  assert.strictEqual(installmentsBody.this_month_total, dashboardBody.installmentsDue);
});
