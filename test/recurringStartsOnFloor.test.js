'use strict';

// #679 — 반복규칙 시작일은 오늘 기준 10년 전까지만 받는다(오타 1916 → 거래 1,202건 방지).
// 수정에서는 시작일이 바뀔 때만 본다. 하한은 오늘에 따라 움직이므로 테스트도 오늘로 계산한다.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const { startTestServer } = require('./helpers/testServer');
const { localToday } = require('../src/services/recurringCatchup');

const PORT = 21679;
const BASE = `http://127.0.0.1:${PORT}/api/recurring-rules`;
let server;
let cat;

const TODAY = localToday();
const FLOOR = `${Number(TODAY.slice(0, 4)) - 10}${TODAY.slice(4) === '-02-29' ? '-02-28' : TODAY.slice(4)}`;
const DAY_BEFORE = (() => {
  const d = new Date(`${FLOOR}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();
const FLOOR_ERROR = `starts_on must not be earlier than ${FLOOR} (10 years ago)`;

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

const rule = (o) => ({ category_id: cat, merchant: '규칙', amount: 1000, day_of_month: 1, freq: 'monthly', ...o });

before(async () => {
  server = await startTestServer({ port: PORT });
  const cats = await (await fetch(`http://127.0.0.1:${PORT}/api/categories`)).json();
  cat = (Array.isArray(cats) ? cats : cats.data)[0].id;
});

after(() => { if (server) server.stop(); });

function insertOldRule() {
  const db = new Database(server.dbPath);
  try {
    return db.prepare("INSERT INTO recurring_rules (category_id, merchant, amount, day_of_month, freq, interval, starts_on, is_active) VALUES (?, '오래된규칙', 1000, 1, 'monthly', 1, '2001-01-01', 0)").run(cat).lastInsertRowid;
  } finally {
    db.close();
  }
}

test('오타로 친 아주 먼 과거는 400', async () => {
  const res = await req('POST', '/', rule({ starts_on: '1916-01-01' }));
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.error, FLOOR_ERROR);
});

test('하한 날짜 당일은 받는다', async () => {
  const res = await req('POST', '/', rule({ starts_on: FLOOR }));
  assert.strictEqual(res.status, 201);
});

test('하한 하루 전은 400', async () => {
  const res = await req('POST', '/', rule({ starts_on: DAY_BEFORE }));
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.error, FLOOR_ERROR);
});

test('오늘 시작은 받는다', async () => {
  const res = await req('POST', '/', rule({ starts_on: TODAY }));
  assert.strictEqual(res.status, 201);
});

test('기존 시작일을 그대로 두고 고치면 오래된 규칙도 저장된다', async () => {
  const id = insertOldRule();
  const res = await req('PUT', '/' + id, rule({ amount: 2000, starts_on: '2001-01-01' }));
  assert.strictEqual(res.status, 200);
});

test('수정에서 시작일을 먼 과거로 바꾸면 400', async () => {
  const id = insertOldRule();
  const res = await req('PUT', '/' + id, rule({ starts_on: '1916-01-01' }));
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.error, FLOOR_ERROR);
});
