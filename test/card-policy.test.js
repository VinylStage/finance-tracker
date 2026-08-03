'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const {
  isEffectiveOn, overlaps, validatePolicy, policyAt, findOverlapping,
} = require('../src/services/cardPolicy');
const migration = require('../migrations/006-add-card-installment-policies');
const migrationFreeFrom = require('../migrations/009-installment-free-from-sequence');
const { INSTALLMENT_POLICY_TYPES } = require('../src/constants');

// 실거래 DB 를 절대 건드리지 않는다. 임시 디렉터리에 격리 DB 를 만든다.
let dir, db;

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-cip-'));
  db = new Database(path.join(dir, 'test.db'));
  db.exec(`
    CREATE TABLE payment_methods (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, type TEXT NOT NULL,
      is_active INTEGER DEFAULT 1
    );
    INSERT INTO payment_methods (id, name, type) VALUES (1, '신용카드', '신용'), (2, '체크카드', '체크');
  `);
  migration.up(db);
  migrationFreeFrom.up(db);
});

after(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function insert(p) {
  return db.prepare(`
    INSERT INTO card_installment_policies
      (payment_method_id, months, policy_type, annual_rate, free_from_sequence, effective_from, effective_to)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(p.payment_method_id, p.months, p.policy_type, p.annual_rate ?? 0,
         p.free_from_sequence ?? 0, p.effective_from, p.effective_to ?? null);
}

describe('마이그레이션', () => {
  test('테이블과 인덱스가 생긴다', () => {
    const t = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='card_installment_policies'").get();
    assert.ok(t, '테이블 없음');
    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_cip_method_months'").get();
    assert.ok(idx, '인덱스 없음');
  });

  test('두 번 실행해도 안전하다', () => {
    assert.doesNotThrow(() => migration.up(db));
  });
});

describe('isEffectiveOn — 유효기간 경계', () => {
  const p = { effective_from: '2026-01-01', effective_to: '2026-12-31' };
  const open = { effective_from: '2026-01-01', effective_to: null };

  test('시작일 당일은 포함', () => assert.strictEqual(isEffectiveOn(p, '2026-01-01'), true));
  test('종료일 당일은 포함', () => assert.strictEqual(isEffectiveOn(p, '2026-12-31'), true));
  test('시작 하루 전은 제외', () => assert.strictEqual(isEffectiveOn(p, '2025-12-31'), false));
  test('종료 하루 뒤는 제외', () => assert.strictEqual(isEffectiveOn(p, '2027-01-01'), false));
  test('effective_to 가 없으면 이후 전부 유효', () => {
    assert.strictEqual(isEffectiveOn(open, '2099-01-01'), true);
    assert.strictEqual(isEffectiveOn(open, '2025-12-31'), false);
  });
});

describe('overlaps — 기간 겹침', () => {
  const base = { effective_from: '2026-01-01', effective_to: '2026-06-30' };
  test('완전히 앞선 기간은 안 겹침', () => {
    assert.strictEqual(overlaps(base, { effective_from: '2025-01-01', effective_to: '2025-12-31' }), false);
  });
  test('하루 붙어 있으면 안 겹침', () => {
    assert.strictEqual(overlaps(base, { effective_from: '2026-07-01', effective_to: '2026-12-31' }), false);
  });
  test('하루라도 물리면 겹침', () => {
    assert.strictEqual(overlaps(base, { effective_from: '2026-06-30', effective_to: '2026-12-31' }), true);
  });
  test('무기한이 앞 기간을 삼키면 겹침', () => {
    assert.strictEqual(overlaps(base, { effective_from: '2025-01-01', effective_to: null }), true);
  });
});

describe('validatePolicy', () => {
  const ok = {
    payment_method_id: 1, months: 12, policy_type: '유이자',
    annual_rate: 15.9, free_from_sequence: 0, effective_from: '2026-01-01', effective_to: null,
  };

  test('정상 입력은 통과', () => assert.strictEqual(validatePolicy(ok), null));

  test('허용되지 않은 종류는 거부', () => {
    assert.ok(validatePolicy({ ...ok, policy_type: '반값이자' }));
  });

  test('개월수 2 미만은 거부', () => {
    assert.ok(validatePolicy({ ...ok, months: 1 }));
    assert.strictEqual(validatePolicy({ ...ok, months: 2 }), null);
  });

  test('시작일이 종료일보다 늦으면 거부', () => {
    assert.ok(validatePolicy({ ...ok, effective_from: '2026-12-31', effective_to: '2026-01-01' }));
  });

  test('이자율이 숫자가 아니면 거부 — NaN 은 범위 비교를 다 통과한다', () => {
    assert.ok(validatePolicy({ ...ok, annual_rate: Number('abc') }));
    assert.ok(validatePolicy({ ...ok, annual_rate: Infinity }));
  });

  test('이자율 범위', () => {
    assert.ok(validatePolicy({ ...ok, annual_rate: -1 }));
    assert.ok(validatePolicy({ ...ok, annual_rate: 101 }));
    assert.strictEqual(validatePolicy({ ...ok, annual_rate: 0, policy_type: '유이자' }), null);
    assert.strictEqual(validatePolicy({ ...ok, annual_rate: 100 }), null);
  });

  test('면제 시작 회차는 개월수 안에 들어와야 한다', () => {
    // 13회차부터 면제인데 12개월 할부면 면제되는 회차가 하나도 없다.
    assert.ok(validatePolicy({ ...ok, policy_type: '부분무이자', free_from_sequence: 13 }));
    assert.strictEqual(validatePolicy({ ...ok, policy_type: '부분무이자', free_from_sequence: 12 }), null);
  });

  test('1회차부터 면제는 무이자와 같으므로 거부', () => {
    // 종류를 잘못 고른 것이다. 무이자로 넣어야 이자율 검증도 함께 걸린다.
    assert.ok(validatePolicy({ ...ok, policy_type: '부분무이자', free_from_sequence: 1 }));
  });

  test('종류와 값이 어긋나면 거부', () => {
    assert.ok(validatePolicy({ ...ok, policy_type: '무이자', annual_rate: 5 }));
    assert.ok(validatePolicy({ ...ok, policy_type: '부분무이자', free_from_sequence: 0 }));
    assert.ok(validatePolicy({ ...ok, policy_type: '유이자', free_from_sequence: 3 }));
  });

  test('부분무이자 정상 입력', () => {
    // 카드사 안내 "12개월 부분무이자(6회차부터 면제)" 를 그대로 옮긴 형태.
    assert.strictEqual(
      validatePolicy({ ...ok, policy_type: '부분무이자', free_from_sequence: 6 }), null);
  });

  test('정본 상수가 세 종류를 갖는다', () => {
    assert.deepStrictEqual(INSTALLMENT_POLICY_TYPES, ['무이자', '부분무이자', '유이자']);
  });
});

describe('policyAt — 시점별 정책 조회', () => {
  before(() => {
    db.prepare('DELETE FROM card_installment_policies').run();
    insert({ payment_method_id: 1, months: 12, policy_type: '유이자', annual_rate: 12,
             effective_from: '2025-01-01', effective_to: '2025-12-31' });
    insert({ payment_method_id: 1, months: 12, policy_type: '유이자', annual_rate: 15.9,
             effective_from: '2026-01-01', effective_to: null });
    insert({ payment_method_id: 1, months: 3, policy_type: '무이자',
             effective_from: '2026-01-01', effective_to: null });
  });

  test('과거 시점은 과거 정책을 돌려준다', () => {
    const p = policyAt(db, 1, 12, '2025-06-15');
    assert.strictEqual(p.annual_rate, 12);
  });

  test('현재 시점은 현재 정책을 돌려준다', () => {
    const p = policyAt(db, 1, 12, '2026-08-01');
    assert.strictEqual(p.annual_rate, 15.9);
  });

  test('구간 사이 경계일', () => {
    assert.strictEqual(policyAt(db, 1, 12, '2025-12-31').annual_rate, 12);
    assert.strictEqual(policyAt(db, 1, 12, '2026-01-01').annual_rate, 15.9);
  });

  test('해당 개월수 정책이 없으면 null', () => {
    assert.strictEqual(policyAt(db, 1, 24, '2026-08-01'), null);
  });

  test('다른 결제수단은 null', () => {
    assert.strictEqual(policyAt(db, 2, 12, '2026-08-01'), null);
  });

  test('정책 시작 전 시점은 null', () => {
    assert.strictEqual(policyAt(db, 1, 12, '2024-01-01'), null);
  });
});

describe('findOverlapping — 등록 시 겹침 탐지', () => {
  before(() => {
    db.prepare('DELETE FROM card_installment_policies').run();
    insert({ payment_method_id: 1, months: 12, policy_type: '유이자', annual_rate: 12,
             effective_from: '2026-01-01', effective_to: '2026-06-30' });
  });

  test('겹치면 찾아낸다', () => {
    const found = findOverlapping(db, {
      payment_method_id: 1, months: 12, effective_from: '2026-06-01', effective_to: null,
    });
    assert.ok(found);
  });

  test('안 겹치면 null', () => {
    const found = findOverlapping(db, {
      payment_method_id: 1, months: 12, effective_from: '2026-07-01', effective_to: null,
    });
    assert.strictEqual(found, null);
  });

  test('다른 개월수는 겹치지 않는다', () => {
    const found = findOverlapping(db, {
      payment_method_id: 1, months: 6, effective_from: '2026-01-01', effective_to: null,
    });
    assert.strictEqual(found, null);
  });

  test('수정 시 자기 자신은 제외한다', () => {
    const row = db.prepare('SELECT * FROM card_installment_policies LIMIT 1').get();
    const found = findOverlapping(db, {
      payment_method_id: 1, months: 12, effective_from: '2026-01-01', effective_to: '2026-06-30',
    }, row.id);
    assert.strictEqual(found, null);
  });
});
