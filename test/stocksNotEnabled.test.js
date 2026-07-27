const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// FND-18(감사): stocks.js가 DB 오류든 프로그래밍 오류든 전부 "미활성화"로
// 보고하고 로깅조차 안 했다(serverError 미사용). kisService.getStockPrice가
// "미활성화" 상태를 더 이상 예외로 던지지 않고 구조화된 값으로 돌려주도록
// 바꿔, 이 라우트의 catch는 이제 진짜 예상 못한 에러만 만나며 serverError()로
// 로그를 남긴다. 여기서는 (구현 미완성 상태에서) 유일하게 실제로 도달 가능한
// 응답 계약 — 503 "미활성화" — 이 그대로 유지되는지 확인한다.

const PORT = 34578; // 다른 테스트와 충돌 안 나게 임의 포트 사용
const BASE = `http://127.0.0.1:${PORT}`;
let serverProcess;
let dbPath;

let serverOutput = '';

before(async () => {
  dbPath = path.join(os.tmpdir(), `finance-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  serverProcess = spawn('node', ['src/server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(PORT), DB_PATH: dbPath, KIS_ENABLED: 'false' },
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

test('FND-18: KIS_ENABLED=false — 정상 경로(예외 아님)로 503 "미활성화" 응답', async () => {
  const resp = await fetch(`${BASE}/api/stocks/AAPL`);
  assert.strictEqual(resp.status, 503);
  const body = await resp.json();
  assert.deepStrictEqual(body, { error: '주가 조회 기능은 아직 준비 중입니다.' });
});
