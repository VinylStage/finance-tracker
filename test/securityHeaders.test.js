const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = 34593; // 다른 테스트와 충돌 안 나게 임의 포트 사용
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

test('FND-04: 응답에 보안 헤더가 설정됨', async () => {
  const resp = await fetch(`${BASE}/api/health`);
  assert.strictEqual(resp.headers.get('x-content-type-options'), 'nosniff');
  assert.strictEqual(resp.headers.get('x-frame-options'), 'DENY');
  assert.strictEqual(resp.headers.get('referrer-policy'), 'no-referrer');
  assert.ok(resp.headers.get('content-security-policy'));
});

test('FND-04: X-Powered-By 헤더가 노출되지 않음', async () => {
  const resp = await fetch(`${BASE}/api/health`);
  assert.strictEqual(resp.headers.get('x-powered-by'), null);
});

test('FND-04+15: 감사 PoC 재현 — try/catch 없는 핸들러의 동기 예외가 스택트레이스 없이 JSON 500으로 처리됨', async () => {
  const resp = await fetch(`${BASE}/api/payment-methods/1`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: { a: 1 }, type: 'x' }),
  });
  assert.strictEqual(resp.status, 500);
  assert.ok(resp.headers.get('content-type').includes('application/json'), 'HTML이 아니라 JSON이어야 함');
  const body = await resp.json();
  assert.deepStrictEqual(body, { error: '처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.' });
  const bodyText = JSON.stringify(body);
  assert.ok(!bodyText.includes('/src/'), '서버 파일 경로가 노출되면 안 됨');
  assert.ok(!bodyText.includes('at '), '스택트레이스가 노출되면 안 됨');
});
