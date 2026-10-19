'use strict';

// #677 — 분류·결제수단을 끌 때 쓰는 규칙을 보여 주고 함께 끌지 고른다. 꺼진 항목으로는 새
// 거래·규칙을 못 만든다(수정은 그 값으로 바꿀 때만 막는다).

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const { startTestServer } = require('./helpers/testServer');

const PORT = 21677;
const BASE = `http://127.0.0.1:${PORT}/api`;
const CAT_ERR = '비활성화된 분류는 새 거래·규칙에 쓸 수 없습니다.';
const PM_ERR = '비활성화된 결제수단은 새 거래·규칙에 쓸 수 없습니다.';
let server;
let cat;
let pm;
let liveCat;
let txId;

before(async () => {
  server = await startTestServer({ port: PORT });
  const db = new Database(server.dbPath);
  try {
    cat = db.prepare("INSERT INTO categories (major_type, name) VALUES ('고정지출', '가상분류')").run().lastInsertRowid;
    pm = db.prepare("INSERT INTO payment_methods (name, type) VALUES ('가상카드', '신용')").run().lastInsertRowid;
    liveCat = db.prepare("INSERT INTO categories (major_type, name) VALUES ('선택지출', '살아있는분류')").run().lastInsertRowid;
    const r = db.prepare("INSERT INTO recurring_rules (category_id, payment_method_id, merchant, amount, day_of_month, freq, interval, starts_on, is_active) VALUES (?, ?, ?, 1000, 1, 'monthly', 1, '2026-01-01', ?)");
    r.run(cat, pm, '규칙1', 1);
    r.run(cat, pm, '규칙2', 1);
    r.run(cat, pm, '꺼진규칙', 0);
    txId = db.prepare("INSERT INTO transactions (date, category_id, payment_method_id, amount, merchant) VALUES ('2026-10-01', ?, ?, 1000, '가상')").run(cat, pm).lastInsertRowid;
  } finally {
    db.close();
  }
});

after(() => { if (server) server.stop(); });

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

function activeRuleCount() {
  const db = new Database(server.dbPath, { readonly: true });
  try {
    return db.prepare('SELECT count(*) AS n FROM recurring_rules WHERE is_active = 1').get().n;
  } finally {
    db.close();
  }
}

test('분류 삭제 미리보기는 활성 규칙과 거래를 센다', async () => {
  const res = await call('GET', `/categories/${cat}/delete-preview`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.active_rules, 2);
  assert.strictEqual(res.body.transactions, 1);
});

test('결제수단 삭제 미리보기도 같다', async () => {
  const res = await call('GET', `/payment-methods/${pm}/delete-preview`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.active_rules, 2);
  assert.strictEqual(res.body.transactions, 1);
});

test('결제수단만 끄면 규칙은 그대로다', async () => {
  const res = await call('DELETE', `/payment-methods/${pm}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.stopped_rules, 0);
  assert.strictEqual(activeRuleCount(), 2);
});

test('규칙도 끄기를 고르면 그 분류의 활성 규칙을 끈다', async () => {
  const res = await call('DELETE', `/categories/${cat}?stopRules=1`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.stopped_rules, 2);
  assert.strictEqual(activeRuleCount(), 0);
});

test('꺼진 분류로 새 거래를 만들면 400', async () => {
  const res = await call('POST', '/transactions', { date: '2026-10-02', category_id: cat, amount: 1000 });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.error, CAT_ERR);
});

test('꺼진 결제수단으로 새 거래를 만들면 400', async () => {
  const res = await call('POST', '/transactions', { date: '2026-10-02', category_id: liveCat, payment_method_id: pm, amount: 1000 });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.error, PM_ERR);
});

test('옛 거래를 그대로 고치는 건 된다', async () => {
  const res = await call('PUT', `/transactions/${txId}`, { date: '2026-10-01', category_id: cat, payment_method_id: pm, amount: 2000 });
  assert.strictEqual(res.status, 200);
});

test('꺼진 분류로 새 규칙을 만들면 400', async () => {
  const res = await call('POST', '/recurring-rules', { category_id: cat, merchant: '새규칙', amount: 1000, day_of_month: 1, freq: 'monthly' });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.error, CAT_ERR);
});

// 분류 쪽 「분류만 끄기」 경로(변이: stopRules 없이도 규칙을 끄는 것)가 결제수단 테스트만으로는
// 안 잡혀 보탰다. 다른 분류와 그 분류의 활성 규칙 하나로 따로 본다.
test('분류만 끄면 그 분류의 규칙은 그대로 켜져 있다', async () => {
  const db = new Database(server.dbPath);
  let otherCat;
  let ruleId;
  try {
    otherCat = db.prepare("INSERT INTO categories (major_type, name) VALUES ('선택지출', '다른분류')").run().lastInsertRowid;
    ruleId = db.prepare("INSERT INTO recurring_rules (category_id, merchant, amount, day_of_month, freq, interval, starts_on, is_active) VALUES (?, '다른규칙', 1000, 1, 'monthly', 1, '2026-01-01', 1)").run(otherCat).lastInsertRowid;
  } finally {
    db.close();
  }
  const res = await call('DELETE', `/categories/${otherCat}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.stopped_rules, 0);
  const check = new Database(server.dbPath, { readonly: true });
  try {
    assert.strictEqual(check.prepare('SELECT is_active FROM recurring_rules WHERE id = ?').get(ruleId).is_active, 1);
  } finally {
    check.close();
  }
});
