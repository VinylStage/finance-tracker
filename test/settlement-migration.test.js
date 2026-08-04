'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const { SETTLEMENTS, DEFAULT_SETTLEMENT } = require('../src/constants');

// 021 마이그레이션 검증(#289).
//
// 라우트 테스트는 021 이 이미 돈 뒤의 세계만 본다. **마이그레이션이 기존 행에
// 무슨 짓을 하는지는 그 층에서 안 보인다.** 사용자는 이미 신용카드 결제를 구분
// 없이 기록해 왔고, 여기서 값이 바뀌면 과거 잔액이 통째로 달라진다.
//
// 이 저장소는 실거래 2,212건 유실 사고를 겪었다. "기존 거래를 안 건드린다" 는
// 설계 의도가 아니라 검증 대상이다.

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const SUBJECT = '021-add-settlement.js';

// 021 이 기대는 것만 올린다. 체인 전체를 도는 대신 이렇게 두면 021 이 무엇에
// 의존하는지가 테스트에 적혀 있다(cardBenefitsMigration.test.js 와 같은 방식).
const DEPENDS_ON = ['018-add-accounts.js'];

function up(db, file) {
  require(path.join(MIGRATIONS_DIR, file)).up(db);
}

function baseSchema(db) {
  db.exec(`
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY, major_type TEXT NOT NULL, name TEXT NOT NULL,
      monthly_budget INTEGER, is_active INTEGER DEFAULT 1
    );
    CREATE TABLE payment_methods (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
      is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY, date TEXT NOT NULL, amount INTEGER NOT NULL,
      merchant TEXT, memo TEXT,
      category_id INTEGER REFERENCES categories(id),
      payment_method_id INTEGER REFERENCES payment_methods(id)
    );
  `);
}

// 021 직전까지 세운 DB + 기존 거래 3건.
function beforeSubject() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  baseSchema(db);
  for (const f of DEPENDS_ON) up(db, f);

  db.prepare(`INSERT INTO categories (id, major_type, name) VALUES (1, '변동필수', '식비')`).run();
  db.prepare(`INSERT INTO payment_methods (id, name, type) VALUES (1, '하나카드', '신용')`).run();
  const ins = db.prepare(`INSERT INTO transactions (date, amount, merchant, category_id, payment_method_id) VALUES (?,?,?,1,1)`);
  ins.run('2026-03-01', 10000, '가');
  ins.run('2026-03-02', 20000, '나');
  ins.run('2026-03-03', 30000, '다');
  return db;
}

function afterSubject() {
  const db = beforeSubject();
  up(db, SUBJECT);
  return db;
}

const cols = (db) => db.prepare('PRAGMA table_info(transactions)').all().map((c) => c.name);
const indexes = (db) => db.prepare(
  "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='transactions'"
).all().map((r) => r.name);

describe('A. 이 파일이 가리키는 마이그레이션이 실제로 있다', () => {
  test('A-0. 번호가 바뀌면 이 테스트가 먼저 깨진다', () => {
    assert.ok(fs.readdirSync(MIGRATIONS_DIR).includes(SUBJECT), `${SUBJECT} 가 없다`);
  });
});

describe('B. 새로 생기는 것', () => {
  test('B-1. 컬럼 셋이 생긴다', () => {
    const db = afterSubject();
    const c = cols(db);
    for (const name of ['settlement', 'account_id', 'billing_month']) {
      assert.ok(c.includes(name), `${name} 컬럼이 없다`);
    }
    db.close();
  });

  test('B-2. 인덱스 셋이 생긴다', () => {
    const db = afterSubject();
    const idx = indexes(db);
    for (const name of ['idx_tx_settlement_date', 'idx_tx_billing_month', 'idx_tx_account']) {
      assert.ok(idx.includes(name), `${name} 인덱스가 없다`);
    }
    db.close();
  });

  test('B-3. account_id 가 accounts 를 참조한다', () => {
    const db = afterSubject();
    const fks = db.prepare('PRAGMA foreign_key_list(transactions)').all();
    assert.ok(fks.some((f) => f.from === 'account_id' && f.table === 'accounts'), 'FK 가 없다');
    db.close();
  });

  test('B-4. 없는 계좌를 가리키면 거부된다', () => {
    const db = afterSubject();
    assert.throws(() => {
      db.prepare(`UPDATE transactions SET account_id = 99999 WHERE id = 1`).run();
    }, /FOREIGN KEY/);
    db.close();
  });
});

describe('C. 기존 거래를 건드리지 않는다 — 이 마이그레이션의 핵심', () => {
  test('C-1. 기존 3건이 전부 immediate 로 남는다', () => {
    const db = afterSubject();
    const rows = db.prepare('SELECT id, settlement FROM transactions ORDER BY id').all();
    assert.equal(rows.length, 3);
    for (const r of rows) {
      assert.equal(r.settlement, 'immediate', `id=${r.id} 가 immediate 가 아니다`);
    }
    db.close();
  });

  test('C-2. 기존 컬럼 값이 하나도 바뀌지 않는다', () => {
    const before = beforeSubject();
    const snapshot = before.prepare(
      'SELECT id, date, amount, merchant, memo, category_id, payment_method_id FROM transactions ORDER BY id'
    ).all();
    up(before, SUBJECT);
    const after = before.prepare(
      'SELECT id, date, amount, merchant, memo, category_id, payment_method_id FROM transactions ORDER BY id'
    ).all();

    assert.deepEqual(after, snapshot, '마이그레이션이 기존 값을 바꿨다');
    before.close();
  });

  test('C-3. account_id 와 billing_month 는 비어 있다 — 백필하지 않는다', () => {
    const db = afterSubject();
    const n = db.prepare(
      'SELECT COUNT(*) AS n FROM transactions WHERE account_id IS NOT NULL OR billing_month IS NOT NULL'
    ).get().n;
    assert.equal(n, 0, '백필이 일어났다');
    db.close();
  });
});

describe('D. 다시 돌려도 안전하다', () => {
  test('D-1. 두 번 적용해도 깨지지 않고 값도 그대로다', () => {
    const db = afterSubject();
    db.prepare(`UPDATE transactions SET settlement='deferred', billing_month='2026-04' WHERE id=1`).run();

    up(db, SUBJECT); // 재적용

    const row = db.prepare('SELECT settlement, billing_month FROM transactions WHERE id=1').get();
    assert.equal(row.settlement, 'deferred', '재적용이 값을 되돌렸다');
    assert.equal(row.billing_month, '2026-04');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM transactions').get().n, 3);
    db.close();
  });
});

describe('E. 허용값 정본', () => {
  test('E-1. 세 값이고 기본값은 immediate 다', () => {
    assert.deepEqual(SETTLEMENTS, ['immediate', 'deferred', 'settlement']);
    assert.equal(DEFAULT_SETTLEMENT, 'immediate');
    assert.ok(SETTLEMENTS.includes(DEFAULT_SETTLEMENT));
  });

  test('E-2. DB 컬럼 기본값이 정본과 같다', () => {
    // 마이그레이션의 DEFAULT 와 constants.js 가 갈라지면, 컬럼을 안 채운 경로가
    // 정본에 없는 값으로 들어간다.
    const db = afterSubject();
    const col = db.prepare('PRAGMA table_info(transactions)').all().find((c) => c.name === 'settlement');
    assert.equal(col.dflt_value, `'${DEFAULT_SETTLEMENT}'`);
    assert.equal(col.notnull, 1, 'settlement 은 NOT NULL 이어야 한다');
    db.close();
  });
});
