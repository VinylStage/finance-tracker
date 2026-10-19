'use strict';

// #689 — CSV 임포트가 제외한 행의 위치(line, 헤더=1)·원본(raw)·이유(reason)를 미리보기·적용
// 응답에 invalidRows 로 싣는다. 가맹점명은 손으로 지은 가상 이름이다.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');
const { parseCardCsv } = require('../src/services/csvImport');

const PORT = 21689;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

const CSV = '거래일자,가맹점,금액\n2026.01.15,가상카페,4500\n2026.13.45,가상서점,20000\n2026.01.16,가상식당,abc\n없음,가상마트,없음\n2026.01.17,가상빵집,3000\n';

const EXPECTED = [
  { line: 3, raw: '2026.13.45,가상서점,20000', reason: '날짜를 읽을 수 없습니다' },
  { line: 4, raw: '2026.01.16,가상식당,abc', reason: '금액을 읽을 수 없습니다' },
  { line: 5, raw: '없음,가상마트,없음', reason: '날짜와 금액을 읽을 수 없습니다' },
];

async function postCsv(path, csvText) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardCompany: 'shinhan', csvText }),
  });
  return { status: res.status, body: await res.json() };
}

before(async () => { server = await startTestServer({ port: PORT }); });
after(() => { if (server) server.stop(); });

test('미리보기는 제외한 행의 위치·원본·이유를 돌려준다', async () => {
  const r = await postCsv('/api/csv-import?preview=true', CSV);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.count, 2);
  assert.strictEqual(r.body.invalid, 3);
  assert.deepStrictEqual(r.body.invalidRows, EXPECTED);
});

test('적용 응답에도 같은 목록이 실린다', async () => {
  const r = await postCsv('/api/csv-import', CSV);
  assert.strictEqual(r.body.imported, 2);
  assert.deepStrictEqual(r.body.invalidRows, EXPECTED);
});

test('제외 행이 없으면 빈 배열이다', async () => {
  const r = await postCsv('/api/csv-import?preview=true', '거래일자,가맹점,금액\n2026.02.01,가상약국,1000\n');
  assert.deepStrictEqual(r.body.invalidRows, []);
  assert.strictEqual(r.body.invalid, 0);
});

test('정상 행에는 원본 값을 싣지 않는다', async () => {
  const rows = parseCardCsv('shinhan', CSV);
  assert.strictEqual('raw' in rows[0], false);
  assert.strictEqual('line' in rows[0], false);
});

test('파서의 제외 행에는 이유가 있다', async () => {
  const reasons = parseCardCsv('shinhan', CSV).filter((r) => r.error).map((r) => r.reason);
  assert.deepStrictEqual(reasons, ['날짜를 읽을 수 없습니다', '금액을 읽을 수 없습니다', '날짜와 금액을 읽을 수 없습니다']);
});

test('빈 줄은 행 번호를 차지해도 제외 목록에 들어가지 않는다', async () => {
  const csv = '거래일자,가맹점,금액\n2026.01.15,가상카페,4500\n\n2026.99.01,가상꽃집,100\n';
  const r = await postCsv('/api/csv-import?preview=true', csv);
  assert.deepStrictEqual(r.body.invalidRows, [{ line: 4, raw: '2026.99.01,가상꽃집,100', reason: '날짜를 읽을 수 없습니다' }]);
});
