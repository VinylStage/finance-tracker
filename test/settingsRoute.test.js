const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// FND-12(감사, B안): 18개 API 마운트 중 11개가 HTTP 테스트 전무했고, 그중
// export/settings 무테스트가 FND-03(설정 복원 100% 실패)이 릴리스까지
// 발견되지 못한 직접 원인이었다. settings 라우트는 이미 GET의 에러노출
// 회귀 테스트(FND-11, settingsErrorExposure.test.js)가 있으나 정상 경로
// (GET 기본값/PUT 갱신/GET 반영)는 아직 테스트가 없었다 — 이 파일이 채운다.

const PORT = 34576; // 다른 테스트와 충돌 안 나게 임의 포트 사용
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

test('settings 라우트 — GET 기본값 → PUT 갱신 → GET 반영 → 부분 갱신 → 잘못된 입력 거부', async () => {
  const initial = await (await fetch(`${BASE}/api/settings`)).json();
  assert.strictEqual(initial.initial_balance, 0);
  assert.strictEqual(initial.monthly_income, 0);

  const putResp = await fetch(`${BASE}/api/settings`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initial_balance: 1000000, monthly_income: 3000000 }),
  });
  assert.strictEqual(putResp.status, 200);

  const afterFirst = await (await fetch(`${BASE}/api/settings`)).json();
  assert.strictEqual(afterFirst.initial_balance, 1000000);
  assert.strictEqual(afterFirst.monthly_income, 3000000);

  // 부분 갱신 — monthly_income만 보내면 initial_balance는 그대로 유지돼야 함
  const partialResp = await fetch(`${BASE}/api/settings`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ monthly_income: 3500000 }),
  });
  assert.strictEqual(partialResp.status, 200);

  const afterPartial = await (await fetch(`${BASE}/api/settings`)).json();
  assert.strictEqual(afterPartial.initial_balance, 1000000, '부분 갱신 시 보내지 않은 필드가 초기화되면 안 됨');
  assert.strictEqual(afterPartial.monthly_income, 3500000);

  const badResp = await fetch(`${BASE}/api/settings`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initial_balance: 'abc' }),
  });
  assert.strictEqual(badResp.status, 400);
});
