'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

// 019 마이그레이션 검증(#274).
//
// 라우트 테스트는 019 가 이미 돈 뒤의 세계만 본다. **마이그레이션이 기존 행에
// 무슨 짓을 하는지는 그 층에서 안 보인다.** 016 이 만든 card_products 행이
// 그대로 남는지, 감사 트리거가 새 표까지 덮는지를 여기서 고정한다.

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const { rebuildAuditTriggers } = require('../migrations/017-audit-triggers');

// 019 가 기대는 것만 명시적으로 올린다. 마이그레이션 전체를 도는 대신 이렇게 두면
// **019 가 무엇에 의존하는지가 테스트에 적혀 있다** — 나중에 다른 마이그레이션이
// 끼어들어도 이 파일이 조용히 다른 것을 검증하지 않는다.
//
// 기본 표(payment_methods·categories·transactions)는 src/db/init.js 가 만든다.
// 그것을 require 하면 실거래 DB 를 연다. 필요한 최소 형태만 여기서 세운다.
function baseSchema(db) {
  db.exec(`
    CREATE TABLE payment_methods (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
      is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY, major_type TEXT NOT NULL, name TEXT NOT NULL,
      monthly_budget INTEGER, is_active INTEGER DEFAULT 1
    );
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY, date TEXT NOT NULL, amount INTEGER NOT NULL,
      merchant TEXT, memo TEXT,
      category_id INTEGER REFERENCES categories(id),
      payment_method_id INTEGER REFERENCES payment_methods(id)
    );
  `);
}

const DEPENDS_ON = ['010-add-audit-log.js', '016-payment-method-taxonomy.js', '017-audit-triggers.js'];
const SUBJECT = '019-card-benefits.js';

function up(db, file) {
  require(path.join(MIGRATIONS_DIR, file)).up(db);
}

// 019 직전까지 세운 DB.
function beforeSubject() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  baseSchema(db);
  for (const f of DEPENDS_ON) up(db, f);
  return db;
}

// 019 까지 적용한 DB.
//
// 마지막에 트리거를 재생성하는 것이 **러너가 하는 일**이다(#346). 019 가 직접
// 부르던 것을 runMigrations 로 옮겼으므로, 이 파일도 그 마지막 단계를 재현해야
// 프로덕션과 같은 상태가 된다. 마이그레이션 체인 전체를 도는 대신 이렇게 두는
// 이유는 그대로다 — 019 가 무엇에 의존하는지가 테스트에 적혀 있어야 한다.
function afterSubject() {
  const db = beforeSubject();
  up(db, SUBJECT);
  rebuildAuditTriggers(db);
  return db;
}

// 019 가 실제 파일 목록에 있는지 확인한다. 번호가 바뀌면 위 상수가 조용히 낡는다.
function migrationExists(file) {
  return fs.readdirSync(MIGRATIONS_DIR).includes(file);
}

function cols(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

describe('A. 새로 생기는 것', () => {
  test('A-0. 이 파일이 가리키는 마이그레이션이 실제로 있다', () => {
    // 번호 충돌로 019 를 옮기면 위 상수가 조용히 낡는다. 그러면 이 파일 전체가
    // 아무것도 검증하지 않으면서 통과한다.
    for (const f of [...DEPENDS_ON, SUBJECT]) {
      assert.ok(migrationExists(f), `${f} 가 migrations/ 에 없다`);
    }
  });

  test('A-1. card_products 에 청구 주기 컬럼이 붙는다', () => {
    const db = afterSubject();
    const c = cols(db, 'card_products');
    for (const name of ['prev_month_threshold', 'billing_cycle_day', 'statement_close_day']) {
      assert.ok(c.includes(name), `${name} 가 없다`);
    }
    db.close();
  });

  test('A-2. card_benefits 표가 생긴다', () => {
    const db = afterSubject();
    const c = cols(db, 'card_benefits');
    for (const name of ['card_product_id', 'category_id', 'merchant_pattern',
      'benefit_type', 'rate', 'monthly_cap', 'min_amount']) {
      assert.ok(c.includes(name), `${name} 가 없다`);
    }
    db.close();
  });

  test('A-3. 두 번 돌려도 깨지지 않는다', () => {
    // 마이그레이션은 기동마다 돈다. 두 번째 실행이 던지면 앱이 안 뜬다.
    const db = afterSubject();
    assert.doesNotThrow(() => up(db, SUBJECT));
    db.close();
  });
});

describe('B. 기존 데이터', () => {
  test('B-1. 016 이 만든 카드 행이 그대로 남는다', () => {
    // 컬럼을 더하는 마이그레이션이 행을 건드리면 안 된다.
    const db = beforeSubject();

    const pm = db.prepare(`INSERT INTO payment_methods (name, type) VALUES ('하나카드', '신용')`).run();
    db.prepare(`
      INSERT INTO card_products (payment_method_id, issuer, product_name, card_type, annual_fee)
      VALUES (?, '하나카드', '트래블로그', '신용', 0)
    `).run(pm.lastInsertRowid);

    up(db, SUBJECT);

    const row = db.prepare('SELECT * FROM card_products').get();
    assert.equal(row.product_name, '트래블로그');
    assert.equal(row.issuer, '하나카드');
    // 새 컬럼은 비어 있어야 한다. 모르는 값을 채우면 계산이 틀린 답을 낸다.
    assert.equal(row.billing_cycle_day, null);
    assert.equal(row.statement_close_day, null);
    assert.equal(row.prev_month_threshold, null);
    db.close();
  });

  test('B-2. 기존 payment_methods 행 수가 안 바뀐다', () => {
    const db = beforeSubject();
    db.prepare(`INSERT INTO payment_methods (name, type) VALUES ('삼성카드', '신용')`).run();
    const before = db.prepare('SELECT COUNT(*) AS n FROM payment_methods').get().n;

    up(db, SUBJECT);

    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM payment_methods').get().n, before);
    db.close();
  });
});

describe('C. 딸린 관계', () => {
  test('C-1. 카드를 지우면 그 혜택도 같이 사라진다', () => {
    // 혜택만 남으면 어느 카드 것인지 알 수 없는 행이 된다.
    const db = afterSubject();

    const pm = db.prepare(`INSERT INTO payment_methods (name, type) VALUES ('현대카드', '신용')`).run();
    const cp = db.prepare(`
      INSERT INTO card_products (payment_method_id, issuer, product_name, card_type)
      VALUES (?, '현대카드', 'M', '신용')
    `).run(pm.lastInsertRowid);
    db.prepare(`
      INSERT INTO card_benefits (card_product_id, benefit_type, rate) VALUES (?, '할인', 5)
    `).run(cp.lastInsertRowid);

    db.prepare('DELETE FROM card_products WHERE id=?').run(cp.lastInsertRowid);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM card_benefits').get().n, 0);
    db.close();
  });

  test('C-2. 없는 카드로는 혜택을 만들 수 없다', () => {
    const db = afterSubject();
    assert.throws(() => {
      db.prepare(`INSERT INTO card_benefits (card_product_id, benefit_type, rate) VALUES (99999, '할인', 5)`).run();
    }, /FOREIGN KEY/);
    db.close();
  });
});

describe('D. 감사 캡처', () => {
  test('D-1. card_benefits 에도 트리거가 붙는다', () => {
    // 새 표는 017 이 만들 때 없었으므로 저절로 안 붙는다. 체인을 다 적용한 뒤
    // 러너가 재생성해야 덮인다(#346).
    const db = afterSubject();
    const names = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'audit_card_benefits_%'`
    ).all().map((r) => r.name);
    assert.deepEqual(names.sort(), ['audit_card_benefits_del', 'audit_card_benefits_ins', 'audit_card_benefits_upd']);
    db.close();
  });

  test('D-2. 혜택을 넣으면 감사 로그에 남는다', () => {
    const db = afterSubject();

    const pm = db.prepare(`INSERT INTO payment_methods (name, type) VALUES ('롯데카드', '신용')`).run();
    const cp = db.prepare(`
      INSERT INTO card_products (payment_method_id, issuer, product_name, card_type)
      VALUES (?, '롯데카드', '로카', '신용')
    `).run(pm.lastInsertRowid);
    db.prepare(`INSERT INTO card_benefits (card_product_id, benefit_type, rate) VALUES (?, '적립', 1.5)`)
      .run(cp.lastInsertRowid);

    const n = db.prepare(
      `SELECT COUNT(*) AS n FROM audit_log WHERE table_name='card_benefits' AND op='INSERT'`
    ).get().n;
    assert.equal(n, 1);
    db.close();
  });
});
