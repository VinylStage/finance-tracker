const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = 34598; // 다른 테스트와 충돌 안 나게 임의 포트 사용
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
  // health check가 200 돌아올 때까지 폴링 (최대 15초, 100ms 간격)
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

test('dashboard aggregation - installmentsDue과 expense 이중 계산 방지 검증', async () => {
  // 1. 날짜 계산
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth()-2, 1);
  const twoMonthsAgoStr = `${twoMonthsAgo.getFullYear()}-${String(twoMonthsAgo.getMonth()+1).padStart(2,'0')}`;
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth()-12, 1);
  const twelveMonthsAgoStr = `${twelveMonthsAgo.getFullYear()}-${String(twelveMonthsAgo.getMonth()+1).padStart(2,'0')}`;

  // 2. 카테고리 확보
  const categoriesResp = await fetch(`${BASE}/api/categories`);
  assert.strictEqual(categoriesResp.status, 200);
  const categories = await categoriesResp.json();
  const expenseCategoryId = categories.find(c => c.major_type !== '수입').id;

  // 3. 활성 할부 생성
  const activeInstallment = {
    purchase_date: `${twoMonthsAgoStr}-01`,
    merchant: '활성할부',
    total_amount: 300000,
    months: 6,
    monthly_amount: 50000,
    start_billing_month: twoMonthsAgoStr
  };
  const createActiveResp = await fetch(`${BASE}/api/installments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(activeInstallment)
  });
  assert.strictEqual(createActiveResp.status, 201);

  // 4. 종료된 할부 생성 (이중 계산 방지 검증 핵심)
  const expiredInstallment = {
    purchase_date: `${twelveMonthsAgoStr}-01`,
    merchant: '종료된할부',
    total_amount: 300000,
    months: 3,
    monthly_amount: 99999,
    start_billing_month: twelveMonthsAgoStr
  };
  const createExpiredResp = await fetch(`${BASE}/api/installments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(expiredInstallment)
  });
  assert.strictEqual(createExpiredResp.status, 201);

  // 5. 할부 결제방식 거래 생성 (이중 계산 방지 검증)
  const installmentTransaction = {
    date: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`,
    category_id: expenseCategoryId,
    amount: 77777,
    merchant: '할부거래',
    payment_style: '할부'
  };
  const createInstallmentTxResp = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(installmentTransaction)
  });
  assert.strictEqual(createInstallmentTxResp.status, 201);

  // 6. 일반 거래 생성
  const normalTransaction = {
    date: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`,
    category_id: expenseCategoryId,
    amount: 10000,
    merchant: '일반거래'
  };
  const createNormalTxResp = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalTransaction)
  });
  assert.strictEqual(createNormalTxResp.status, 201);

  // 7. 집계 조회 및 검증
  const dashboardResp = await fetch(`${BASE}/api/transactions/summary/dashboard`);
  assert.strictEqual(dashboardResp.status, 200);
  const result = await dashboardResp.json();
  
  // installmentsDue는 활성 할부(50000)만 포함되어야 함. 종료된 할부(99999)는 제외.
  assert.strictEqual(result.installmentsDue, 50000);
  
  // expense는 일반 거래(10000)만 포함되어야 함. 할부 거래(77777)는 제외.
  assert.strictEqual(result.expense, 10000);
});