const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const XLSX = require('xlsx');

const PORT = 34592; // 다른 테스트와 충돌 안 나게 임의 포트 사용
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

function makeXlsxBuffer(rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

test('FND-09: 정상 크기의 .xlsx 파일은 업로드 단계를 통과함', async () => {
  const buf = makeXlsxBuffer([['a', 'b'], [1, 2]]);
  const form = new FormData();
  form.append('files', new Blob([buf]), '농협카드테스트.xlsx');
  const resp = await fetch(`${BASE}/api/card-import?preview=true`, { method: 'POST', body: form });
  assert.strictEqual(resp.status, 200);
  const body = await resp.json();
  // 업로드 자체는 통과 — 이후 실제 파싱 성공 여부는 이 테스트의 관심사가 아님(시트 형식이 실제 스펙과 다를 수 있음)
  assert.strictEqual(body.results.length, 1);
});

test('FND-09: 10MB 초과 파일은 400으로 거부됨', async () => {
  const bigBuffer = Buffer.alloc(11 * 1024 * 1024, 'a');
  const form = new FormData();
  form.append('files', new Blob([bigBuffer]), '농협카드테스트.xlsx');
  const resp = await fetch(`${BASE}/api/card-import?preview=true`, { method: 'POST', body: form });
  assert.strictEqual(resp.status, 400);
  const body = await resp.json();
  assert.match(body.error, /크기/);
});

test('FND-09: xlsx/xls가 아닌 확장자는 400으로 거부됨', async () => {
  const form = new FormData();
  form.append('files', new Blob([Buffer.from('not an excel file')]), '악성파일.exe');
  const resp = await fetch(`${BASE}/api/card-import?preview=true`, { method: 'POST', body: form });
  assert.strictEqual(resp.status, 400);
  const body = await resp.json();
  assert.match(body.error, /xlsx|xls/);
});

test('FND-09: /single 라우트도 동일하게 크기 제한 적용', async () => {
  const bigBuffer = Buffer.alloc(11 * 1024 * 1024, 'a');
  const form = new FormData();
  form.append('file', new Blob([bigBuffer]), '농협카드테스트.xlsx');
  const resp = await fetch(`${BASE}/api/card-import/single?preview=true`, { method: 'POST', body: form });
  assert.strictEqual(resp.status, 400);
});
