'use strict';

// /api/advisor — 앵커 입력 → 장기 전망 · 이번 주기 여윳돈. 임시 DB(실DB 미접촉).

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const { startTestServer } = require('./helpers/testServer');

const PORT = 21663;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
  // 시나리오 데이터는 DB 에 직접 넣는다(반복규칙·할부·카드 결제일은 이 라우트의 입력일 뿐).
  const db = new Database(server.dbPath);
  try {
    const cat = (major) => db.prepare('SELECT id FROM categories WHERE major_type = ? LIMIT 1').get(major).id;
    const pm = (name) => db.prepare('INSERT INTO payment_methods (name, type) VALUES (?, ?)').run(name, '신용').lastInsertRowid;
    const a = pm('테스트A카드');
    const b = pm('테스트B카드');
    const cp = db.prepare('INSERT INTO card_products (payment_method_id, issuer, product_name, card_type, billing_cycle_day, statement_close_day) VALUES (?, ?, ?, ?, ?, ?)');
    cp.run(a, 'A', 'A상품', '신용', 14, 31);
    cp.run(b, 'B', 'B상품', '신용', 25, 12);
    const rule = db.prepare("INSERT INTO recurring_rules (category_id, merchant, amount, day_of_month, freq, interval, is_active) VALUES (?, ?, ?, ?, 'monthly', 1, 1)");
    rule.run(cat('수입'), '월급', 2000000, 25);
    rule.run(cat('고정지출'), '월세', 500000, 1);
    // B카드(미결제) 일시불 10/01 사용 → 마감 12 → 10/25 청구
    const tx = db.prepare("INSERT INTO transactions (date, category_id, amount, payment_method_id, payment_style, merchant) VALUES (?, ?, ?, ?, '일시불', ?)");
    tx.run('2026-10-01', cat('고정지출'), 300000, b, '상점');
    // A카드 할부: 11월 청구 시작, 월 100,000 × 2
    db.prepare("INSERT INTO installments (purchase_date, merchant, total_amount, months, monthly_amount, payment_method_id, start_billing_month) VALUES ('2026-10-05', '할부상점', 200000, 2, 100000, ?, '2026-11')").run(a);
    // 선결제 A카드의 10월 청구(10/14) 회차 — 이미 냈으므로 예정 유출이 아니다
    db.prepare("INSERT INTO installments (purchase_date, merchant, total_amount, months, monthly_amount, payment_method_id, start_billing_month) VALUES ('2026-09-05', '지난할부', 70000, 1, 70000, ?, '2026-10')").run(a);
    // 미결제 B카드의 할부 원거래 — 회차로 따로 잡히므로 일시불 청구에 넣으면 이중계산
    db.prepare("INSERT INTO transactions (date, category_id, amount, payment_method_id, payment_style, merchant) VALUES ('2026-10-02', ?, 900000, ?, '할부', '할부원거래')").run(cat('고정지출'), b);
  } finally {
    db.close();
  }
});

after(() => { if (server) server.stop(); });

test('앵커 없으면 409', async () => {
  const r = await fetch(`${BASE}/api/advisor/projection?asOf=2026-10-13`);
  assert.strictEqual(r.status, 409);
});

test('앵커 입력 검증 + 저장', async () => {
  const bad = await fetch(`${BASE}/api/advisor/anchor`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ as_of_date: '2026/10/13', amount: 1 }) });
  assert.strictEqual(bad.status, 400);
  const ok = await fetch(`${BASE}/api/advisor/anchor`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ as_of_date: '2026-10-13', amount: 600000 }) });
  assert.strictEqual(ok.status, 201);
  const got = await (await fetch(`${BASE}/api/advisor/anchor?asOf=2026-10-20`)).json();
  assert.strictEqual(got.amount, 600000);
});

test('장기 전망 — horizon 임의 확장 + 범용 추가지출 시나리오(이름 자유)', async () => {
  const r = await (await fetch(`${BASE}/api/advisor/projection?asOf=2026-10-13&horizon=24&simAmount=1200000&simMonths=24&simStart=2026-11&simLabel=${encodeURIComponent('노트북')}`)).json();
  assert.strictEqual(r.base.timeline.length, 24);
  assert.strictEqual(r.base.timeline[23].month, '2028-09');
  // H1 통합(일별 엔진): 앵커(10-13) '당일 이후'만 센다. 10월 창(10-14~10-31)에서
  // 월세(10-01)는 이미 지났고, 10월 할부회차는 선결제분이라 제외 → 유입은 월급
  // 2,000,000 뿐. 600,000 + 2,000,000 = 2,600,000.
  // (옛 월별 엔진은 지난 월세 −500,000 과 이미 낸 10월 회차 −70,000 을 다시 빼
  //  2,030,000 을 냈다 — 그 중복계산이 이 PR 에서 사라진다.)
  assert.strictEqual(r.base.timeline[0].balance, 2600000);
  assert.strictEqual(r.base.timeline[0].partial, true, '앵커월은 당일부터만 센다(부분월)');
  // H1 정밀 고정: 앵커월 창에 지난 유출이 끼면 안 된다.
  assert.strictEqual(r.base.timeline[0].outflow, 0, '10월 창(10-14~)엔 유출 없음(월세·완납회차 제외)');
  assert.strictEqual(r.base.timeline[0].inflow, 2000000, '10월 창 유입은 월급뿐');
  // 시나리오 50,000/월이 11월부터 붙는다 + 이름이 반영된다
  assert.strictEqual(r.withSim.timeline[1].outflow - r.base.timeline[1].outflow, 50000);
  assert.strictEqual(r.simulated[0].label, '노트북');
  const bad = await fetch(`${BASE}/api/advisor/projection?asOf=2026-10-13&horizon=0`);
  assert.strictEqual(bad.status, 400);
});

test('여윳돈 — 미결제 카드 청구 + 할부 회차, 신용/즉시 구분', async () => {
  const r = await (await fetch(`${BASE}/api/advisor/headroom?asOf=2026-10-13&unpaid=${encodeURIComponent('테스트B카드')}`)).json();
  // 새 사용분은 선결제 A카드 → 10월 사용 → 11/14 청구, 목표는 다음 월급 전날
  assert.strictEqual(r.spendDate, '2026-11-14');
  assert.strictEqual(r.target, '2026-11-24');
  const labels = r.scheduled.map((s) => `${s.date} ${s.label} ${s.amount}`);
  assert.ok(labels.includes('2026-10-25 테스트B카드 청구(일시불) 300000'));
  assert.ok(labels.includes('2026-11-14 테스트A카드 할부회차 100000'));
  // 600,000 → 10/25 +2,000,000 −300,000 = 2,300,000 → 11/01 −500,000 = 1,800,000 → 11/14 −100,000 = 1,700,000
  assert.strictEqual(r.capacityImmediate, 600000);
  assert.strictEqual(r.capacity, 1700000);
});

test('여윳돈 — 선결제 카드의 이미 낸 청구·할부 원거래는 빼지 않는다', async () => {
  const r = await (await fetch(`${BASE}/api/advisor/headroom?asOf=2026-10-13&unpaid=${encodeURIComponent('테스트B카드')}`)).json();
  const labels = r.scheduled.map((s) => `${s.date} ${s.label} ${s.amount}`);
  assert.ok(!labels.some((l) => l.startsWith('2026-10-14')), '선결제 카드 10/14 회차는 제외');
  assert.ok(!labels.some((l) => l.includes('900000')), '할부 원거래는 일시불 청구에서 제외');
});

test('여윳돈 — target 당일 예정분은 포함', async () => {
  const r = await (await fetch(`${BASE}/api/advisor/headroom?asOf=2026-10-13&unpaid=${encodeURIComponent('테스트B카드')}&target=2026-11-14`)).json();
  assert.ok(r.scheduled.some((s) => s.date === '2026-11-14'));
});

test('베이스라인 입력 — through 월 말일까지(31일 달)', () => {
  const { loadBaselineInputs } = require('../src/services/advisor/headroomInputs');
  const db = new Database(server.dbPath, { readonly: true });
  try {
    const inp = loadBaselineInputs(db, { asOf: '2026-10-13', through: '2026-12' });
    assert.strictEqual(inp.target, '2026-12-31');
  } finally {
    db.close();
  }
});
