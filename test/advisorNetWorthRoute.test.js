'use strict';

// /api/advisor/projection 의 netWorth(#770). 임시 DB(실DB 미접촉).

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const { startTestServer } = require('./helpers/testServer');

const PORT = 21770;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

const get = async (q) => (await fetch(`${BASE}/api/advisor/projection?asOf=2026-10-13&${q}`)).json();

function seedNetWorth() {
  const db = new Database(server.dbPath);
  try {
    db.prepare("INSERT INTO debts (name, balance, annual_rate) VALUES ('전세대출', 99100000, 2.2)").run();
    db.prepare("INSERT INTO savings_products (name, monthly_contribution, start_date, status) VALUES ('적금A', 500000, '2026-10-01', '진행중')").run();
    db.prepare("INSERT INTO savings_products (name, monthly_contribution, start_date, status) VALUES ('해지B', 300000, '2026-01-01', '해지')").run();
  } finally {
    db.close();
  }
}

before(async () => {
  server = await startTestServer({ port: PORT });
  await fetch(`${BASE}/api/advisor/anchor`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ as_of_date: '2026-10-13', amount: 600000 }) });
});

after(() => { if (server) server.stop(); });

test('부채·적금이 없으면 순자산은 현금잔액과 같다', async () => {
  const j = await get('horizon=3');
  assert.strictEqual(j.netWorth.timeline.length, 3);
  for (let i = 0; i < 3; i++) {
    assert.strictEqual(j.netWorth.timeline[i].savings, 0);
    assert.strictEqual(j.netWorth.timeline[i].debt, 0);
    assert.strictEqual(j.netWorth.timeline[i].netWorth, j.base.timeline[i].balance);
    assert.strictEqual(j.netWorth.timeline[i].cash, j.base.timeline[i].balance);
  }
});

test('적금 누적과 부채가 월별로 실린다(해지 상품 제외)', async () => {
  seedNetWorth();
  const j = await get('horizon=3');
  assert.deepStrictEqual(j.netWorth.timeline, [
    { month: '2026-10', cash: 600000, savings: 500000, debt: 99100000, netWorth: -98000000 },
    { month: '2026-11', cash: 600000, savings: 1000000, debt: 99100000, netWorth: -97500000 },
    { month: '2026-12', cash: 600000, savings: 1500000, debt: 99100000, netWorth: -97000000 },
  ]);
});

test('현금흐름 전망(base)은 순자산 데이터와 무관하다', async () => {
  const j = await get('horizon=3');
  assert.deepStrictEqual(j.base.timeline.map((t) => t.balance), [600000, 600000, 600000]);
});

test('추가 지출 시나리오가 있어도 순자산은 base 기준이다', async () => {
  const j = await get('horizon=3&simAmount=300000&simMonths=3&simStart=2026-11');
  assert.notStrictEqual(j.withSim, null);
  for (let i = 0; i < 3; i++) {
    assert.strictEqual(j.netWorth.timeline[i].cash, j.base.timeline[i].balance);
  }
  assert.notStrictEqual(j.withSim.timeline[1].balance, 600000);
});

test('기간을 늘리면 순자산 행도 같은 달로 늘어난다', async () => {
  const j = await get('horizon=5');
  assert.deepStrictEqual(j.netWorth.timeline.map((r) => r.month), j.base.timeline.map((t) => t.month));
  assert.strictEqual(j.netWorth.timeline.length, 5);
  assert.strictEqual(j.netWorth.timeline[4].savings, 2500000);
});
