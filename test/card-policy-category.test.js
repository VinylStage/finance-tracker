'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const Database = require('better-sqlite3');

const migration = require('../migrations/015-add-policy-category');
const { policyAt, resolvePolicy, findOverlapping } = require('../src/services/cardPolicy');

// 이 마이그레이션의 핵심은 SQLite 의 NULL 유니크 함정을 피하는 것이다.
// UNIQUE 제약에서 NULL 은 서로 다른 값으로 취급되므로, 컬럼만 늘리면 기본 정책의
// 중복이 막히지 않는다. 부분 유니크 인덱스 둘로 나눈 이유가 그것이고,
// 그게 실제로 막히는지가 가장 중요한 검증이다(B 섹션).

let tmpdir, db;

function insertPolicy(over = {}) {
  const p = {
    payment_method_id: 1, category_id: null, months: 6, policy_type: '무이자',
    annual_rate: 0, free_months: 0, effective_from: '2026-01-01', effective_to: null,
    memo: null, ...over,
  };
  return db.prepare(`
    INSERT INTO card_installment_policies
      (payment_method_id, category_id, months, policy_type, annual_rate, free_months,
       effective_from, effective_to, memo)
    VALUES (@payment_method_id, @category_id, @months, @policy_type, @annual_rate,
            @free_months, @effective_from, @effective_to, @memo)
  `).run(p);
}

const cols = () => db.prepare('PRAGMA table_info(card_installment_policies)').all().map((c) => c.name);
const indexSql = (name) => db.prepare(
  "SELECT sql FROM sqlite_master WHERE type='index' AND name=?"
).get(name)?.sql;

before(() => {
  tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-cip-'));
  db = new Database(path.join(tmpdir, 'test.db'));
  db.exec(`
    CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE payment_methods (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE card_installment_policies (
      id INTEGER PRIMARY KEY,
      payment_method_id INTEGER NOT NULL REFERENCES payment_methods(id),
      months INTEGER NOT NULL,
      policy_type TEXT NOT NULL,
      annual_rate REAL NOT NULL DEFAULT 0,
      free_months INTEGER NOT NULL DEFAULT 0,
      effective_from TEXT NOT NULL,
      effective_to TEXT,
      memo TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(payment_method_id, months, effective_from)
    );
    INSERT INTO payment_methods (id, name) VALUES (1, '하나카드');
    INSERT INTO categories (id, name) VALUES (1, '온라인쇼핑'), (2, '교통');
    INSERT INTO card_installment_policies
      (payment_method_id, months, policy_type, annual_rate, free_months, effective_from)
    VALUES (1, 6, '무이자', 0, 0, '2026-01-01');
  `);
});

after(() => {
  if (db) db.close();
  if (tmpdir) fs.rmSync(tmpdir, { recursive: true, force: true });
});

describe('A. 마이그레이션', () => {
  test('A-1. 적용 전에는 category_id 가 없다', () => {
    assert.ok(!cols().includes('category_id'));
  });

  test('A-2. 적용하면 category_id 가 생긴다', () => {
    migration.up(db);
    assert.ok(cols().includes('category_id'));
  });

  test('A-3. 기존 행이 보존되고 기본 정책으로 남는다', () => {
    const rows = db.prepare('SELECT * FROM card_installment_policies').all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].category_id, null);
    assert.equal(rows[0].months, 6);
    assert.equal(rows[0].policy_type, '무이자');
  });

  test('A-4. 두 번 실행해도 안전하다', () => {
    migration.up(db);
    assert.ok(cols().includes('category_id'));
    assert.equal(db.prepare('SELECT COUNT(*) c FROM card_installment_policies').get().c, 1);
  });

  test('A-5. 부분 유니크 인덱스 두 개가 생긴다', () => {
    assert.match(indexSql('idx_cip_base'), /WHERE\s+category_id\s+IS\s+NULL/i);
    assert.match(indexSql('idx_cip_category'), /WHERE\s+category_id\s+IS\s+NOT\s+NULL/i);
  });
});

describe('B. NULL 유니크 함정', () => {
  test('B-1. 기본 정책 중복은 거부된다', () => {
    // 컬럼만 늘리고 테이블 제약에 맡겼다면 여기서 그냥 통과해버린다.
    assert.throws(() => insertPolicy({ months: 6, effective_from: '2026-01-01' }), /UNIQUE/i);
  });

  test('B-2. 기본 정책과 카테고리 예외는 같은 조합으로 공존한다', () => {
    insertPolicy({
      category_id: 1, months: 6, effective_from: '2026-01-01',
      policy_type: '부분무이자', free_months: 3,
    });
    assert.equal(db.prepare('SELECT COUNT(*) c FROM card_installment_policies WHERE months=6').get().c, 2);
  });

  test('B-3. 같은 카테고리 예외 중복은 거부된다', () => {
    assert.throws(
      () => insertPolicy({ category_id: 1, months: 6, effective_from: '2026-01-01' }),
      /UNIQUE/i
    );
  });

  test('B-4. 다른 카테고리는 같은 조합으로 들어간다', () => {
    insertPolicy({
      category_id: 2, months: 6, effective_from: '2026-01-01',
      policy_type: '유이자', annual_rate: 15,
    });
    assert.equal(db.prepare('SELECT COUNT(*) c FROM card_installment_policies WHERE months=6').get().c, 3);
  });
});

describe('C. 조회 — 좁은 것 우선', () => {
  test('C-1. 카테고리 예외가 있으면 그것을 쓴다', () => {
    const p = policyAt(db, 1, 6, '2026-03-01', 1);
    assert.equal(p.category_id, 1);
    assert.equal(p.policy_type, '부분무이자');
  });

  test('C-2. 예외가 없는 카테고리는 기본 정책으로 떨어진다', () => {
    const p = policyAt(db, 1, 6, '2026-03-01', 99);
    assert.equal(p.category_id, null);
    assert.equal(p.policy_type, '무이자');
  });

  test('C-3. 카테고리를 주지 않으면 기본 정책만 본다', () => {
    // 카테고리를 모르는 호출부가 우연히 예외를 집어가면 안 된다.
    const p = policyAt(db, 1, 6, '2026-03-01');
    assert.equal(p.category_id, null);
  });

  test('C-4. 정책이 아예 없으면 null', () => {
    assert.equal(policyAt(db, 1, 24, '2026-03-01', 1), null);
  });

  test('C-5. resolvePolicy 가 적용 경로를 알려준다', () => {
    assert.equal(resolvePolicy(db, 1, 6, '2026-03-01', 1).source, 'category');
    assert.equal(resolvePolicy(db, 1, 6, '2026-03-01', 99).source, 'base');
    assert.equal(resolvePolicy(db, 1, 24, '2026-03-01', 1).source, 'none');
  });

  test('C-6. 시행일 전에는 잡히지 않는다', () => {
    assert.equal(policyAt(db, 1, 6, '2025-12-31', 1), null);
  });
});

describe('D. 겹침 판정은 같은 범위 안에서만', () => {
  test('D-1. 기본 정책끼리 기간이 겹치면 잡아낸다', () => {
    const hit = findOverlapping(db, {
      payment_method_id: 1, category_id: null, months: 6,
      effective_from: '2026-06-01', effective_to: null,
    });
    assert.ok(hit);
    assert.equal(hit.category_id, null);
  });

  test('D-2. 카테고리 예외는 같은 카테고리끼리만 겹침으로 본다', () => {
    // 예외가 기본을 덮는 구조이므로 기본 정책과 같은 기간에 공존하는 것이 정상이다.
    const hit = findOverlapping(db, {
      payment_method_id: 1, category_id: 1, months: 6,
      effective_from: '2026-06-01', effective_to: null,
    });
    assert.equal(hit.category_id, 1);
  });

  test('D-3. 예외가 없는 카테고리는 겹치지 않는다', () => {
    const hit = findOverlapping(db, {
      payment_method_id: 1, category_id: 3, months: 6,
      effective_from: '2026-06-01', effective_to: null,
    });
    assert.equal(hit, null);
  });
});
