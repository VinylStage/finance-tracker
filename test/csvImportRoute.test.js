const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = 34596; // 다른 테스트와 충돌 안 나게 임의 포트 사용
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

const SHINHAN_CSV = [
  '거래일자,가맹점,금액',
  '2026.02.10,교보문고,15000',
  '2026.02.11,이마트,32000',
].join('\n');

test('POST /api/csv-import?preview=true - 저장 없이 신규/중복 건수만 반환', async () => {
  const resp = await fetch(`${BASE}/api/csv-import?preview=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardCompany: 'shinhan', csvText: SHINHAN_CSV }),
  });
  assert.strictEqual(resp.status, 200);
  const body = await resp.json();
  assert.strictEqual(body.count, 2);
  assert.strictEqual(body.skipped, 0);

  const listResp = await fetch(`${BASE}/api/transactions`);
  const list = await listResp.json();
  assert.strictEqual(list.total, 0, 'preview 모드는 실제로 저장하면 안 됨');
});

test('POST /api/csv-import - 실제 저장 후 재실행하면 중복으로 스킵', async () => {
  const firstResp = await fetch(`${BASE}/api/csv-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardCompany: 'shinhan', csvText: SHINHAN_CSV }),
  });
  assert.strictEqual(firstResp.status, 200);
  const first = await firstResp.json();
  assert.strictEqual(first.imported, 2);
  assert.strictEqual(first.skipped, 0);

  const secondResp = await fetch(`${BASE}/api/csv-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardCompany: 'shinhan', csvText: SHINHAN_CSV }),
  });
  const second = await secondResp.json();
  assert.strictEqual(second.imported, 0, '동일 (date, merchant, amount) 조합은 중복으로 스킵돼야 함');
  assert.strictEqual(second.skipped, 2);

  const listResp = await fetch(`${BASE}/api/transactions`);
  const list = await listResp.json();
  assert.strictEqual(list.total, 2, '두 번 실행해도 실제로 저장된 건수는 2건이어야 함');
});

test('POST /api/csv-import - 형식 오류 행은 제외하고 나머지만 저장', async () => {
  const csvWithBadRow = [
    '거래일자,가맹점,금액',
    '2026.03.01,정상거래,5000',
    '2026-99-99,잘못된날짜,abc',
  ].join('\n');

  const resp = await fetch(`${BASE}/api/csv-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardCompany: 'shinhan', csvText: csvWithBadRow }),
  });
  const body = await resp.json();
  assert.strictEqual(body.imported, 1);
  assert.strictEqual(body.invalid, 1);
});

test('POST /api/csv-import - 하나/삼성/현대는 엑셀 경로로 통일되어 CSV로는 거부됨(#88)', async () => {
  const resp = await fetch(`${BASE}/api/csv-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardCompany: 'hana', csvText: SHINHAN_CSV }),
  });
  assert.strictEqual(resp.status, 400);
  const body = await resp.json();
  assert.match(body.error, /Unsupported card company/);
});
