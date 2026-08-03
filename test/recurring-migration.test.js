'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const base = require('../migrations/004-add-recurring-rules');
const migration = require('../migrations/012-recurring-freq-and-occurrences');

let dir, db;

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-recur-'));
  db = new Database(path.join(dir, 'test.db'));
  // 004 가 참조하는 최소 스키마만 세운다.
  db.exec(`
    CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE payment_methods (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE transactions (id INTEGER PRIMARY KEY, date TEXT);
    INSERT INTO categories (id, name) VALUES (1, '고정지출');
  `);
  base.up(db);

  // 이관 대상: 말일 규칙 하나와 평범한 규칙 하나.
  db.prepare(`INSERT INTO recurring_rules (id, category_id, merchant, amount, day_of_month)
              VALUES (1, 1, '월세', 500000, 31)`).run();
  db.prepare(`INSERT INTO recurring_rules (id, category_id, merchant, amount, day_of_month)
              VALUES (2, 1, '넷플릭스', 17000, 15)`).run();

  db.prepare(`INSERT INTO recurring_rule_months (rule_id, year_month, status, transaction_id, created_at)
              VALUES (1, '2026-01', 'created', NULL, '2026-01-31 00:00:00')`).run();
  db.prepare(`INSERT INTO recurring_rule_months (rule_id, year_month, status, transaction_id, created_at)
              VALUES (1, '2026-02', 'created', NULL, '2026-02-28 00:00:00')`).run();
  db.prepare(`INSERT INTO recurring_rule_months (rule_id, year_month, status, transaction_id, created_at)
              VALUES (2, '2026-02', 'skipped', NULL, '2026-02-15 00:00:00')`).run();
});

after(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const cols = () => db.prepare('PRAGMA table_info(recurring_rules)').all().map((c) => c.name);

describe('A. 컬럼 확장', () => {
  test('A-1. 적용 전에는 freq 가 없다', () => {
    assert.ok(!cols().includes('freq'));
  });

  test('A-2. 적용하면 주기·기간 컬럼이 생긴다', () => {
    migration.up(db);
    for (const c of ['freq', 'interval', 'starts_on', 'ends_on', 'month_of_year', 'last_run_on']) {
      assert.ok(cols().includes(c), `${c} 없음`);
    }
  });

  test('A-3. 기존 규칙은 monthly/1 로 남는다 — 동작이 바뀌지 않는다', () => {
    const rows = db.prepare('SELECT id, freq, interval, day_of_month FROM recurring_rules ORDER BY id').all();
    for (const r of rows) {
      assert.equal(r.freq, 'monthly');
      assert.equal(r.interval, 1);
    }
    assert.equal(rows.find((r) => r.id === 1).day_of_month, 31);
  });

  test('A-4. 두 번 실행해도 안전하다', () => {
    migration.up(db);
    assert.ok(cols().includes('freq'));
  });
});

describe('B. recurring_occurrences 이관', () => {
  test('B-1. 테이블과 유니크 제약이 생긴다', () => {
    const t = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='recurring_occurrences'").get();
    assert.ok(t);
    assert.match(t.sql, /UNIQUE\s*\(\s*rule_id\s*,\s*occurred_on\s*\)/i);
  });

  test('B-2. 기존 월 기록이 발생일로 옮겨진다', () => {
    const rows = db.prepare('SELECT rule_id, occurred_on, status FROM recurring_occurrences ORDER BY rule_id, occurred_on').all();
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0], { rule_id: 1, occurred_on: '2026-01-31', status: 'created' });
    assert.deepEqual(rows[2], { rule_id: 2, occurred_on: '2026-02-15', status: 'skipped' });
  });

  test('B-3. 말일 규칙의 2월은 28일로 이관된다 — 이관 전후 발생일이 같다', () => {
    // day_of_month=31 인 규칙의 2026-02 기록. 31일은 존재하지 않으므로 말일이다.
    const r = db.prepare("SELECT occurred_on FROM recurring_occurrences WHERE rule_id=1 AND occurred_on LIKE '2026-02%'").get();
    assert.equal(r.occurred_on, '2026-02-28');
  });

  test('B-4. status 와 created_at 이 보존된다', () => {
    const r = db.prepare("SELECT status, created_at FROM recurring_occurrences WHERE rule_id=2").get();
    assert.equal(r.status, 'skipped');
    assert.equal(r.created_at, '2026-02-15 00:00:00');
  });

  test('B-5. 재실행해도 중복 이관되지 않는다', () => {
    migration.up(db);
    const n = db.prepare('SELECT COUNT(*) c FROM recurring_occurrences').get().c;
    assert.equal(n, 3);
  });

  test('B-6. 같은 rule_id·occurred_on 은 DB 가 거부한다 — 멱등성 근거', () => {
    // catch-up(#279)이 같은 날짜를 두 번 만들려 할 때 로직이 아니라 제약이 막는다.
    assert.throws(() => {
      db.prepare(`INSERT INTO recurring_occurrences (rule_id, occurred_on, status) VALUES (1, '2026-01-31', 'created')`).run();
    }, /UNIQUE/i);
  });

  test('B-7. 기존 recurring_rule_months 는 남아 있다 — 롤백 여지', () => {
    const n = db.prepare('SELECT COUNT(*) c FROM recurring_rule_months').get().c;
    assert.equal(n, 3);
  });
});
