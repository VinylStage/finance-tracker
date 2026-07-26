const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// FND-08(감사): "strftime('%Y-%m', t.date) = ?" 같은 함수-감싼 WHERE는
// idx_tx_date를 못 써 풀스캔이었다(EXPLAIN QUERY PLAN으로 SCAN t 확인됨).
// [월/연 시작일, 다음 월/연 시작일) 범위 비교로 바꿨다. 이 파일은 그 경계값
// 재작성이 월/연 경계에서 거래를 엉뚱한 구간으로 새게 하지 않는지 확인한다.
// EXPLAIN QUERY PLAN 자체의 SCAN→SEARCH 전환은 이 스위트의 HTTP 기반 테스트
// 방식으로는 검증할 수 없어 PR 설명에 별도로 수동 검증 결과를 남긴다.

const PORT = 34582; // 다른 테스트와 충돌 안 나게 임의 포트 사용
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

async function addTx(date, categoryId, amount) {
  const resp = await fetch(`${BASE}/api/transactions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, category_id: categoryId, amount }),
  });
  assert.strictEqual(resp.status, 201);
}

test('FND-08: period-comparison monthly — 월/연 경계 거래가 인접 구간으로 새지 않음', async () => {
  const categories = await (await fetch(`${BASE}/api/categories`)).json();
  const expCat = categories.find(c => c.major_type !== '수입').id;

  await addTx('2025-01-31', expCat, 1000); // 2025년 1월 마지막날
  await addTx('2025-02-01', expCat, 2000); // 2025년 2월 첫날 — 1월로 새면 안 됨
  await addTx('2024-12-31', expCat, 5000); // 2024년(전년) 12월 마지막날
  await addTx('2025-01-01', expCat, 6000); // 2025년 1월 첫날 — 전년 12월로 새면 안 됨

  // anchor를 2025-06-15로 고정 — periodComparisonMonthly는 anchor의 연도만
  // 쓰므로(y=2025, py=2024) 테스트 실행 시점과 무관하게 결정적이다.
  const resp = await fetch(`${BASE}/api/transactions/period-comparison?period=monthly&date=2025-06-15`);
  assert.strictEqual(resp.status, 200);
  const body = await resp.json();

  const jan2025 = body.data.find(d => d.currentMonth === '2025-01');
  assert.strictEqual(jan2025.currentExpense, 1000 + 6000, '1월 마지막날+첫날 거래가 모두 1월에 잡혀야 함');

  const feb2025 = body.data.find(d => d.currentMonth === '2025-02');
  assert.strictEqual(feb2025.currentExpense, 2000, '2월 첫날 거래가 1월로 새면 안 됨');

  const mar2025 = body.data.find(d => d.currentMonth === '2025-03');
  assert.strictEqual(mar2025.currentExpense, 0);

  const dec2024 = body.data.find(d => d.previousMonth === '2024-12');
  assert.strictEqual(dec2024.previousExpense, 5000, '전년 12월 마지막날 거래가 다음해 1월로 새면 안 됨');

  const nov2024 = body.data.find(d => d.previousMonth === '2024-11');
  assert.strictEqual(nov2024.previousExpense, 0);
});

test('FND-08: 대시보드 이번 달 집계 — 전달 마지막날 거래가 새지 않음', async () => {
  const categories = await (await fetch(`${BASE}/api/categories`)).json();
  const expCat = categories.find(c => c.major_type !== '수입').id;

  const now = new Date();
  const prevMonthLastDay = new Date(now.getFullYear(), now.getMonth(), 0);
  const y = prevMonthLastDay.getFullYear(), m = String(prevMonthLastDay.getMonth() + 1).padStart(2, '0'), d = String(prevMonthLastDay.getDate()).padStart(2, '0');
  const prevLastDayStr = `${y}-${m}-${d}`;
  const thisMonthFirstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  await addTx(prevLastDayStr, expCat, 3000); // 전달 마지막날 — 이번 달 집계에 새면 안 됨
  await addTx(thisMonthFirstDay, expCat, 4000); // 이번 달 첫날 — 정상 반영돼야 함

  const resp = await fetch(`${BASE}/api/transactions/summary/dashboard`);
  assert.strictEqual(resp.status, 200);
  const body = await resp.json();
  assert.strictEqual(body.expense, 4000, '전달 마지막날 거래가 이번 달 지출에 새면 안 됨');
});
