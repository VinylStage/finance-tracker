'use strict';
const { test, describe, beforeEach, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const base = require('../migrations/004-add-recurring-rules');
const ext = require('../migrations/013-recurring-freq-and-occurrences');
const { runCatchup, windowFor } = require('../src/services/recurringCatchup');

// 이 기능에서 가장 중요한 성질은 멱등성이다. 같은 서버를 두 번 켜도 거래가
// 늘어나면 안 된다 — 사용자가 알아채기까지 시간이 걸리는 종류의 오염이다.

let dir, db;

function freshDb() {
  if (db) db.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-catchup-'));
  db = new Database(path.join(dir, 'test.db'));
  db.exec(`
    CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE payment_methods (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY, date TEXT NOT NULL, category_id INTEGER,
      amount INTEGER, payment_method_id INTEGER, payment_style TEXT,
      merchant TEXT, memo TEXT,
      origin TEXT NOT NULL DEFAULT 'manual', origin_ref_table TEXT, origin_ref_id INTEGER
    );
    INSERT INTO categories (id, name) VALUES (1, '고정지출');
    INSERT INTO payment_methods (id, name) VALUES (1, '하나카드');
  `);
  base.up(db);
  ext.up(db);
  return db;
}

function addRule(over = {}) {
  const r = {
    category_id: 1, merchant: '월세', amount: 500000, day_of_month: 15,
    payment_method_id: 1, payment_style: '일시불', memo: null, is_active: 1,
    freq: 'monthly', interval: 1, starts_on: '2026-01-15', ends_on: null,
    month_of_year: null, last_run_on: null, ...over,
  };
  const info = db.prepare(`
    INSERT INTO recurring_rules
      (category_id, merchant, amount, day_of_month, payment_method_id, payment_style, memo,
       is_active, freq, interval, starts_on, ends_on, month_of_year, last_run_on)
    VALUES (@category_id, @merchant, @amount, @day_of_month, @payment_method_id, @payment_style, @memo,
            @is_active, @freq, @interval, @starts_on, @ends_on, @month_of_year, @last_run_on)
  `).run(r);
  return info.lastInsertRowid;
}

const txCount = () => db.prepare('SELECT COUNT(*) c FROM transactions').get().c;
const occCount = () => db.prepare('SELECT COUNT(*) c FROM recurring_occurrences').get().c;

beforeEach(() => { freshDb(); });
after(() => { if (db) db.close(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

describe('A. 멱등성 — 최우선', () => {
  test('A-1. 같은 날 두 번 실행해도 거래가 늘지 않는다', () => {
    addRule();
    const first = runCatchup(db, { today: '2026-04-30' });
    const before = txCount();
    const second = runCatchup(db, { today: '2026-04-30' });

    assert.equal(first.created, 4); // 1·2·3·4월 15일
    assert.equal(second.created, 0);
    assert.equal(txCount(), before);
  });

  test('A-1b. last_run_on 이 날아가도 중복이 생기지 않는다 — UNIQUE 가 막는다', () => {
    // 두 번째 실행에서 구간이 좁아져 재시도가 없는 것은 효율일 뿐 안전장치가
    // 아니다. 기준점을 잃어 같은 구간을 통째로 다시 훑어도 중복이 없어야 한다.
    const id = addRule();
    const first = runCatchup(db, { today: '2026-04-30' });
    assert.equal(first.created, 4);

    db.prepare('UPDATE recurring_rules SET last_run_on = NULL WHERE id = ?').run(id);
    const again = runCatchup(db, { today: '2026-04-30' });

    assert.equal(again.created, 0);
    assert.equal(again.skipped, 4); // 네 건 모두 DB 가 걸러냈다
    assert.equal(txCount(), 4);
    assert.equal(occCount(), 4);
  });

  test('A-2. 중복 삽입은 DB 제약이 막는다 — 로직이 아니라', () => {
    const id = addRule();
    runCatchup(db, { today: '2026-02-28' });
    assert.throws(() => {
      db.prepare(`INSERT INTO recurring_occurrences (rule_id, occurred_on, status) VALUES (?, '2026-01-15', 'created')`).run(id);
    }, /UNIQUE/i);
  });

  test('A-3. 건너뛴 건수를 요약에 남긴다', () => {
    // 건너뜀은 구간이 겹칠 때 생긴다. last_run_on 이 그대로면 다음 실행이
    // 같은 구간을 다시 훑고, 그때 DB 가 걸러낸 수가 skipped 로 잡혀야 한다.
    const id = addRule();
    runCatchup(db, { today: '2026-03-31' });
    db.prepare("UPDATE recurring_rules SET last_run_on = '2026-01-01' WHERE id = ?").run(id);

    const again = runCatchup(db, { today: '2026-03-31' });
    assert.equal(again.created, 0);
    assert.equal(again.skipped, 3);
  });
});

describe('B. 공백 메우기', () => {
  test('B-1. 한 달 공백을 소급 생성한다', () => {
    addRule({ last_run_on: '2026-03-15' });
    const r = runCatchup(db, { today: '2026-04-20' });
    assert.equal(r.created, 2); // 3/15(이미 처리 안 됨)·4/15 — last_run_on 당일 포함
    const dates = db.prepare('SELECT occurred_on FROM recurring_occurrences ORDER BY occurred_on').all().map((x) => x.occurred_on);
    assert.deepEqual(dates, ['2026-03-15', '2026-04-15']);
  });

  test('B-2. 1년 공백도 상한 없이 전부 생성한다', () => {
    addRule({ starts_on: '2025-05-15' });
    const r = runCatchup(db, { today: '2026-05-14' });
    assert.equal(r.created, 12); // 2025-05 ~ 2026-04
    assert.equal(txCount(), 12);
  });

  test('B-3. 일 반복의 긴 공백', () => {
    addRule({ freq: 'daily', interval: 1, starts_on: '2026-01-01' });
    const r = runCatchup(db, { today: '2026-01-31' });
    assert.equal(r.created, 31);
  });
});

describe('C. 생성 대상 제한', () => {
  test('C-1. is_active=0 인 규칙은 생성하지 않는다', () => {
    addRule({ is_active: 0 });
    const r = runCatchup(db, { today: '2026-06-30' });
    assert.equal(r.created, 0);
    assert.equal(txCount(), 0);
  });

  test('C-2. ends_on 이 지난 규칙은 그 이후를 만들지 않는다', () => {
    addRule({ ends_on: '2026-03-15' });
    const r = runCatchup(db, { today: '2026-12-31' });
    assert.equal(r.created, 3); // 1·2·3월
    const last = db.prepare('SELECT MAX(occurred_on) m FROM recurring_occurrences').get().m;
    assert.equal(last, '2026-03-15');
  });

  test('C-3. 아직 시작 전인 규칙은 아무것도 만들지 않는다', () => {
    addRule({ starts_on: '2027-01-15' });
    const r = runCatchup(db, { today: '2026-06-30' });
    assert.equal(r.created, 0);
  });

  test('C-4. 규칙이 하나도 없으면 조용히 끝난다', () => {
    const r = runCatchup(db, { today: '2026-06-30' });
    assert.equal(r.created, 0);
    assert.equal(r.rules, 0);
  });
});

describe('D. 생성된 거래', () => {
  test('D-1. origin 이 recurring 이고 규칙을 참조한다', () => {
    const id = addRule();
    runCatchup(db, { today: '2026-02-28' });
    const tx = db.prepare('SELECT * FROM transactions ORDER BY id LIMIT 1').get();
    assert.equal(tx.origin, 'recurring');
    assert.equal(tx.origin_ref_table, 'recurring_rules');
    assert.equal(tx.origin_ref_id, id);
  });

  test('D-2. 규칙의 값이 그대로 옮겨진다', () => {
    addRule({ merchant: '넷플릭스', amount: 17000, payment_style: '일시불', memo: '구독' });
    runCatchup(db, { today: '2026-01-31' });
    const tx = db.prepare('SELECT * FROM transactions ORDER BY id LIMIT 1').get();
    assert.equal(tx.merchant, '넷플릭스');
    assert.equal(tx.amount, 17000);
    assert.equal(tx.memo, '구독');
    assert.equal(tx.date, '2026-01-15');
  });

  test('D-3. 발생 기록이 생성된 거래를 가리킨다', () => {
    addRule();
    runCatchup(db, { today: '2026-01-31' });
    const occ = db.prepare('SELECT * FROM recurring_occurrences').get();
    const tx = db.prepare('SELECT id FROM transactions').get();
    assert.equal(occ.transaction_id, tx.id);
    assert.equal(occ.status, 'created');
  });

  test('D-4. 말일 규칙이 2월에 당겨진 날짜로 생성된다', () => {
    addRule({ day_of_month: 31, starts_on: '2026-01-31' });
    runCatchup(db, { today: '2026-02-28' });
    const dates = db.prepare('SELECT date FROM transactions ORDER BY date').all().map((x) => x.date);
    assert.deepEqual(dates, ['2026-01-31', '2026-02-28']);
  });
});

describe('E. last_run_on', () => {
  test('E-1. 실행 후 오늘로 갱신된다', () => {
    const id = addRule();
    runCatchup(db, { today: '2026-05-20' });
    const r = db.prepare('SELECT last_run_on FROM recurring_rules WHERE id=?').get(id);
    assert.equal(r.last_run_on, '2026-05-20');
  });

  test('E-2. 만들 것이 없어도 갱신된다 — 다음 기동에서 같은 구간을 다시 훑지 않는다', () => {
    const id = addRule({ starts_on: '2027-01-15' });
    runCatchup(db, { today: '2026-05-20' });
    const r = db.prepare('SELECT last_run_on FROM recurring_rules WHERE id=?').get(id);
    assert.equal(r.last_run_on, '2026-05-20');
  });
});

describe('F. 트랜잭션 원자성', () => {
  test('F-1. 중간 실패 시 아무것도 남지 않는다', () => {
    addRule();
    // 거래 삽입이 실패하도록 NOT NULL 을 위반시키는 트리거를 건다.
    db.exec(`
      CREATE TRIGGER boom BEFORE INSERT ON transactions
      WHEN (SELECT COUNT(*) FROM transactions) >= 2
      BEGIN SELECT RAISE(ABORT, 'boom'); END;
    `);
    assert.throws(() => runCatchup(db, { today: '2026-06-30' }), /boom/);
    // 롤백됐으므로 거래도 발생기록도 없다.
    assert.equal(txCount(), 0);
    assert.equal(occCount(), 0);
  });
});

describe('G. 구간 계산', () => {
  test('G-1. last_run_on 이 있으면 그날부터 — 당일 발생을 놓치지 않는다', () => {
    const w = windowFor({ last_run_on: '2026-03-15', starts_on: '2026-01-01', ends_on: null }, '2026-04-01');
    assert.equal(w.from, '2026-03-15');
    assert.equal(w.to, '2026-04-01');
  });

  test('G-2. ends_on 이 오늘보다 이르면 거기서 끊는다', () => {
    const w = windowFor({ last_run_on: null, starts_on: '2026-01-01', ends_on: '2026-02-01' }, '2026-06-01');
    assert.equal(w.to, '2026-02-01');
  });

  test('G-3. last_run_on 이 없으면 starts_on 부터', () => {
    const w = windowFor({ last_run_on: null, starts_on: '2026-02-10', ends_on: null }, '2026-03-01');
    assert.equal(w.from, '2026-02-10');
  });
});
