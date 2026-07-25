const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = 34595; // 다른 테스트와 충돌 안 나게 임의 포트 사용
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

async function createRule(overrides = {}) {
  const categoriesResp = await fetch(`${BASE}/api/categories`);
  const categories = await categoriesResp.json();
  const category_id = categories[0].id;
  const resp = await fetch(`${BASE}/api/recurring-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category_id, merchant: '테스트구독', amount: 9900, day_of_month: 15, ...overrides }),
  });
  assert.strictEqual(resp.status, 201);
  return (await resp.json()).id;
}

test('POST /api/recurring-rules - day_of_month 범위 밖이면 400', async () => {
  const categoriesResp = await fetch(`${BASE}/api/categories`);
  const categories = await categoriesResp.json();
  const resp = await fetch(`${BASE}/api/recurring-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category_id: categories[0].id, merchant: '테스트', amount: 1000, day_of_month: 32 }),
  });
  assert.strictEqual(resp.status, 400);
});

test('POST /api/recurring-rules - 허용되지 않은 payment_style은 400', async () => {
  const categoriesResp = await fetch(`${BASE}/api/categories`);
  const categories = await categoriesResp.json();
  const resp = await fetch(`${BASE}/api/recurring-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category_id: categories[0].id, merchant: '테스트', amount: 1000, day_of_month: 1, payment_style: '없는값' }),
  });
  assert.strictEqual(resp.status, 400);
});

test('생성한 규칙은 GET /due?month=에 나타나고, confirm하면 거래가 생기고 사라짐', async () => {
  const id = await createRule();

  const dueBefore = await (await fetch(`${BASE}/api/recurring-rules/due?month=2026-03`)).json();
  assert.ok(dueBefore.data.some(r => r.id === id));

  const confirmResp = await fetch(`${BASE}/api/recurring-rules/${id}/confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: '2026-03' }),
  });
  assert.strictEqual(confirmResp.status, 201);
  const { transaction_id } = await confirmResp.json();

  const txResp = await fetch(`${BASE}/api/transactions/${transaction_id}`);
  const tx = await txResp.json();
  assert.strictEqual(tx.date, '2026-03-15');
  assert.strictEqual(tx.amount, 9900);
  assert.strictEqual(tx.merchant, '테스트구독');

  const dueAfter = await (await fetch(`${BASE}/api/recurring-rules/due?month=2026-03`)).json();
  assert.ok(!dueAfter.data.some(r => r.id === id), 'confirm 처리된 규칙은 같은 달 due 목록에서 빠져야 함');
});

test('confirm 후 같은 달에 다시 confirm/skip하면 409', async () => {
  const id = await createRule();
  await fetch(`${BASE}/api/recurring-rules/${id}/confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: '2026-04' }),
  });
  const second = await fetch(`${BASE}/api/recurring-rules/${id}/confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: '2026-04' }),
  });
  assert.strictEqual(second.status, 409);
});

test('skip하면 거래 없이 이번 달 due 목록에서 빠짐', async () => {
  const id = await createRule();
  const skipResp = await fetch(`${BASE}/api/recurring-rules/${id}/skip`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: '2026-05' }),
  });
  assert.strictEqual(skipResp.status, 200);

  const dueAfter = await (await fetch(`${BASE}/api/recurring-rules/due?month=2026-05`)).json();
  assert.ok(!dueAfter.data.some(r => r.id === id));

  const listResp = await fetch(`${BASE}/api/transactions?limit=500`);
  const list = await listResp.json();
  assert.ok(!list.data.some(t => t.merchant === '테스트구독' && t.date.startsWith('2026-05')), 'skip은 거래를 만들면 안 됨');
});

test('day_of_month가 그 달 마지막 날보다 크면 마지막 날로 clamp', async () => {
  const id = await createRule({ day_of_month: 31 });
  const confirmResp = await fetch(`${BASE}/api/recurring-rules/${id}/confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: '2026-02' }),
  });
  const { transaction_id } = await confirmResp.json();
  const tx = await (await fetch(`${BASE}/api/transactions/${transaction_id}`)).json();
  assert.strictEqual(tx.date, '2026-02-28', '2026년은 평년이라 2월 마지막 날은 28일');
});

test('비활성 규칙(DELETE)은 GET 기본 목록과 due 목록에서 빠짐', async () => {
  const id = await createRule();
  const delResp = await fetch(`${BASE}/api/recurring-rules/${id}`, { method: 'DELETE' });
  assert.strictEqual(delResp.status, 200);

  const list = await (await fetch(`${BASE}/api/recurring-rules`)).json();
  assert.ok(!list.some(r => r.id === id));

  const due = await (await fetch(`${BASE}/api/recurring-rules/due?month=2026-06`)).json();
  assert.ok(!due.data.some(r => r.id === id));
});
