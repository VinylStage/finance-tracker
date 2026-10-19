'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const { inactiveRefError, usageOf } = require('../src/services/activeRefs');

// 메모리 DB 에 필요한 칸만 만든다(실거래 DB 미접촉).
function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE categories (id INTEGER PRIMARY KEY, is_active INTEGER DEFAULT 1);
    CREATE TABLE payment_methods (id INTEGER PRIMARY KEY, is_active INTEGER DEFAULT 1);
    CREATE TABLE recurring_rules (id INTEGER PRIMARY KEY, category_id INTEGER, payment_method_id INTEGER, is_active INTEGER DEFAULT 1);
    CREATE TABLE transactions (id INTEGER PRIMARY KEY, category_id INTEGER, payment_method_id INTEGER);
    INSERT INTO categories (id, is_active) VALUES (1, 1), (2, 0);
    INSERT INTO payment_methods (id, is_active) VALUES (5, 1), (6, 0);
    INSERT INTO recurring_rules (category_id, payment_method_id, is_active) VALUES (2, 5, 1), (2, 6, 1), (2, 5, 0), (1, 6, 1);
    INSERT INTO transactions (category_id, payment_method_id) VALUES (2, 5), (2, 5), (2, 6), (1, 6);
  `);
  return db;
}

const CAT_ERR = '비활성화된 분류는 새 거래·규칙에 쓸 수 없습니다.';
const PM_ERR = '비활성화된 결제수단은 새 거래·규칙에 쓸 수 없습니다.';

test('활성 분류·결제수단은 통과', () => {
  const db = makeDb();
  assert.strictEqual(inactiveRefError(db, { category_id: 1, payment_method_id: 5 }), null);
});

test('비활성 분류를 새로 쓰면 거절', () => {
  const db = makeDb();
  assert.strictEqual(inactiveRefError(db, { category_id: 2 }), CAT_ERR);
});

test('비활성 결제수단을 새로 쓰면 거절', () => {
  const db = makeDb();
  assert.strictEqual(inactiveRefError(db, { category_id: 1, payment_method_id: 6 }), PM_ERR);
});

test('문자열 id 도 같게 본다', () => {
  const db = makeDb();
  assert.strictEqual(inactiveRefError(db, { category_id: '2' }), CAT_ERR);
});

test('수정에서 원래 값과 같으면 비활성이어도 통과', () => {
  const db = makeDb();
  assert.strictEqual(inactiveRefError(db, { category_id: 2, payment_method_id: 6 }, { category_id: 2, payment_method_id: 6 }), null);
});

test('수정에서 비활성으로 바꾸면 거절', () => {
  const db = makeDb();
  assert.strictEqual(inactiveRefError(db, { category_id: 2 }, { category_id: 1 }), CAT_ERR);
});

test('없는 id 나 빈 값은 여기서 막지 않는다', () => {
  const db = makeDb();
  assert.strictEqual(inactiveRefError(db, { category_id: 999, payment_method_id: null }), null);
  assert.strictEqual(inactiveRefError(db, {}), null);
});

test('분류 사용처는 활성 규칙과 거래를 센다', () => {
  const db = makeDb();
  assert.deepStrictEqual(usageOf(db, 'category', 2), { active_rules: 2, transactions: 3 });
});

test('결제수단 사용처도 같다', () => {
  const db = makeDb();
  assert.deepStrictEqual(usageOf(db, 'payment_method', 6), { active_rules: 2, transactions: 2 });
});
