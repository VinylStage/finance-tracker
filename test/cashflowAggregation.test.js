const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// FND-07(감사): cashflow.js가 granularity별로 기간마다 쿼리를 따로 날려
// (daily=30회, weekly=12회, monthly=12회, yearly=5회) N+1을 만들었다.
// transactions.js가 이미 검증한 "범위 전체를 한 번에 조회 후 JS에서 기간별로
// 합산" 패턴으로 통일한 뒤에도 집계 결과 자체는 그대로인지 확인한다.

const PORT = 34584; // 다른 테스트와 충돌 안 나게 임의 포트 사용
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

test('FND-07: cashflow 4개 granularity 모두 단일쿼리 전환 후에도 집계가 정확함', async () => {
  const categories = await (await fetch(`${BASE}/api/categories`)).json();
  const expCat = categories.find(c => c.major_type !== '수입').id;
  const incCat = categories.find(c => c.major_type === '수입').id;

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // 거래 추가 전 — 전부 0이어야 함(전제조건 확인)
  const baselineDaily = await (await fetch(`${BASE}/api/cashflow?granularity=daily`)).json();
  assert.ok(baselineDaily.data.every(p => p.income === 0 && p.expense === 0));

  await fetch(`${BASE}/api/transactions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: todayStr, category_id: incCat, amount: 30000 }),
  });
  await fetch(`${BASE}/api/transactions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: todayStr, category_id: expCat, amount: 12000 }),
  });

  // daily: 오늘 항목(마지막 원소)만 반영, 나머지 29일은 그대로 0
  const daily = await (await fetch(`${BASE}/api/cashflow?granularity=daily`)).json();
  assert.strictEqual(daily.data.length, 30);
  const todayEntry = daily.data[daily.data.length - 1];
  assert.strictEqual(todayEntry.period, todayStr);
  assert.strictEqual(todayEntry.income, 30000);
  assert.strictEqual(todayEntry.expense, 12000);
  assert.strictEqual(todayEntry.balance, 30000 - 12000);
  assert.ok(daily.data.slice(0, -1).every(p => p.income === 0 && p.expense === 0));
  assert.deepStrictEqual(daily.comparison.current, todayEntry);

  // weekly/monthly/yearly도 각자의 마지막(현재) 구간에 그대로 반영돼야 함
  const weekly = await (await fetch(`${BASE}/api/cashflow?granularity=weekly`)).json();
  assert.strictEqual(weekly.data.length, 12);
  const lastWeek = weekly.data[weekly.data.length - 1];
  assert.strictEqual(lastWeek.income, 30000);
  assert.strictEqual(lastWeek.expense, 12000);
  assert.ok(weekly.data.slice(0, -1).every(p => p.income === 0 && p.expense === 0));

  const monthly = await (await fetch(`${BASE}/api/cashflow?granularity=monthly`)).json();
  assert.strictEqual(monthly.data.length, 12);
  const lastMonth = monthly.data[monthly.data.length - 1];
  assert.strictEqual(lastMonth.income, 30000);
  assert.strictEqual(lastMonth.expense, 12000);
  assert.ok(monthly.data.slice(0, -1).every(p => p.income === 0 && p.expense === 0));

  const yearly = await (await fetch(`${BASE}/api/cashflow?granularity=yearly`)).json();
  assert.strictEqual(yearly.data.length, 5);
  const lastYear = yearly.data[yearly.data.length - 1];
  assert.strictEqual(lastYear.income, 30000);
  assert.strictEqual(lastYear.expense, 12000);
  assert.ok(yearly.data.slice(0, -1).every(p => p.income === 0 && p.expense === 0));
});

test('FND-07: cashflow monthly — 월 경계 바깥 거래는 인접 월에 새지 않음', async () => {
  const categories = await (await fetch(`${BASE}/api/categories`)).json();
  const expCat = categories.find(c => c.major_type !== '수입').id;

  const now = new Date();
  const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const y = twoMonthsAgo.getFullYear(), m = twoMonthsAgo.getMonth() + 1;
  const firstDay = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDayDate = new Date(y, m, 0).getDate();
  const lastDay = `${y}-${String(m).padStart(2, '0')}-${String(lastDayDate).padStart(2, '0')}`;

  await fetch(`${BASE}/api/transactions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: firstDay, category_id: expCat, amount: 1111 }),
  });
  await fetch(`${BASE}/api/transactions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: lastDay, category_id: expCat, amount: 2222 }),
  });

  const monthly = await (await fetch(`${BASE}/api/cashflow?granularity=monthly`)).json();
  const targetMonth = `${y}-${String(m).padStart(2, '0')}`;
  const entry = monthly.data.find(p => p.period === targetMonth);
  assert.ok(entry, '대상 월이 12개월 범위 안에 있어야 함');
  assert.strictEqual(entry.expense, 1111 + 2222);

  // 인접 월(전달/다음달)에는 새지 않아야 함
  const prevMonthDate = new Date(y, m - 2, 1);
  const nextMonthDate = new Date(y, m, 1);
  const prevMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
  const nextMonth = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}`;
  const prevEntry = monthly.data.find(p => p.period === prevMonth);
  const nextEntry = monthly.data.find(p => p.period === nextMonth);
  if (prevEntry) assert.strictEqual(prevEntry.expense, 0);
  if (nextEntry) assert.strictEqual(nextEntry.expense, 0);
});
