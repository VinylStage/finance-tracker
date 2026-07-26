'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

/**
 * 환율 라우트에 대한 HTTP 테스트
 * EXIM_API_KEY가 없을 경우 500 에러를 반환해야 한다.
 */
const PORT = 34603;
const BASE = `http://127.0.0.1:${PORT}`;
let serverProcess;
let dbPath;

let serverOutput = '';

before(async () => {
  dbPath = path.join(os.tmpdir(), `finance-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  serverProcess = spawn('node', ['src/server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { 
      ...process.env, 
      HOST: '127.0.0.1', 
      PORT: String(PORT), 
      DB_PATH: dbPath,
      EXIM_API_KEY: undefined // API 키가 없도록 명시적으로 제거
    },
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

test('exchange 라우트 — API 키가 없을 경우 500 에러 반환', async () => {
  const resp = await fetch(`${BASE}/api/exchange`);
  
  // 상태 코드 확인
  assert.strictEqual(resp.status, 500);
  
  const body = await resp.json();
  
  // 에러 메시지 검증 - 실제 API 키가 노출되지 않아야 함
  assert.ok(body.error);
  assert.ok(!body.error.includes(process.env.EXIM_API_KEY), '에러 메시지에 API 키가 포함되어 있음');
  
  // 원본 스택트레이스나 내부 정보가 노출되지 않도록 방어
  assert.ok(!body.error.includes('EXIM_API_KEY is not set'), '원본 에러 메시지가 노출됨');
});
