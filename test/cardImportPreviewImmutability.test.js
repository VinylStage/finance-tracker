'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const XLSX = require('xlsx');
const Database = require('better-sqlite3');

// ADR 0008 이 스스로 지목한 위험 지점을 고정한다 — **"프리뷰가 조용히 쓰기를 하면
// 원칙이 무의미해진다"**(#307).
//
// csv-import 는 `list.total === 0` 으로 이미 고정돼 있었지만(csvImportRoute.test.js),
// card-import 는 프리뷰 경로를 부르는 테스트가 업로드 제한 검사뿐이라 "저장하지
// 않는다" 를 아무도 확인하지 않았다. 구현은 읽기 전용이 맞다 — 그래서 더더욱
// 지금 고정해야 한다. 나중에 previewImport 에 쓰기가 섞여도 아무도 모른다.
//
// 카드 임포트는 이 앱에서 가장 큰 대량 경로다(#306 실측 카드 거래 447건).

const PORT = 34624;
const BASE = `http://127.0.0.1:${PORT}`;
let serverProcess;
let dbPath;
let serverOutput = '';

before(async () => {
  dbPath = path.join(os.tmpdir(), `finance-preview-immut-${process.pid}.db`);
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

// 농협 포맷 — 헤더 14행을 비우고 index 14 부터 데이터다. 컬럼 위치는
// test/cardExcelImport.test.js 의 합성 픽스처와 같은 근거를 쓴다.
// ref/ 샘플은 .gitignore 대상이라 CI 체크아웃본에 없다. 합성으로 만든다.
function nonghyupRow(datetime, approvalNumber, amount, merchant) {
  const r = new Array(23).fill(null);
  r[1] = datetime;
  r[3] = approvalNumber;
  r[10] = amount;
  r[14] = merchant;
  r[18] = '일시불';
  return r;
}

function nonghyupXlsx(dataRows) {
  const rows = [...Array.from({ length: 14 }, () => []), ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

const ROWS = [
  nonghyupRow('2026/03/02 12:00:00', '90000001', '15000', '교보문고'),
  nonghyupRow('2026/03/03 13:00:00', '90000002', '32000', '이마트'),
];

function upload(route, buf, filename) {
  const form = new FormData();
  form.append('files', new Blob([buf]), filename);
  return fetch(`${BASE}${route}`, { method: 'POST', body: form });
}

const txTotal = async () => (await (await fetch(`${BASE}/api/transactions`)).json()).total;

// 감사로그 행수를 직접 읽는다. 이게 이 파일에서 가장 센 단언이다 — **어느 테이블에
// 무슨 쓰기가 일어나든** 트리거가 잡으므로(ADR 0007), 프리뷰가 예상 밖의 테이블을
// 건드려도 여기서 드러난다. 거래 건수만 보면 "카테고리를 만들었다" 같은 부수 쓰기를
// 놓친다.
//
// 서버가 쓰는 DB 를 읽기 전용으로 연다. WAL 이라 동시 읽기가 막히지 않는다.
function auditCount() {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;
  } finally {
    db.close();
  }
}

describe('card-import 프리뷰는 DB 를 바꾸지 않는다 (ADR 0008 / #307)', () => {
  test('A-1. 프리뷰가 건수를 세지만 한 건도 저장하지 않는다', async () => {
    assert.strictEqual(await txTotal(), 0, '시작 상태가 비어 있어야 이 테스트가 의미를 갖는다');
    const auditBefore = auditCount();

    const resp = await upload('/api/card-import?preview=true', nonghyupXlsx(ROWS), '농협카드이용내역.xlsx');
    assert.strictEqual(resp.status, 200);
    const body = await resp.json();

    // 프리뷰가 실제로 파싱에 성공했는지 먼저 확인한다. 0건을 세고 0건이 저장되면
    // 아무것도 증명하지 못한다 — 픽스처가 깨지면 이 단언이 먼저 실패해야 한다.
    assert.strictEqual(body.results[0].ok, true, JSON.stringify(body.results[0]));
    assert.strictEqual(body.results[0].count, 2, '프리뷰가 2건을 세야 한다');

    assert.strictEqual(await txTotal(), 0, '프리뷰가 거래를 저장했다');

    // 거래만 안 늘었다고 끝이 아니다. 카테고리·결제수단 같은 부수 쓰기까지 없어야
    // "DB 를 바꾸지 않는다" 가 성립한다.
    assert.strictEqual(auditCount(), auditBefore, '프리뷰가 어딘가에 썼다 — 감사로그가 늘었다');
  });

  test('A-2. 프리뷰를 몇 번 반복해도 감사로그가 늘지 않는다', async () => {
    const auditBefore = auditCount();

    for (let i = 0; i < 3; i++) {
      const resp = await upload('/api/card-import?preview=true', nonghyupXlsx(ROWS), '농협카드이용내역.xlsx');
      assert.strictEqual(resp.status, 200);
    }

    assert.strictEqual(auditCount(), auditBefore, '반복 프리뷰가 쓰기를 남겼다');
    assert.strictEqual(await txTotal(), 0);
  });

  test('A-3. /single 라우트의 프리뷰도 저장하지 않는다', async () => {
    const auditBefore = auditCount();

    const form = new FormData();
    form.append('file', new Blob([nonghyupXlsx(ROWS)]), '농협카드이용내역.xlsx');
    const resp = await fetch(`${BASE}/api/card-import/single?preview=true`, { method: 'POST', body: form });
    assert.strictEqual(resp.status, 200);
    const body = await resp.json();
    assert.strictEqual(body.count, 2, JSON.stringify(body));

    assert.strictEqual(await txTotal(), 0, '/single 프리뷰가 거래를 저장했다');
    assert.strictEqual(auditCount(), auditBefore, '/single 프리뷰가 어딘가에 썼다');
  });

  test('A-4. 프리뷰를 뺀 같은 요청은 저장하고 감사로그를 남긴다', async () => {
    // 앞의 셋은 전부 "안 늘었다" 만 본다. 애초에 저장될 수 없는 입력이었거나
    // 감사 트리거가 죽어 있었다면 셋 다 공허하게 통과한다. 같은 파일이 프리뷰
    // 없이는 저장되고 로그도 남는 것을 보여야 위 단언들이 성립한다.
    const auditBefore = auditCount();

    const resp = await upload('/api/card-import', nonghyupXlsx(ROWS), '농협카드이용내역.xlsx');
    assert.strictEqual(resp.status, 200);
    const body = await resp.json();
    assert.strictEqual(body.results[0].imported, 2, JSON.stringify(body.results[0]));

    assert.strictEqual(await txTotal(), 2);
    assert.ok(auditCount() > auditBefore, '실제 저장인데 감사로그가 안 늘었다 — 감시 장치가 죽어 있다');
  });
});
