'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const XLSX = require('xlsx');
const Database = require('better-sqlite3');
const { startTestServer } = require('./helpers/testServer');

const PORT = 21659;
const BASE = `http://127.0.0.1:${PORT}`;
let server;
let dbPath;

before(async () => {
  server = await startTestServer({ port: PORT });
  dbPath = server.dbPath;
});

after(() => {
  // 단언이 던져도 자식을 죽인다. 살아남으면 러너가 상한까지 붙잡힌다.
  if (server) server.stop();
});

// 현대카드 포맷. 헤더 3행을 비우고 index 3 부터 데이터다.
// 가맹점과 금액이 **한 칸에 붙어** 온다 — 'SSG_COM100,849' 처럼.
// 해외 결제는 그 앞에 원 통화 조각이 붙는다 — 'ANTHROPIC,USD:5.508,116'.
function hyundaiRow(merchantAmount, installment = null) {
  const r = new Array(6).fill(null);
  r[0] = '2026년 03월 02일';
  r[2] = merchantAmount;
  r[3] = installment;
  return r;
}

function hyundaiXlsx(dataRows) {
  const rows = [...Array.from({ length: 3 }, () => []), ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// 파일 이름에 카드사명이 들어가야 한다. 파서는 파일 이름으로 카드사를 고른다.
function upload(route, buf, filename = '현대카드이용내역.xlsx') {
  const form = new FormData();
  form.append('files', new Blob([buf]), filename);
  return fetch(`${BASE}${route}`, { method: 'POST', body: form });
}

// 저장된 거래를 가맹점 이름으로 찾는다. 없으면 undefined.
function rowOf(merchantLike) {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.prepare(
      "SELECT merchant, amount, is_overseas FROM transactions WHERE merchant LIKE ?"
    ).get(`%${merchantLike}%`);
  } finally {
    db.close();
  }
}

test('원 통화가 찍힌 결제가 해외로 저장된다.', async () => {
  const buf = hyundaiXlsx([hyundaiRow('ANTHROPIC,USD:5.508,116')]);
  const resp = await upload('/api/card-import', buf);
  assert.strictEqual(resp.status, 200);
  const body = await resp.json();
  assert.strictEqual(body.results[0].imported, 1);
  const row = rowOf('ANTHROPIC');
  assert.strictEqual(row.is_overseas, 1);
  assert.strictEqual(row.amount, 8116);
});

test('말미 국가코드가 붙은 결제도 해외로 저장된다.', async () => {
  const buf = hyundaiXlsx([hyundaiRow('OPENAI                 SAN FRANCISCO USA32,494')]);
  const resp = await upload('/api/card-import', buf);
  assert.strictEqual(resp.status, 200);
  const body = await resp.json();
  assert.strictEqual(body.results[0].imported, 1);
  const row = rowOf('OPENAI');
  assert.strictEqual(row.is_overseas, 1);
  assert.strictEqual(row.amount, 32494);
});

test('표시가 없는 결제는 국내로 저장된다.', async () => {
  const buf = hyundaiXlsx([hyundaiRow('SSG_COM100,849')]);
  const resp = await upload('/api/card-import', buf);
  assert.strictEqual(resp.status, 200);
  const body = await resp.json();
  assert.strictEqual(body.results[0].imported, 1);
  const row = rowOf('SSG_COM');
  assert.strictEqual(row.is_overseas, 0);
  assert.strictEqual(row.amount, 100849);
});

test('이름만 해외 서비스인 것을 짐작하지 않는다.', async () => {
  const buf = hyundaiXlsx([hyundaiRow('Adobe14,520')]);
  const resp = await upload('/api/card-import', buf);
  assert.strictEqual(resp.status, 200);
  const body = await resp.json();
  assert.strictEqual(body.results[0].imported, 1);
  const row = rowOf('Adobe');
  assert.strictEqual(row.is_overseas, 0);
});

test('한 파일에 섞여 와도 각각 맞게 저장된다.', async () => {
  const buf = hyundaiXlsx([
    hyundaiRow('ANTHROPIC,USD:9.9914,800'),
    hyundaiRow('동네분식9,000'),
    hyundaiRow('FANPLUS USA, INC.      JPN12,300')
  ]);
  const resp = await upload('/api/card-import', buf);
  assert.strictEqual(resp.status, 200);
  const body = await resp.json();
  assert.strictEqual(body.results[0].imported, 3);
  const row1 = rowOf('ANTHROPIC,USD:9.99');
  assert.strictEqual(row1.is_overseas, 1);
  const row2 = rowOf('동네분식');
  assert.strictEqual(row2.is_overseas, 0);
  const row3 = rowOf('FANPLUS');
  assert.strictEqual(row3.is_overseas, 1);
});

test('프리뷰가 해외 건수를 세고 저장은 안 한다.', async () => {
  const buf = hyundaiXlsx([hyundaiRow('STRIPE,USD:2.0003,000')]);
  const resp = await upload('/api/card-import?preview=true', buf);
  assert.strictEqual(resp.status, 200);
  const body = await resp.json();
  assert.strictEqual(body.results[0].ok, true);
  assert.strictEqual(body.results[0].count, 1);
  assert.strictEqual(body.results[0].overseas, 1);
  const row = rowOf('STRIPE');
  assert.strictEqual(row, undefined);
});

test('표시가 없는 파일이면 프리뷰의 해외 건수가 0이다.', async () => {
  const buf = hyundaiXlsx([hyundaiRow('편의점3,500')]);
  const resp = await upload('/api/card-import?preview=true', buf);
  assert.strictEqual(resp.status, 200);
  const body = await resp.json();
  assert.strictEqual(body.results[0].count, 1);
  assert.strictEqual(body.results[0].overseas, 0);
});
