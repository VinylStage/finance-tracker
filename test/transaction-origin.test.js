'use strict';
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const {
  isEditable, lockedMessage, findLocked, countLockedAll,
} = require('../src/services/transactionOrigin');
const { TRANSACTION_ORIGINS, LOCKED_ORIGINS } = require('../src/constants');
const migration = require('../migrations/007-add-transaction-origin');

// (origin, 수정가능, 삭제가능) 표. 새 origin 값이 여기 없으면 아래 A-3 이 실패한다.
// #211 에서 쓴 표 기반 방식 — 판단을 빠뜨릴 수 없게 만드는 것이 목적이다.
const POLICY = [
  { origin: 'manual', editable: true },
  { origin: 'installment', editable: false },
  { origin: 'revolving', editable: false },
  { origin: 'debt_interest', editable: false },
  // 상환액은 사용자가 넣은 값이지만 이자 계산의 입력이라 거래내역에서 못 고친다(#287).
  { origin: 'debt_repayment', editable: false },
];

let dir, db;

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-origin-'));
  db = new Database(path.join(dir, 'test.db'));
  // 마이그레이션 전 상태를 재현한다 — origin 컬럼이 없는 스키마.
  db.exec(`
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY, date TEXT NOT NULL, category_id INTEGER NOT NULL,
      amount INTEGER NOT NULL, merchant TEXT, memo TEXT
    );
    INSERT INTO transactions (date, category_id, amount, merchant)
    VALUES ('2026-07-01', 1, 10000, '기존거래A'), ('2026-07-02', 1, 20000, '기존거래B');
  `);
});

after(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('A. 마이그레이션', () => {
  test('A-1. 적용 전에는 origin 컬럼이 없다', () => {
    const cols = db.prepare('PRAGMA table_info(transactions)').all().map((c) => c.name);
    assert.ok(!cols.includes('origin'), '이미 있으면 A-2 가 아무것도 증명하지 못한다');
  });

  test('A-2. 적용 후 기존 행이 전부 manual 로 남는다', () => {
    migration.up(db);
    const cols = db.prepare('PRAGMA table_info(transactions)').all().map((c) => c.name);
    for (const c of ['origin', 'origin_ref_table', 'origin_ref_id']) {
      assert.ok(cols.includes(c), `${c} 없음`);
    }
    const rows = db.prepare('SELECT origin FROM transactions').all();
    assert.strictEqual(rows.length, 2);
    assert.ok(rows.every((r) => r.origin === 'manual'), '기존 행이 manual 이 아니다');
  });

  test('A-3. 정본 상수의 모든 origin 이 정책 표에 있다', () => {
    const covered = POLICY.map((p) => p.origin).sort();
    assert.deepStrictEqual(covered, [...TRANSACTION_ORIGINS].sort(),
      '새 origin 을 추가했으면 이 테스트의 POLICY 표도 갱신해야 한다');
  });

  test('A-4. 두 번 실행해도 안전하다', () => {
    assert.doesNotThrow(() => migration.up(db));
    const cols = db.prepare('PRAGMA table_info(transactions)').all().map((c) => c.name);
    assert.strictEqual(cols.filter((c) => c === 'origin').length, 1);
  });

  test('A-5. 인덱스가 생긴다', () => {
    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_tx_origin'").get();
    assert.ok(idx);
  });
});

describe('B. 잠금 정책 표', () => {
  for (const { origin, editable } of POLICY) {
    test(`B. ${origin} → ${editable ? '수정 가능' : '수정 불가'}`, () => {
      assert.strictEqual(isEditable({ origin }), editable);
    });
  }

  test('B-1. origin 이 없는 행은 manual 로 본다', () => {
    assert.strictEqual(isEditable({}), true);
    assert.strictEqual(isEditable({ origin: null }), true);
    assert.strictEqual(isEditable(null), true);
  });

  test('B-2. LOCKED_ORIGINS 가 정본과 어긋나지 않는다', () => {
    for (const o of LOCKED_ORIGINS) {
      assert.ok(TRANSACTION_ORIGINS.includes(o), `${o} 가 정본에 없다`);
    }
  });

  test('B-3. 거부 문구에 내부 값이 노출되지 않는다', () => {
    for (const o of LOCKED_ORIGINS) {
      const msg = lockedMessage({ origin: o });
      assert.ok(!msg.includes(o), `문구에 origin 값 노출: ${msg}`);
      assert.ok(!msg.includes('origin'), `문구에 필드명 노출: ${msg}`);
      assert.ok(msg.length > 10, '문구가 비어 있다');
    }
  });

  test('B-4. 알 수 없는 origin 도 문구가 나온다', () => {
    const msg = lockedMessage({ origin: 'unknown_kind' });
    assert.ok(msg && !msg.includes('unknown_kind'));
  });
});

describe('C. 일괄 삭제 방어', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM transactions').run();
    const ins = db.prepare(`INSERT INTO transactions (date, category_id, amount, merchant, origin)
                            VALUES (?, 1, 1000, ?, ?)`);
    ins.run('2026-07-01', '수동1', 'manual');
    ins.run('2026-07-02', '수동2', 'manual');
    ins.run('2026-07-03', '할부1', 'installment');
    ins.run('2026-07-04', '리볼빙1', 'revolving');
  });

  test('C-1. findLocked 가 잠긴 것만 골라낸다', () => {
    const all = db.prepare('SELECT id FROM transactions').all().map((r) => r.id);
    const locked = findLocked(db, all);
    assert.strictEqual(locked.length, 2);
    assert.deepStrictEqual(locked.map((r) => r.origin).sort(), ['installment', 'revolving']);
  });

  test('C-2. 수동 거래만 고르면 잠긴 것이 없다', () => {
    const ids = db.prepare("SELECT id FROM transactions WHERE origin='manual'").all().map((r) => r.id);
    assert.deepStrictEqual(findLocked(db, ids), []);
  });

  test('C-3. 빈 목록은 빈 결과', () => {
    assert.deepStrictEqual(findLocked(db, []), []);
  });

  test('C-4. countLockedAll 이 전체 삭제를 막을 근거를 준다', () => {
    assert.strictEqual(countLockedAll(db), 2);
  });

  test('C-5. 파생 거래가 없으면 전체 삭제가 허용된다', () => {
    db.prepare("DELETE FROM transactions WHERE origin != 'manual'").run();
    assert.strictEqual(countLockedAll(db), 0);
  });
});
