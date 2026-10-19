'use strict';

// #774 — 여윳돈·전망의 할부 회차는 장부의 파생 회차가 정본이다. 파생 회차가 없는
// 할부만 installments(monthly_amount + fee_per_month)로 계산한다. 완납은 제외.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const { startTestServer } = require('../helpers/testServer');
const { loadBaselineInputs } = require('../../src/services/advisor/headroomInputs');

const PORT = 21774;
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
  const db = new Database(server.dbPath);
  try {
    const cat = db.prepare("SELECT id FROM categories WHERE major_type = '고정지출' LIMIT 1").get().id;
    const pm = (name) => db.prepare("INSERT INTO payment_methods (name, type) VALUES (?, '신용')").run(name).lastInsertRowid;
    const a = pm('카드A');
    const b = pm('카드B');
    const cp = db.prepare('INSERT INTO card_products (payment_method_id, issuer, product_name, card_type, billing_cycle_day, statement_close_day) VALUES (?, ?, ?, ?, ?, 31)');
    cp.run(a, 'A', 'A상품', '신용', 14);
    cp.run(b, 'B', 'B상품', '신용', 25);
    db.prepare("INSERT INTO cash_anchors (as_of_date, amount) VALUES ('2026-10-13', 1000000)").run();
    const ins = db.prepare("INSERT INTO installments (purchase_date, merchant, total_amount, months, monthly_amount, fee_per_month, payment_method_id, start_billing_month, paid_off_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    const der = db.prepare("INSERT INTO transactions (date, category_id, amount, payment_method_id, payment_style, merchant, installment_id, origin, origin_ref_table, origin_ref_id, origin_seq, origin_seq_total) VALUES (?, ?, ?, ?, '할부', ?, ?, 'installment', 'installments', ?, ?, ?)");
    // 파생 회차가 있는 할부: 1회차에 끝수(+100)가 붙어 monthly_amount 와 다르다.
    const x = ins.run('2026-10-05', '파생있음', 200100, 2, 100000, 0, a, '2026-11', null).lastInsertRowid;
    der.run('2026-11-01', cat, 100100, a, '파생있음', x, x, 1, 2);
    der.run('2026-12-01', cat, 100000, a, '파생있음', x, x, 2, 2);
    // 파생 회차가 없는 할부: installments 로 계산(50,000 + 수수료 2,000).
    ins.run('2026-10-06', '파생없음', 100000, 2, 50000, 2000, b, '2026-11', null);
    // 완납 할부: 파생 회차가 있어도 빠져야 한다.
    const z = ins.run('2026-09-05', '완납', 70000, 2, 35000, 0, a, '2026-11', '2026-10-10').lastInsertRowid;
    der.run('2026-11-01', cat, 35000, a, '완납', z, z, 1, 2);
    der.run('2026-12-01', cat, 35000, a, '완납', z, z, 2, 2);
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

test('파생 회차가 있으면 그 금액을 쓴다(끝수 포함)', () => {
  const sch = scheduled();
  assert.ok(find(sch, '2026-11-14'));
  assert.strictEqual(find(sch, '2026-11-14').amount, 100100);
  assert.strictEqual(find(sch, '2026-12-14').amount, 100000);
});

test('같은 할부를 할부 테이블로 한 번 더 세지 않는다', () => {
  const sch = scheduled();
  assert.strictEqual(find(sch, '2026-11-14').amount, 100100);
  assert.strictEqual(sch.filter((s) => s.date === '2026-11-14').length, 1);
});

test('파생 회차가 없으면 원금+수수료로 계산한다', () => {
  const sch = scheduled();
  assert.strictEqual(find(sch, '2026-11-25').amount, 52000);
  assert.strictEqual(find(sch, '2026-12-25').amount, 52000);
});

test('완납 할부는 파생 회차가 있어도 빠진다', () => {
  const sch = scheduled();
  // 카드A 11/14 는 파생있음 할부 100,100 뿐이다 — 완납분 35,000 이 더해지면 135,100.
  assert.strictEqual(find(sch, '2026-11-14').amount, 100100);
  // 12/14 도 마찬가지(완납분이 더해지면 135,000).
  assert.strictEqual(find(sch, '2026-12-14').amount, 100000);
});

test('할부회차는 네 건뿐이다', () => {
  const sch = scheduled();
  assert.strictEqual(sch.filter((s) => /할부회차/.test(s.label)).length, 4);
});
