// 서버 기동은 공용 헬퍼가 맡는다(#379). 조기 종료를 즉시 감지한다.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');
const XLSX = require('xlsx');

const PORT = 34592; // 다른 테스트와 충돌 안 나게 임의 포트 사용
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
});

after(() => {
  if (server) server.stop();
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
