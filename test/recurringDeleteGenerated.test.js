'use strict';

// #681 — 규칙을 끌 때 그 규칙이 따라잡기로 만든 거래(origin=recurring)도 지울지 고른다.
// 확인 버튼으로 만든 거래(origin=manual)와 다른 규칙의 거래는 건드리지 않는다.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const { startTestServer } = require('./helpers/testServer');

const PORT = 21681;
const BASE = `http://127.0.0.1:${PORT}/api/recurring-rules`;
let server;
let ruleA;
let ruleB;

before(async () => {
  server = await startTestServer({ port: PORT });
  const db = new Database(server.dbPath);
  try {
    const cat = db.prepare('SELECT id FROM categories LIMIT 1').get().id;
    const mk = db.prepare("INSERT INTO recurring_rules (category_id, merchant, amount, day_of_month, freq, interval, starts_on, is_active) VALUES (?, ?, ?, 1, 'monthly', 1, '2026-01-01', 1)");
    ruleA = mk.run(cat, '규칙A', 1000).lastInsertRowid;
    ruleB = mk.run(cat, '규칙B', 2000).lastInsertRowid;
    const tx = db.prepare('INSERT INTO transactions (date, category_id, amount, merchant, origin, origin_ref_table, origin_ref_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
    tx.run('2026-08-01', cat, 1000, '규칙A', 'recurring', 'recurring_rules', ruleA);
    tx.run('2026-09-01', cat, 1000, '규칙A', 'recurring', 'recurring_rules', ruleA);
    tx.run('2026-08-01', cat, 2000, '규칙B', 'recurring', 'recurring_rules', ruleB);
    tx.run('2026-10-01', cat, 1000, '규칙A', 'manual', null, null);
  } finally {
    db.close();
  }
});

after(() => { if (server) server.stop(); });

async function call(method, path) {
  const res = await fetch(`${BASE}${path}`, { method });
  return { status: res.status, body: await res.json() };
}

function countRows(merchant, origin) {
  const db = new Database(server.dbPath, { readonly: true });
  try {
    return db.prepare('SELECT count(*) AS n FROM transactions WHERE merchant = ? AND origin = ?').get(merchant, origin).n;
  } finally {
    db.close();
  }
}

function isActive(id) {
  const db = new Database(server.dbPath, { readonly: true });
  try {
    return db.prepare('SELECT is_active FROM recurring_rules WHERE id = ?').get(id).is_active;
  } finally {
    db.close();
  }
}

test('미리보기는 따라잡기로 만든 거래만 센다', async () => {
  const res = await call('GET', `/${ruleA}/delete-preview`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.generated_count, 2);
  assert.strictEqual(res.body.generated_total, 2000);
  assert.strictEqual(res.body.rule_id, Number(ruleA));
});

test('없는 규칙의 미리보기는 404', async () => {
  const res = await call('GET', '/999/delete-preview');
  assert.strictEqual(res.status, 404);
});

test('거래도 지우기를 고르면 그 규칙의 자동 거래만 지운다', async () => {
  const res = await call('DELETE', `/${ruleA}?withTransactions=1`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.deleted_transactions, 2);
  
  assert.strictEqual(countRows('규칙A', 'recurring'), 0);
  assert.strictEqual(countRows('규칙A', 'manual'), 1);
  assert.strictEqual(countRows('규칙B', 'recurring'), 1);
  assert.strictEqual(isActive(ruleA), 0);
});

test('규칙만 끄면 거래는 남는다', async () => {
  const res = await call('DELETE', `/${ruleB}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.deleted_transactions, 0);
  
  assert.strictEqual(countRows('규칙B', 'recurring'), 1);
  assert.strictEqual(isActive(ruleB), 0);
});

test('지운 뒤 미리보기는 0건', async () => {
  const res = await call('GET', `/${ruleA}/delete-preview`);
  assert.strictEqual(res.body.generated_count, 0);
  assert.strictEqual(res.body.generated_total, 0);
});

test('없는 규칙을 끄면 404', async () => {
  const res = await call('DELETE', '/999?withTransactions=1');
  assert.strictEqual(res.status, 404);
});
