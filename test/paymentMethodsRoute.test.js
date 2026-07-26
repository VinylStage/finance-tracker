const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = 34600; // 다른 테스트와 충돌 안 나게 임의 포트 사용
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

test('paymentMethods 라우트 — 생성/조회/수정/삭제 전체 왕복', async () => {
  // 1. POST로 생성 → GET 목록에 나타나는지, 필드값 정확한지
  const createResp = await fetch(`${BASE}/api/payment-methods`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '카드결제', type: 'credit' }),
  });
  assert.strictEqual(createResp.status, 201);
  const { id } = await createResp.json();

  // 목록 조회
  const list1 = await (await fetch(`${BASE}/api/payment-methods`)).json();
  const created = list1.find(d => d.id === id);
  assert.ok(created);
  assert.strictEqual(created.name, '카드결제');
  assert.strictEqual(created.type, 'credit');
  assert.strictEqual(created.is_active, 1);

  // 2. PUT은 실제로는 부분 갱신이 아니다 — name/type을 안 보내면 NOT NULL
  // 제약 위반으로 500이 난다(Settings.jsx의 "재활성화" 버튼이 정확히 이 방식으로
  // { is_active: 1 }만 보낸다 — 즉 실사용 경로가 현재 깨져 있다는 뜻).
  // 이 라우트는 debts.js/savings.js와 달리 기존값 병합을 하지 않는다.
  const putResp = await fetch(`${BASE}/api/payment-methods/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_active: 0 }),
  });
  assert.strictEqual(putResp.status, 500, '알려진 결함: PUT이 부분 갱신을 지원하지 않아 name/type 없이 보내면 NOT NULL 위반으로 500');

  // 전체 필드를 다 보내면(현재 유일한 실사용 가능 경로) 정상 동작함을 확인
  const putFullResp = await fetch(`${BASE}/api/payment-methods/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '카드결제', type: 'credit', is_active: 0 }),
  });
  assert.strictEqual(putFullResp.status, 200);

  const list2 = await (await fetch(`${BASE}/api/payment-methods?include_inactive=1`)).json();
  const updated = list2.find(d => d.id === id);
  assert.ok(updated);
  assert.strictEqual(updated.is_active, 0);

  // 3. DELETE 후 기본 GET에는 안 나오고, ?include_inactive=1로는 나오는지(소프트 삭제 확인)
  const delResp = await fetch(`${BASE}/api/payment-methods/${id}`, { method: 'DELETE' });
  assert.strictEqual(delResp.status, 200);

  const list3 = await (await fetch(`${BASE}/api/payment-methods`)).json();
  assert.ok(!list3.some(d => d.id === id), '소프트 삭제 후 기본 GET에는 나타나지 않아야 함');

  const list4 = await (await fetch(`${BASE}/api/payment-methods?include_inactive=1`)).json();
  const deleted = list4.find(d => d.id === id);
  assert.ok(deleted, '소프트 삭제 후 include_inactive=1으로 조회하면 나타나야 함');
  assert.strictEqual(deleted.is_active, 0);
});