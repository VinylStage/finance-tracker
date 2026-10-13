'use strict';

// 카드로 결제되는 반복 고정지출(예: 통신요금 자동납부)은 이용일이 아니라 그 카드
// 결제일에 현금이 빠진다. 현금 고정비로 따로 잡으면 카드 청구와 이중계산이 된다.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const { startTestServer } = require('./helpers/testServer');
const { loadBaselineInputs } = require('../src/services/advisor/headroomInputs');

const PORT = 21664;
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
  const db = new Database(server.dbPath);
  try {
    const cat = (major) => db.prepare('SELECT id FROM categories WHERE major_type = ? LIMIT 1').get(major).id;
    const pm = (name, type) => db.prepare('INSERT INTO payment_methods (name, type) VALUES (?, ?)').run(name, type).lastInsertRowid;
    const a = pm('카드A', '신용');
    const noDays = pm('결제일없는카드', '신용');
    const cash = pm('통장', '이체');
    db.prepare('INSERT INTO card_products (payment_method_id, issuer, product_name, card_type, billing_cycle_day, statement_close_day) VALUES (?, ?, ?, ?, 14, 31)').run(a, 'A', 'A상품', '신용');
    db.prepare("INSERT INTO cash_anchors (as_of_date, amount) VALUES ('2026-10-13', 600000)").run();
    const rule = db.prepare("INSERT INTO recurring_rules (category_id, merchant, amount, day_of_month, payment_method_id, freq, interval, is_active, starts_on) VALUES (?, ?, ?, ?, ?, 'monthly', 1, 1, ?)");
    rule.run(cat('수입'), '급여', 1000000, 25, null, null);
    rule.run(cat('고정지출'), '통신', 52000, 13, a, '2026-11-01');   // 11/13 이용 → 12/14 결제
    rule.run(cat('고정지출'), '구독', 10000, 20, a, null);          // 10/20 이용 → 11/14 결제
    rule.run(cat('고정지출'), '이전이용', 7000, 5, a, null);         // 10/05 이용은 앵커 전 → 제외, 11/05 → 12/14
    rule.run(cat('고정지출'), '월세', 100000, 1, cash, null);        // 이체 → 현금 고정비
    rule.run(cat('고정지출'), '늦은시작', 4000, 20, a, '2026-12-01'); // 12/20 이용부터 → 1/14
    db.prepare("INSERT INTO recurring_rules (category_id, merchant, amount, day_of_month, payment_method_id, freq, interval, is_active, ends_on) VALUES (?, '끝남', 6000, 20, ?, 'monthly', 1, 1, '2026-10-31')").run(cat('고정지출'), a); // 10/20 이용만 → 11/14
    rule.run(cat('고정지출'), '모름', 3000, 1, noDays, null);        // 결제일 미설정 카드 → 경고 + 현금
  } finally {
    db.close();
  }
});

after(() => { if (server) server.stop(); });

function inputs() {
  const db = new Database(server.dbPath, { readonly: true });
  try { return loadBaselineInputs(db, { asOf: '2026-10-13', through: '2027-01' }); } finally { db.close(); }
}

test('카드 결제 반복규칙은 현금 고정비에서 빠지고 카드 결제일 유출로 간다', () => {
  const inp = inputs();
  const cashLabels = inp.monthlyFixed.map((f) => f.label);
  assert.ok(!cashLabels.includes('통신') && !cashLabels.includes('구독'), '카드 결제분은 현금 고정비가 아니다');
  assert.ok(cashLabels.includes('월세'), '이체는 현금 고정비');
  const sched = inp.scheduled.map((s) => `${s.date} ${s.label} ${s.amount}`);
  assert.ok(sched.includes('2026-11-14 카드A 고정청구(구독) 10000'));
  assert.ok(sched.includes('2026-12-14 카드A 고정청구(통신) 52000'), '11월 이용 → 12/14 결제');
  assert.ok(!sched.some((x) => x.startsWith('2026-11-14') && x.includes('통신')), '유효시작 11월 전엔 없다');
});

test('앵커 이전 이용분은 다시 세지 않는다(이미 정산·거래내역에 있음)', () => {
  const inp = inputs();
  const sched = inp.scheduled.filter((s) => s.label.includes('이전이용'));
  assert.deepStrictEqual(sched.map((s) => s.date), ['2026-12-14', '2027-01-14']); // 11/05, 12/05 이용분만
});

test('결제일 미설정 카드는 경고 후 현금으로 계산', () => {
  const inp = inputs();
  assert.ok(inp.monthlyFixed.some((f) => f.label === '모름'));
  assert.ok(inp.warnings.some((w) => w.includes('결제일없는카드')));
  assert.ok(!inp.warnings.some((w) => w.includes('통장')), '이체 수단은 경고 대상 아님');
});

test('카드 결제 반복규칙의 유효 시작/종료월', () => {
  const inp = inputs();
  const dates = (lbl) => inp.scheduled.filter((x) => x.label.includes(lbl)).map((x) => x.date);
  assert.deepStrictEqual(dates('늦은시작'), ['2027-01-14']);
  assert.deepStrictEqual(dates('끝남'), ['2026-11-14']);
});
