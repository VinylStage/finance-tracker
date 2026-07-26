const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = 34594; // 다른 테스트와 충돌 안 나게 임의 포트 사용
const BASE = `http://127.0.0.1:${PORT}`;
const SELF_ORIGIN = BASE;
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

test('FND-01: Sec-Fetch-Site: cross-site 인 POST는 403으로 차단 (감사 PoC 재현)', async () => {
  const resp = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'http://evil.example',
      'Sec-Fetch-Site': 'cross-site',
    },
    body: JSON.stringify({ date: '2026-01-15', category_id: 1, amount: 1000 }),
  });
  assert.strictEqual(resp.status, 403);
});

test('FND-01: 감사 PoC — data/import mode=overwrite 공격도 차단됨', async () => {
  const resp = await fetch(`${BASE}/api/data/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': 'http://evil.example',
      'Sec-Fetch-Site': 'cross-site',
    },
    body: 'mode=overwrite&confirm=DELETE_ALL&transactions=x&transactions=y',
  });
  assert.strictEqual(resp.status, 403);
});

test('FND-01: Sec-Fetch-Site: same-origin 인 POST는 정상 통과', async () => {
  const catResp = await fetch(`${BASE}/api/categories`);
  const cats = await catResp.json();
  const resp = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Sec-Fetch-Site': 'same-origin',
    },
    body: JSON.stringify({ date: '2026-01-15', category_id: cats[0].id, amount: 1000 }),
  });
  assert.strictEqual(resp.status, 201);
});

test('FND-01: Sec-Fetch-Site 없고 Origin이 자기 자신과 일치하면 통과 (구형 브라우저 폴백)', async () => {
  const catResp = await fetch(`${BASE}/api/categories`);
  const cats = await catResp.json();
  const resp = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': SELF_ORIGIN },
    body: JSON.stringify({ date: '2026-01-15', category_id: cats[0].id, amount: 2000 }),
  });
  assert.strictEqual(resp.status, 201);
});

test('FND-01: Sec-Fetch-Site 없고 Origin이 다르면 403 (구형 브라우저 폴백)', async () => {
  const resp = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': 'http://evil.example' },
    body: JSON.stringify({ date: '2026-01-15', category_id: 1, amount: 1000 }),
  });
  assert.strictEqual(resp.status, 403);
});

test('FND-01: Sec-Fetch-Site/Origin 둘 다 없으면 통과 (curl·테스트스위트·서버간 호출 호환)', async () => {
  const catResp = await fetch(`${BASE}/api/categories`);
  const cats = await catResp.json();
  const resp = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: '2026-01-15', category_id: cats[0].id, amount: 3000 }),
  });
  assert.strictEqual(resp.status, 201);
});

test('FND-01: GET 요청은 Sec-Fetch-Site/Origin 값과 무관하게 항상 통과', async () => {
  const resp = await fetch(`${BASE}/api/categories`, {
    headers: { 'Origin': 'http://evil.example', 'Sec-Fetch-Site': 'cross-site' },
  });
  assert.strictEqual(resp.status, 200);
});
