const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = 34590; // 다른 테스트와 충돌 안 나게 임의 포트 사용
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

test('FND-03: confirm 토큰 없으면 400', async () => {
  const resp = await fetch(`${BASE}/api/export/settings/restore`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categories: [] }),
  });
  assert.strictEqual(resp.status, 400);
});

test('FND-03: 감사 PoC — 거래가 있는 상태에서도 복원이 성공함(기존엔 FK 위반으로 100% 실패)', async () => {
  const categoriesResp = await fetch(`${BASE}/api/categories`);
  const categories = await categoriesResp.json();
  const targetCategory = categories[0];

  // 이 카테고리를 참조하는 거래 생성 — 기존 버그(DELETE FROM categories)라면
  // 이 거래 하나 때문에 복원 전체가 FK 위반으로 실패했다.
  const txResp = await fetch(`${BASE}/api/transactions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: '2026-01-15', category_id: targetCategory.id, amount: 1000 }),
  });
  assert.strictEqual(txResp.status, 201);

  const backupResp = await fetch(`${BASE}/api/export/settings`);
  const backup = await backupResp.json();

  const restoreResp = await fetch(`${BASE}/api/export/settings/restore`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...backup, confirm: 'OVERWRITE_SETTINGS' }),
  });
  assert.strictEqual(restoreResp.status, 200);
  const body = await restoreResp.json();
  assert.strictEqual(body.ok, true);

  // 거래도 그대로 살아있어야 함(카테고리를 지웠다면 FK로 인해 이 거래도 문제가 됐을 것)
  const stillThereResp = await fetch(`${BASE}/api/transactions/${(await txResp.json()).id}`);
  assert.strictEqual(stillThereResp.status, 200);
});

test('FND-03: UPSERT — 백업에 있는 카테고리는 갱신됨', async () => {
  const categoriesResp = await fetch(`${BASE}/api/categories`);
  const categories = await categoriesResp.json();
  const target = categories[0];

  const backup = { categories: [{ ...target, monthly_budget: 999999 }] };
  const restoreResp = await fetch(`${BASE}/api/export/settings/restore`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...backup, confirm: 'OVERWRITE_SETTINGS' }),
  });
  assert.strictEqual(restoreResp.status, 200);

  const afterResp = await fetch(`${BASE}/api/categories?include_inactive=1`);
  const after = await afterResp.json();
  const updated = after.find(c => c.id === target.id);
  assert.strictEqual(updated.monthly_budget, 999999);
});

test('FND-03: 백업에 없는 기존 카테고리는 삭제되지 않고 남아있음', async () => {
  const beforeResp = await fetch(`${BASE}/api/categories?include_inactive=1`);
  const before = await beforeResp.json();
  const totalBefore = before.length;

  // 카테고리 1개짜리 "부분" 백업으로 복원 — 나머지가 지워지면 안 됨
  const restoreResp = await fetch(`${BASE}/api/export/settings/restore`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categories: [before[0]], confirm: 'OVERWRITE_SETTINGS' }),
  });
  assert.strictEqual(restoreResp.status, 200);

  const afterResp = await fetch(`${BASE}/api/categories?include_inactive=1`);
  const after = await afterResp.json();
  assert.strictEqual(after.length, totalBefore, '백업에 없다고 기존 카테고리가 삭제되면 안 됨');
});
