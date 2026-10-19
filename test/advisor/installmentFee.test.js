'use strict';

// #772 — 여윳돈·전망의 할부 회차는 monthly_amount + fee_per_month 다. 장부의 파생
// 회차와 같은 규칙. 카드 두 장에 각각 할부 하나씩: A 는 수수료 있음, B 는 0.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const { startTestServer } = require('../helpers/testServer');
const { loadBaselineInputs } = require('../../src/services/advisor/headroomInputs');

const PORT = 21772;
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
  const db = new Database(server.dbPath);
  try {
    const pm = (name) => db.prepare("INSERT INTO payment_methods (name, type) VALUES (?, '신용')").run(name).lastInsertRowid;
    const a = pm('카드A');
    const b = pm('카드B');
    const cp = db.prepare('INSERT INTO card_products (payment_method_id, issuer, product_name, card_type, billing_cycle_day, statement_close_day) VALUES (?, ?, ?, ?, ?, 31)');
    cp.run(a, 'A', 'A상품', '신용', 14);
    cp.run(b, 'B', 'B상품', '신용', 25);
    db.prepare("INSERT INTO cash_anchors (as_of_date, amount) VALUES ('2026-10-13', 1000000)").run();
    const ins = db.prepare("INSERT INTO installments (purchase_date, merchant, total_amount, months, monthly_amount, fee_per_month, payment_method_id, start_billing_month) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    ins.run('2026-10-05', '수수료할부', 200000, 2, 100000, 3000, a, '2026-11');
    ins.run('2026-10-06', '무수수료할부', 100000, 2, 50000, 0, b, '2026-11');
  } finally {
    db.close();
  }
});

after(() => { if (server) server.stop(); });

function scheduled() {
  const db = new Database(server.dbPath, { readonly: true });
  try { return loadBaselineInputs(db, { asOf: '2026-10-13', through: '2026-12' }).scheduled; }
  finally { db.close(); }
}

const find = (sch, date) => sch.find((s) => s.date === date && /할부회차/.test(s.label));

test('수수료가 있는 할부는 원금+수수료로 잡힌다', () => {
  const sch = scheduled();
  const a1 = find(sch, '2026-11-14');
  const a2 = find(sch, '2026-12-14');
  assert.ok(a1);
  assert.strictEqual(a1.amount, 103000);
  assert.strictEqual(a2.amount, 103000);
});

test('수수료가 0 인 할부는 원금 그대로다', () => {
  const sch = scheduled();
  const b1 = find(sch, '2026-11-25');
  const b2 = find(sch, '2026-12-25');
  assert.strictEqual(b1.amount, 50000);
  assert.strictEqual(b2.amount, 50000);
});

test('수수료 회차의 라벨은 그 카드 이름을 쓴다', () => {
  const sch = scheduled();
  const a = find(sch, '2026-11-14');
  const b = find(sch, '2026-11-25');
  assert.strictEqual(a.label, '카드A 할부회차');
  assert.strictEqual(b.label, '카드B 할부회차');
});

test('창 밖(2027-01) 회차는 없다', () => {
  const sch = scheduled();
  assert.strictEqual(sch.some((s) => s.date >= '2027-01-01' && /할부회차/.test(s.label)), false);
});
