'use strict';

// 감사 H2 — 완납(paid_off_on)된 할부는 예정 유출로 잡으면 안 된다. 옛 월별 엔진
// (projectCashflow→dbAdapter.loadInstallments)은 이 필터가 없어 완납 할부도 계속
// 지출로 셌고, 그 필터를 지우는 변이를 잡는 테스트도 없었다. 일별 엔진으로 통합한
// 뒤 그 필터(WHERE paid_off_on IS NULL)를 테스트로 잠근다.
//
// 변이 저격 구조: 활성 할부와 '완납' 할부를 **금액·카드·시작월까지 똑같이** 두 건
// 넣는다. 둘을 가르는 것은 paid_off_on 하나뿐이므로, 필터를 제거하면 완납분 회차가
// 그대로 더해져 예정 유출이 두 배가 되고 테스트가 깨진다.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const { startTestServer } = require('../helpers/testServer');
const { loadBaselineInputs } = require('../../src/services/advisor/headroomInputs');

const PORT = 21671;
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
  const db = new Database(server.dbPath);
  try {
    const catFixed = db.prepare("SELECT id FROM categories WHERE major_type = '고정지출' LIMIT 1").get().id;
    const a = db.prepare("INSERT INTO payment_methods (name, type) VALUES ('카드A', '신용')").run().lastInsertRowid;
    db.prepare('INSERT INTO card_products (payment_method_id, issuer, product_name, card_type, billing_cycle_day, statement_close_day) VALUES (?, ?, ?, ?, 14, 31)').run(a, 'A', 'A상품', '신용');
    db.prepare("INSERT INTO cash_anchors (as_of_date, amount) VALUES ('2026-10-13', 1000000)").run();
    // 월급(여유자금 창 target 산정을 위해 수입 하나는 필요하지만, 여기선 through 로 창을 고정하므로 유무 무관)
    db.prepare("INSERT INTO recurring_rules (category_id, merchant, amount, day_of_month, freq, interval, is_active) VALUES (?, '월급', 2000000, 25, 'monthly', 1, 1)")
      .run(db.prepare("SELECT id FROM categories WHERE major_type='수입' LIMIT 1").get().id);
    const ins = db.prepare("INSERT INTO installments (purchase_date, merchant, total_amount, months, monthly_amount, payment_method_id, start_billing_month, paid_off_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    // 활성: 11월 청구 시작 ×2 @ 123,000 (A결제일 14 → 11/14, 12/14)
    ins.run('2026-10-05', '활성할부', 246000, 2, 123000, a, '2026-11', null);
    // 완납: 모든 축이 동일하되 paid_off_on 만 설정 — 필터가 없으면 11/14·12/14 가 두 배가 된다.
    ins.run('2026-10-05', '완납할부', 246000, 2, 123000, a, '2026-11', '2026-10-10');
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

test('완납 할부는 예정 유출에서 제외된다(H2)', () => {
  const sch = scheduled();
  const nov = sch.find((s) => s.date === '2026-11-14' && /할부회차/.test(s.label));
  const dec = sch.find((s) => s.date === '2026-12-14' && /할부회차/.test(s.label));
  assert.ok(nov, '활성 할부의 11/14 회차는 있어야 한다');
  assert.ok(dec, '활성 할부의 12/14 회차는 있어야 한다');
  // 활성 1건만 반영 → 123,000. 완납분까지 세면 246,000 이 된다(= 필터 제거 변이).
  assert.strictEqual(nov.amount, 123000, '완납분이 더해지면 안 된다');
  assert.strictEqual(dec.amount, 123000, '완납분이 더해지면 안 된다');
});

test('완납 할부만 있으면 그 회차는 아예 없다(H2 대조군)', () => {
  const db = new Database(server.dbPath);
  let onlyPaidId;
  try {
    // 활성 할부를 완납 처리해 둘 다 완납 상태로 만들고, 그 창의 할부회차가 사라지는지 본다.
    db.prepare("UPDATE installments SET paid_off_on = '2026-10-11' WHERE merchant = '활성할부'").run();
  } finally { db.close(); }
  try {
    const sch = scheduled();
    const any = sch.some((s) => /할부회차/.test(s.label));
    assert.strictEqual(any, false, '완납 할부만 있으면 할부회차 예정 유출이 없다');
  } finally {
    const db2 = new Database(server.dbPath);
    try { db2.prepare("UPDATE installments SET paid_off_on = NULL WHERE merchant = '활성할부'").run(); } finally { db2.close(); }
  }
});
