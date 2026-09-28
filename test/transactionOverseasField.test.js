'use strict';

// 손으로 넣는 결제에 해외 표시를 세울 수 있는가(#710).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 이 배선이 조용히 끊기나
//
// 034 가 칸을 `NOT NULL DEFAULT 0` 으로 만들었다. 그래서 라우트가 이 칸을
// **안 받아도 INSERT 는 성공한다** — 전부 「국내」 로 저장될 뿐이다.
//
// 오류가 아니라 그럴듯한 값이 나온다. 사용자는 체크박스를 켜고 저장했는데
// 「해외 N% 적립」 이 안 붙는 것을 보고, 혜택 데이터를 의심하게 된다.
//
// 임포트 경로는 `cardExcelImportSynthetic` 이, 백필은 `cardOverseasRoute` 가
// 본다. 여기는 **손으로 넣는 경로**다.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const PORT = 21645;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

async function api(method, url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* JSON 이 아닐 수 있다 */ }
  return { status: res.status, body: json, text };
}

let pmId;
let expenseCatId;

function overseasOf(id) {
  const Database = require('better-sqlite3');
  const db = new Database(server.dbPath, { readonly: true });
  const row = db.prepare('SELECT is_overseas FROM transactions WHERE id=?').get(id);
  db.close();
  return row.is_overseas;
}

const base = () => ({
  date: '2026-01-11', amount: 10000, merchant: 'ANTHROPIC',
  payment_method_id: pmId, payment_style: '일시불', category_id: expenseCatId,
});

before(async () => {
  server = await startTestServer({ port: PORT });
  const pms = await api('GET', '/api/payment-methods');
  pmId = (Array.isArray(pms.body) ? pms.body : pms.body.data)[0].id;
  const cats = await api('GET', '/api/categories');
  const rows = Array.isArray(cats.body) ? cats.body : cats.body.data;
  expenseCatId = rows.find((c) => c.major_type !== '수입').id;
});

after(() => {
  // 단언이 던져도 자식을 죽인다. 살아남으면 러너가 상한까지 붙잡힌다(#602).
  if (server) server.stop();
});

test('POST — 켜서 보내면 선다', async () => {
  const res = await api('POST', '/api/transactions', { ...base(), is_overseas: true });
  assert.equal(res.status, 201, res.text);
  assert.equal(overseasOf(res.body.id), 1);
});

test('POST — 안 보내면 국내다. 안 받는 것과 구분되지 않으므로 위 단언이 짝이다', async () => {
  const res = await api('POST', '/api/transactions', base());
  assert.equal(res.status, 201, res.text);
  assert.equal(overseasOf(res.body.id), 0);
});

test('PUT — 켤 수 있다', async () => {
  const made = await api('POST', '/api/transactions', base());
  const res = await api('PUT', `/api/transactions/${made.body.id}`, { ...base(), is_overseas: true });
  assert.equal(res.status, 200, res.text);
  assert.equal(overseasOf(made.body.id), 1);
});

test('PUT — **끌 수도 있다**. COALESCE 를 쓰면 되돌릴 길이 없어진다', async () => {
  const made = await api('POST', '/api/transactions', { ...base(), is_overseas: true });
  assert.equal(overseasOf(made.body.id), 1);

  const res = await api('PUT', `/api/transactions/${made.body.id}`, { ...base(), is_overseas: false });
  assert.equal(res.status, 200, res.text);
  assert.equal(overseasOf(made.body.id), 0,
    '잘못 켠 것을 사용자가 끌 수 없으면, 안 받은 혜택이 계산에 계속 남는다');
});

test('조회에도 실린다 — 수정 화면이 체크 상태를 되살릴 수 있어야 한다', async () => {
  const made = await api('POST', '/api/transactions', { ...base(), is_overseas: true });
  const res = await api('GET', '/api/transactions?from=2026-01-01&to=2026-01-31');
  assert.equal(res.status, 200, res.text);

  const rows = res.body.data || res.body;
  const row = rows.find((r) => r.id === made.body.id);
  assert.ok(row, '그 거래가 목록에 없다');
  assert.equal(row.is_overseas, 1,
    '조회에 안 실리면 수정 화면이 체크를 늘 꺼진 채로 열고, 저장하는 순간 표시가 지워진다');
});
