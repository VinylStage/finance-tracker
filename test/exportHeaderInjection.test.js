const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = 34591; // 다른 테스트와 충돌 안 나게 임의 포트 사용
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

test('FND-19: 정상 날짜 형식의 from/to는 정상 동작', async () => {
  const resp = await fetch(`${BASE}/api/export/csv?from=2026-01-01&to=2026-12-31`);
  assert.strictEqual(resp.status, 200);
  assert.match(resp.headers.get('content-disposition'), /transactions_2026-01-01_2026-12-31\.csv/);
});

test('FND-19: from/to 미지정은 "all"로 정상 동작', async () => {
  const resp = await fetch(`${BASE}/api/export/csv`);
  assert.strictEqual(resp.status, 200);
  assert.match(resp.headers.get('content-disposition'), /transactions_all_all\.csv/);
});

test('FND-19: 감사 PoC — 따옴표로 파일명 조작 시도는 400', async () => {
  const resp = await fetch(`${BASE}/api/export/csv?from=${encodeURIComponent('2026-01-01"; evil')}`);
  assert.strictEqual(resp.status, 400);
});

test('FND-19: 제어문자 입력은 400 (500 유발 방지)', async () => {
  const resp = await fetch(`${BASE}/api/export/csv?from=${encodeURIComponent('2026\x00-01-01')}`);
  assert.strictEqual(resp.status, 400);
});

test('FND-19: json 엔드포인트도 동일하게 검증', async () => {
  const resp = await fetch(`${BASE}/api/export/json?to=${encodeURIComponent('not-a-date')}`);
  assert.strictEqual(resp.status, 400);
});

test('FND-19: 구버전 호환 라우트(GET /api/export)도 동일하게 검증', async () => {
  const resp = await fetch(`${BASE}/api/export?format=csv&from=${encodeURIComponent('"; evil')}`);
  assert.strictEqual(resp.status, 400);
});
