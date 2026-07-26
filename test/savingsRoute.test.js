const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// savings 라우트에 대한 HTTP 테스트
// debtsRoute.test.js와 동일한 패턴을 따름

const PORT = 34602; // 다른 테스트 파일과 충돌 안 나게 임의 포트 사용
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

test('savings 라우트 — 생성/조회/수정/삭제/만기처리 전체 왕복', async () => {
  // 1. POST로 적금 상품 생성
  const createResp = await fetch(`${BASE}/api/savings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      name: '테스트 적금',
      monthly_contribution: 100000,
      start_date: '2024-01-01'
    }),
  });
  assert.strictEqual(createResp.status, 201);
  const { id } = await createResp.json();

  // GET 목록에 나타나는지 확인
  const list1 = await (await fetch(`${BASE}/api/savings`)).json();
  const created = list1.data.find(d => d.id === id);
  assert.ok(created);
  assert.strictEqual(created.name, '테스트 적금');
  assert.strictEqual(created.monthly_contribution, 100000);
  assert.strictEqual(created.start_date, '2024-01-01');

  // 필수 필드 누락 시 400 오류
  const badCreateResp = await fetch(`${BASE}/api/savings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '테스트 적금' }),
  });
  assert.strictEqual(badCreateResp.status, 400);

  // 2. PUT으로 일부 필드만 갱신 시 나머지 필드가 유지되는지 확인
  const putResp = await fetch(`${BASE}/api/savings/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ monthly_contribution: 150000 }),
  });
  assert.strictEqual(putResp.status, 200);

  const list2 = await (await fetch(`${BASE}/api/savings`)).json();
  const updated = list2.data.find(d => d.id === id);
  assert.strictEqual(updated.monthly_contribution, 150000);
  assert.strictEqual(updated.name, '테스트 적금', 'PUT은 부분 갱신이라 보내지 않은 필드가 유지돼야 함');

  // 3. POST /:id/mature 호출 시 응답에 principal/interest/payout이 들어있는지
  const matureResp = await fetch(`${BASE}/api/savings/${id}/mature`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settle_date: '2024-12-31' }),
  });
  assert.strictEqual(matureResp.status, 200);
  const matureBody = await matureResp.json();
  assert.ok(matureBody.principal !== undefined);
  assert.ok(matureBody.interest !== undefined);
  assert.ok(matureBody.payout !== undefined);

  // 이미 완료 처리된 상품에 다시 mature 호출하면 400 오류
  const repeatMatureResp = await fetch(`${BASE}/api/savings/${id}/mature`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
  });
  assert.strictEqual(repeatMatureResp.status, 400);

  // DELETE로 삭제
  const delResp = await fetch(`${BASE}/api/savings/${id}`, { method: 'DELETE' });
  assert.strictEqual(delResp.status, 200);

  const list3 = await (await fetch(`${BASE}/api/savings`)).json();
  assert.ok(!list3.data.some(d => d.id === id));
});
