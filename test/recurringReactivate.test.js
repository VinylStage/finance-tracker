'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 임시 DB 에 스키마를 올린 뒤 그 db 로 함수를 부른다. init.js 는 DB_PATH 를 읽으므로
// require 전에 환경변수를 세워야 한다.
function freshDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reactivate-'));
  const dbPath = path.join(dir, 'test.db');
  process.env.DB_PATH = dbPath;
  // 모듈 캐시를 비워야 매번 새 DB 로 열린다.
  for (const k of Object.keys(require.cache)) {
    if (k.includes('/src/db/init.js')) delete require.cache[k];
  }
  const db = require('../src/db/init.js');
  return db;
}

const {
  reactivationPreview, reactivateRule,
} = require('../src/services/recurringCatchup.js');

// 카테고리 하나와 규칙 하나를 넣는다. 규칙은 꺼진 상태(is_active = 0)로 시작한다.
function seedRule(db, { startsOn, lastRunOn, dayOfMonth = 10, amount = 30000 }) {
  const cat = db.prepare(
    "INSERT INTO categories (name, major_type) VALUES ('테스트', '지출')"
  ).run().lastInsertRowid;
  const id = db.prepare(`
    INSERT INTO recurring_rules
      (category_id, merchant, amount, day_of_month, payment_style, is_active,
       freq, interval, starts_on, last_run_on)
    VALUES (?, '테스트가맹점', ?, ?, '일시불', 0, 'monthly', 1, ?, ?)
  `).run(cat, amount, dayOfMonth, startsOn, lastRunOn).lastInsertRowid;
  return id;
}

function ruleRow(db, id) {
  return db.prepare('SELECT is_active, starts_on, last_run_on FROM recurring_rules WHERE id = ?').get(id);
}

// 이미 만들어진 발생일. 따라잡기가 마지막으로 실행된 날은 보통 여기 남아 있다.
function seedOccurrence(db, ruleId, date) {
  db.prepare(
    "INSERT INTO recurring_occurrences (rule_id, occurred_on, status) VALUES (?, ?, 'created')"
  ).run(ruleId, date);
}

// 화면에서 이미 처리한 달(생성·건너뛰기). 따라잡기가 이 달을 건드리지 않는다.
function seedHandledMonth(db, ruleId, ym) {
  db.prepare(
    "INSERT INTO recurring_rule_months (rule_id, year_month, status) VALUES (?, ?, 'skipped')"
  ).run(ruleId, ym);
}

test('프리뷰는 꺼져 있던 구간의 발생일을 센다', async () => {
  const db = freshDb();
  const id = seedRule(db, { startsOn: '2026-05-10', lastRunOn: '2026-05-10' });
  seedOccurrence(db, id, '2026-05-10');
  const result = reactivationPreview(db, id, { today: '2026-08-15' });
  
  assert.equal(result.count, 3);
  assert.deepEqual(result.dates, ['2026-06-10', '2026-07-10', '2026-08-10']);
  assert.equal(result.totalAmount, 90000);
  assert.equal(result.alreadyActive, false);
});

test('프리뷰는 DB 를 바꾸지 않는다', async () => {
  const db = freshDb();
  const id = seedRule(db, { startsOn: '2026-05-10', lastRunOn: '2026-05-10' });
  seedOccurrence(db, id, '2026-05-10');
  reactivationPreview(db, id, { today: '2026-08-15' });
  
  const row = ruleRow(db, id);
  assert.equal(row.is_active, 0);
  assert.equal(row.last_run_on, '2026-05-10');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM transactions').get().c, 0);
});

test('없는 규칙이면 null 이다', async () => {
  const db = freshDb();
  const result = reactivationPreview(db, 99999, { today: '2026-08-15' });
  
  assert.equal(result, null);
});

test('all 은 last_run_on 을 건드리지 않는다', async () => {
  const db = freshDb();
  const id = seedRule(db, { startsOn: '2026-05-10', lastRunOn: '2026-05-10' });
  const result = reactivateRule(db, id, { mode: 'all', today: '2026-08-15' });
  
  assert.equal(result.ok, true);
  const row = ruleRow(db, id);
  assert.equal(row.is_active, 1);
  assert.equal(row.last_run_on, '2026-05-10');
});

test('from-now 는 last_run_on 을 오늘로 민다', async () => {
  const db = freshDb();
  const id = seedRule(db, { startsOn: '2026-05-10', lastRunOn: '2026-05-10' });
  const result = reactivateRule(db, id, { mode: 'from-now', today: '2026-08-15' });
  
  assert.equal(result.ok, true);
  const row = ruleRow(db, id);
  assert.equal(row.is_active, 1);
  assert.equal(row.last_run_on, '2026-08-15');
  assert.equal(row.starts_on, '2026-05-10');
});

test('from-date 는 시작일과 마지막 실행일을 함께 옮긴다', async () => {
  const db = freshDb();
  const id = seedRule(db, { startsOn: '2026-05-10', lastRunOn: '2026-05-10' });
  const result = reactivateRule(db, id, { mode: 'from-date', startsOn: '2026-08-01', today: '2026-08-15' });
  
  assert.equal(result.ok, true);
  const row = ruleRow(db, id);
  assert.equal(row.is_active, 1);
  assert.equal(row.starts_on, '2026-08-01');
  assert.equal(row.last_run_on, '2026-08-01');
});

test('화면에서 이미 처리한 달은 빠진다', async () => {
  const db = freshDb();
  const id = seedRule(db, { startsOn: '2026-05-10', lastRunOn: '2026-05-10' });
  seedOccurrence(db, id, '2026-05-10');
  seedHandledMonth(db, id, '2026-07');
  const result = reactivationPreview(db, id, { today: '2026-08-15' });
  
  assert.equal(result.count, 2);
  assert.deepEqual(result.dates, ['2026-06-10', '2026-08-10']);
});

test('마지막 실행일의 발생이 없으면 그 날도 센다', async () => {
  const db = freshDb();
  const id = seedRule(db, { startsOn: '2026-05-10', lastRunOn: '2026-05-10' });
  // seedOccurrence 를 부르지 않는다
  const result = reactivationPreview(db, id, { today: '2026-08-15' });
  
  assert.equal(result.count, 4);
  assert.equal(result.dates[0], '2026-05-10');
});

test('모르는 방식과 형식이 어긋난 날짜는 거부한다', async () => {
  const db = freshDb();
  const id = seedRule(db, { startsOn: '2026-05-10', lastRunOn: '2026-05-10' });
  
  // 모른다
  let result = reactivateRule(db, id, { mode: '아무거나', today: '2026-08-15' });
  assert.equal(result.ok, false);
  const row = ruleRow(db, id);
  assert.equal(row.is_active, 0);
  
  // 형식이 어긋남
  result = reactivateRule(db, id, { mode: 'from-date', startsOn: '2026/08/01', today: '2026-08-15' });
  assert.equal(result.ok, false);
  assert.equal(row.is_active, 0);
});
