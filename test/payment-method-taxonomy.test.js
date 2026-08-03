'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let db;
let tmpdir;

before(() => {
  tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-pmt-'));
  const dbPath = path.join(tmpdir, 'test.db');
  db = new Database(dbPath);

  // payment_methods 테이블 생성 및 데이터 삽입
  db.exec(`
    CREATE TABLE payment_methods (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL
    );
    INSERT INTO payment_methods (id, name, type) VALUES (1, '카드', 'card');
  `);

  // transactions 테이블 생성 및 데이터 삽입
  db.exec(`
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY,
      date TEXT NOT NULL,
      amount INTEGER NOT NULL,
      payment_method_id INTEGER NOT NULL
    );
    INSERT INTO transactions (id, date, amount, payment_method_id) VALUES
      (100, '2026-01-01', 10000, 1),
      (101, '2026-01-02', 20000, 1);
  `);
});

after(() => {
  db.close();
  fs.rmSync(tmpdir, { recursive: true });
});

describe('A. 마이그레이션', () => {
  test('A-1. 적용 전에는 card_products 테이블이 없다', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='card_products'").all();
    assert.strictEqual(tables.length, 0);
  });

  test('A-2. 적용 전에는 transactions 에 card_product_id 가 없다', () => {
    const columns = db.prepare("PRAGMA table_info(transactions)").all();
    const hasCardProductId = columns.some(col => col.name === 'card_product_id');
    assert.strictEqual(hasCardProductId, false);
  });

  test('A-3. 적용하면 card_products 테이블이 생긴다', () => {
    const migration = require('../migrations/016-payment-method-taxonomy');
    migration.up(db);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='card_products'").all();
    assert.strictEqual(tables.length, 1);
  });

  test('A-4. 적용하면 transactions 에 card_product_id 가 생긴다', () => {
    const columns = db.prepare("PRAGMA table_info(transactions)").all();
    const hasCardProductId = columns.some(col => col.name === 'card_product_id');
    assert.strictEqual(hasCardProductId, true);
  });

  test('A-5. 두 번 실행해도 안전하다', () => {
    const migration = require('../migrations/016-payment-method-taxonomy');
    migration.up(db); // 두 번째 실행
    assert.doesNotThrow(() => {
      migration.up(db);
    });
  });

  test('A-6. idx_tx_card_product 인덱스가 생긴다', () => {
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_tx_card_product'").all();
    assert.strictEqual(indexes.length, 1);
  });
});

describe('B. 기존 데이터', () => {
  test('B-1. 기존 거래 두 건의 값이 그대로 남는다', () => {
    // SELECT * 는 새로 추가된 card_product_id 도 포함하므로 객체 전체를 비교하면
    // 안 된다. 기존 컬럼의 값이 보존됐는지만 본다.
    const rows = db.prepare('SELECT id, date, amount, payment_method_id FROM transactions ORDER BY id').all();
    assert.strictEqual(rows.length, 2);
    assert.deepStrictEqual(rows[0], { id: 100, date: '2026-01-01', amount: 10000, payment_method_id: 1 });
    assert.deepStrictEqual(rows[1], { id: 101, date: '2026-01-02', amount: 20000, payment_method_id: 1 });
  });

  test('B-2. 기존 거래의 card_product_id 가 전부 NULL 이다 — 미상을 NULL 로 표현한다', () => {
    const rows = db.prepare('SELECT card_product_id FROM transactions').all();
    assert.strictEqual(rows[0].card_product_id, null);
    assert.strictEqual(rows[1].card_product_id, null);
  });
});

describe('C. card_products', () => {
  test('C-1. 카드 상품을 넣고 읽을 수 있다', () => {
    const insert = db.prepare(`
      INSERT INTO card_products (payment_method_id, issuer, product_name, card_type)
      VALUES (1, '카드사A', '상품1', '신용')
    `);
    insert.run();

    const row = db.prepare('SELECT * FROM card_products').get();
    assert.strictEqual(row.payment_method_id, 1);
    assert.strictEqual(row.issuer, '카드사A');
    assert.strictEqual(row.product_name, '상품1');
    assert.strictEqual(row.card_type, '신용');
  });

  test('C-2. card_type 이 \'신용\' 인 상품과 \'체크\' 인 상품이 각각 들어간다', () => {
    const insert = db.prepare(`
      INSERT INTO card_products (payment_method_id, issuer, product_name, card_type)
      VALUES (1, '카드사B', '체크카드', '체크')
    `);
    insert.run();

    const rows = db.prepare('SELECT card_type FROM card_products').all();
    assert.strictEqual(rows.length, 2);
    assert.ok(rows.some(r => r.card_type === '신용'));
    assert.ok(rows.some(r => r.card_type === '체크'));
  });

  test('C-3. 같은 카드사에 상품 두 개가 들어간다 (1:1 제약이 없다)', () => {
    const insert = db.prepare(`
      INSERT INTO card_products (payment_method_id, issuer, product_name, card_type)
      VALUES (1, '카드사A', '상품2', '체크')
    `);
    insert.run();

    const rows = db.prepare('SELECT * FROM card_products WHERE issuer = \'카드사A\'').all();
    assert.strictEqual(rows.length, 2);
  });
});
