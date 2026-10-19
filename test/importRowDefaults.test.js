'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const { startTestServer } = require('./helpers/testServer');

// #736 — resolveImportRow 를 쪼개기 전에, 돌연변이로 재서 기존 테스트가 못 잡던
// 분기(분류 이름 폴백, 구버전 줄 기본값, 출처 정규화·참조 복원)를 저장된 값으로 고정한다.

const PORT = 21736;
const BASE = `http://127.0.0.1:${PORT}`;
let server;
let categoryId;

before(async () => {
  server = await startTestServer({ port: PORT });
  const res = await fetch(`${BASE}/api/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ major_type: '변동필수', name: '복원분류' }),
  });
  categoryId = (await res.json()).id;
});

after(() => {
  if (server) server.stop();
});

async function importRows(rows) {
  const res = await fetch(`${BASE}/api/data/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'append', transactions: rows }),
  });
  return { status: res.status, body: await res.json() };
}

// 저장된 한 줄을 가맹점 이름으로 읽는다.
function stored(merchant) {
  const db = new Database(server.dbPath, { readonly: true });
  try {
    return db.prepare('SELECT * FROM transactions WHERE merchant = ?').get(merchant);
  } finally {
    db.close();
  }
}

// 신버전 백업의 한 줄. 레거시 판정 필드가 전부 있다.
function fullRow(merchant, over = {}) {
  return {
    date: '2026-08-03',
    amount: 3000,
    category_id: categoryId,
    category_name: '복원분류',
    merchant,
    memo: null,
    payment_method_id: null,
    payment_style: '일시불',
    approval_number: null,
    installment_id: null,
    created_at: '2026-08-01 00:00:00',
    ...over,
  };
}

// 구버전 백업의 한 줄. 레거시 판정 필드가 하나도 없다.
function legacyRow(merchant) {
  return { date: '2026-08-02', amount: 2000, category_id: categoryId, category_name: '복원분류', merchant };
}

test('분류 번호가 없는 번호면 이름으로 찾는다', async () => {
  const r = await importRows([fullRow('이름으로', { category_id: 99999 })]);
  assert.strictEqual(r.body.imported, 1);
  const row = stored('이름으로');
  assert.strictEqual(row.category_id, categoryId);
});

test('구버전 줄은 빠진 필드를 기본값으로 채운다', async () => {
  const r = await importRows([legacyRow('구버전')]);
  assert.strictEqual(r.body.imported, 1);
  assert.strictEqual(r.body.legacy_fields_defaulted, true);
  assert.strictEqual(r.body.fk_fallback, undefined);
  const row = stored('구버전');
  assert.strictEqual(row.payment_method_id, null);
  assert.strictEqual(row.payment_style, '일시불');
  assert.strictEqual(row.approval_number, null);
  assert.strictEqual(row.installment_id, null);
  assert.strictEqual(row.origin, 'manual');
  assert.strictEqual(row.origin_ref_table, null);
  assert.strictEqual(row.origin_ref_id, null);
});

test('구버전 줄의 생성 시각은 지금으로 채운다', async () => {
  const r = await importRows([legacyRow('구버전시각')]);
  assert.strictEqual(r.body.imported, 1);
  const row = stored('구버전시각');
  const at = Date.parse(row.created_at.replace(' ', 'T') + 'Z');
  assert.strictEqual(Math.abs(Date.now() - at) < 120000, true);
});

test('알 수 없는 출처는 manual 로 바꾼다', async () => {
  const r = await importRows([fullRow('이상한출처', { origin: 'bogus' })]);
  assert.strictEqual(r.body.imported, 1);
  const row = stored('이상한출처');
  assert.strictEqual(row.origin, 'manual');
});

test('출처와 참조는 그대로 복원한다', async () => {
  const r = await importRows([fullRow('참조복원', { approval_number: 'A1', origin: 'recurring', origin_ref_table: 'recurring_rules', origin_ref_id: 7 })]);
  assert.strictEqual(r.body.imported, 1);
  const row = stored('참조복원');
  assert.strictEqual(row.approval_number, 'A1');
  assert.strictEqual(row.origin, 'recurring');
  assert.strictEqual(row.origin_ref_table, 'recurring_rules');
  assert.strictEqual(row.origin_ref_id, 7);
});
