'use strict';
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 실사용 DB 를 절대 건드리지 않는다. init.js 를 require 하기 전에 DB_PATH 를
// 임시 경로로 바꿔 격리한다 — 스키마·마이그레이션까지 그대로 태워야 008 이
// 실제로 도는지도 같이 확인된다.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-derived-'));
process.env.DB_PATH = path.join(dir, 'test.db');

const db = require('../src/db/init');
const {
  planInstallmentDerived, applyInstallmentDerived, derivedRowsFor, deleteDerivedFor,
  syncRevolvingDerived, createDebtInterestDerived, deleteDebtDerived, derivedRowsForDebt,
  findCategoryId, PreviewRequiredError, PreviewMismatchError,
} = require('../src/services/derivedTransactions');
const { DERIVED_CATEGORIES } = require('../src/constants');

let cardId;

before(() => {
  cardId = db.prepare("SELECT id FROM payment_methods WHERE name='신용카드'").get().id;
});

after(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function makeInstallment(over = {}) {
  const v = {
    purchase_date: '2026-01-15', merchant: '노트북', total_amount: 1200000,
    months: 12, monthly_amount: 100000, fee_per_month: 0,
    payment_method_id: cardId, start_billing_month: '2026-02', status: '진행중',
    ...over,
  };
  const info = db.prepare(`
    INSERT INTO installments (purchase_date, merchant, total_amount, months, monthly_amount,
      fee_per_month, payment_method_id, start_billing_month, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(v.purchase_date, v.merchant, v.total_amount, v.months, v.monthly_amount,
         v.fee_per_month, v.payment_method_id, v.start_billing_month, v.status);
  return Number(info.lastInsertRowid);
}

function txCount() {
  return db.prepare('SELECT COUNT(*) AS c FROM transactions').get().c;
}

beforeEach(() => {
  db.prepare('DELETE FROM transactions').run();
  db.prepare('DELETE FROM installments').run();
  db.prepare('DELETE FROM revolving_history').run();
  db.prepare('DELETE FROM debt_interest_log').run();
  db.prepare('DELETE FROM debts').run();
  db.prepare('DELETE FROM card_installment_policies').run();
});

describe('A. 마이그레이션 008', () => {
  test('A-1. installments.paid_off_on 이 생긴다', () => {
    const cols = db.prepare('PRAGMA table_info(installments)').all().map((c) => c.name);
    assert.ok(cols.includes('paid_off_on'));
  });

  test('A-2. transactions 에 회차 번호 컬럼이 생긴다', () => {
    const cols = db.prepare('PRAGMA table_info(transactions)').all().map((c) => c.name);
    assert.ok(cols.includes('origin_seq'));
    assert.ok(cols.includes('origin_seq_total'));
  });

  test('A-3. 기본 카테고리 시드가 마이그레이션에 밀려나지 않았다', () => {
    // 008 이 카테고리를 넣었다면 init.js 의 "0건이면 시드" 가 건너뛰어져
    // 기본 카테고리 23종이 통째로 사라진다. 그 회귀를 고정한다.
    const c = db.prepare('SELECT COUNT(*) AS c FROM categories').get().c;
    assert.ok(c >= 23, `기본 카테고리가 시드되지 않았다 (${c}건)`);
  });
});

describe('B. 프리뷰는 DB 를 바꾸지 않는다 (ADR 0008)', () => {
  test('B-1. 프리뷰 후 거래·카테고리·할부가 그대로다', () => {
    const id = makeInstallment();
    const before = {
      tx: txCount(),
      categories: db.prepare('SELECT COUNT(*) AS c FROM categories').get().c,
      installment: db.prepare('SELECT * FROM installments WHERE id=?').get(id),
    };

    const plan = planInstallmentDerived(db, id, { months: 6, total_amount: 600000 });
    assert.strictEqual(plan.create_count, 6);

    assert.strictEqual(txCount(), before.tx, '프리뷰가 거래를 만들었다');
    assert.strictEqual(
      db.prepare('SELECT COUNT(*) AS c FROM categories').get().c, before.categories,
      '프리뷰가 카테고리를 만들었다'
    );
    assert.deepStrictEqual(
      db.prepare('SELECT * FROM installments WHERE id=?').get(id), before.installment,
      '프리뷰가 원본을 고쳤다'
    );
  });

  test('B-2. 프리뷰가 삭제/생성 회차 수와 금액 전후를 알려준다', () => {
    const id = makeInstallment();
    applyInstallmentDerived(db, id, { requirePreview: false });

    const plan = planInstallmentDerived(db, id, { months: 6, total_amount: 600000 });
    assert.strictEqual(plan.delete_count, 12);
    assert.strictEqual(plan.create_count, 6);
    assert.strictEqual(plan.before_total, 1200000);
    assert.strictEqual(plan.after_total, 600000);
    assert.strictEqual(plan.delta, -600000);
    assert.ok(plan.changed_months.length > 0);
  });

  test('B-3. 지난 회차가 영향받으면 따로 표시된다', () => {
    // 첫 청구월을 과거로 두면 이미 지난 회차가 영향 범위에 들어온다.
    const id = makeInstallment({ start_billing_month: '2020-01' });
    applyInstallmentDerived(db, id, { requirePreview: false });
    const plan = planInstallmentDerived(db, id, { total_amount: 2400000 });
    assert.ok(plan.past_affected.length > 0, '과거 청구월 변화가 표시되지 않았다');
    assert.ok(plan.past_affected.every((r) => r.is_past));
  });

  test('B-4. 되돌리는 방법을 사실대로 적는다', () => {
    const id = makeInstallment();
    // M12(#300) 전이라 실행취소가 없다. 있다고 적으면 사용자가 잘못 판단한다.
    assert.strictEqual(planInstallmentDerived(db, id).reversible, 'backup');
  });
});

describe('C. 프리뷰 우회 차단', () => {
  test('C-1. 지문 없이 실행하면 거부한다', () => {
    const id = makeInstallment();
    applyInstallmentDerived(db, id, { requirePreview: false });
    assert.throws(
      () => applyInstallmentDerived(db, id, { overrides: { months: 6 } }),
      PreviewRequiredError
    );
  });

  test('C-2. 낡은 지문은 거부한다', () => {
    const id = makeInstallment();
    const plan = planInstallmentDerived(db, id, { months: 6, total_amount: 600000 });
    // 프리뷰를 본 뒤 원본이 바뀐 상황.
    db.prepare('UPDATE installments SET total_amount=999999 WHERE id=?').run(id);
    assert.throws(
      () => applyInstallmentDerived(db, id, {
        overrides: { months: 6, total_amount: 600000 }, fingerprint: plan.fingerprint,
      }),
      PreviewMismatchError
    );
  });

  test('C-3. 지문이 맞으면 실행된다', () => {
    const id = makeInstallment();
    const plan = planInstallmentDerived(db, id, { months: 6, total_amount: 600000 });
    const applied = applyInstallmentDerived(db, id, {
      overrides: { months: 6, total_amount: 600000 },
      fingerprint: plan.fingerprint,
      persistInstallment: true,
    });
    assert.strictEqual(applied.create_count, 6);
    assert.strictEqual(derivedRowsFor(db, 'installments', id).length, 6);
    assert.strictEqual(db.prepare('SELECT months FROM installments WHERE id=?').get(id).months, 6);
  });

  test('C-4. 거부 문구에 내부 필드명이 없다', () => {
    const id = makeInstallment();
    try {
      applyInstallmentDerived(db, id, { overrides: { months: 6 } });
      assert.fail('거부되지 않았다');
    } catch (e) {
      for (const bad of ['fingerprint', 'origin', 'preview_token', 'installment']) {
        assert.ok(!e.message.includes(bad), `문구에 내부 용어 노출: ${e.message}`);
      }
    }
  });
});

describe('D. 재생성', () => {
  test('D-1. 멱등하다 — 두 번 실행해도 행 수가 같다', () => {
    const id = makeInstallment();
    applyInstallmentDerived(db, id, { requirePreview: false });
    const first = derivedRowsFor(db, 'installments', id).map((r) => ({ date: r.date, amount: r.amount }));

    applyInstallmentDerived(db, id, { requirePreview: false });
    const second = derivedRowsFor(db, 'installments', id).map((r) => ({ date: r.date, amount: r.amount }));

    assert.strictEqual(second.length, 12);
    assert.deepStrictEqual(second, first);
  });

  test('D-2. 원금 합이 총액과 일치한다 — 끝수가 사라지지 않는다', () => {
    const id = makeInstallment({ total_amount: 1000000, months: 3 });
    applyInstallmentDerived(db, id, { requirePreview: false });
    const total = derivedRowsFor(db, 'installments', id).reduce((s, r) => s + r.amount, 0);
    assert.strictEqual(total, 1000000);
  });

  test('D-3. 회차 번호가 행에 남는다 — 화면이 메모를 파싱하지 않아도 된다', () => {
    const id = makeInstallment({ months: 3, total_amount: 300000 });
    applyInstallmentDerived(db, id, { requirePreview: false });
    const rows = derivedRowsFor(db, 'installments', id);
    assert.deepStrictEqual(rows.map((r) => r.origin_seq), [1, 2, 3]);
    assert.ok(rows.every((r) => r.origin_seq_total === 3));
  });

  test('D-4. 파생 거래가 잠금 대상 origin 을 단다', () => {
    const id = makeInstallment();
    applyInstallmentDerived(db, id, { requirePreview: false });
    const rows = derivedRowsFor(db, 'installments', id);
    assert.ok(rows.every((r) => r.origin === 'installment'));
    assert.ok(rows.every((r) => r.origin_ref_table === 'installments' && r.origin_ref_id === id));
  });

  test('D-5. 정책이 없으면 기존 고정 수수료를 회차마다 얹는다', () => {
    const id = makeInstallment({ months: 3, total_amount: 300000, fee_per_month: 1000 });
    applyInstallmentDerived(db, id, { requirePreview: false });
    const rows = derivedRowsFor(db, 'installments', id);
    assert.deepStrictEqual(rows.map((r) => r.amount), [101000, 101000, 101000]);
  });

  test('D-6. 정책이 있으면 정책 이자를 쓰고 고정 수수료를 무시한다', () => {
    db.prepare(`
      INSERT INTO card_installment_policies
        (payment_method_id, months, policy_type, annual_rate, free_months, effective_from)
      VALUES (?, 3, '무이자', 0, 0, '2026-01-01')
    `).run(cardId);
    const id = makeInstallment({ months: 3, total_amount: 300000, fee_per_month: 5000 });
    applyInstallmentDerived(db, id, { requirePreview: false });
    const rows = derivedRowsFor(db, 'installments', id);
    assert.deepStrictEqual(rows.map((r) => r.amount), [100000, 100000, 100000]);
  });

  test('D-7. 구매 시점 정책을 쓴다 — 뒤에 등록된 정책이 소급 적용되지 않는다', () => {
    db.prepare(`
      INSERT INTO card_installment_policies
        (payment_method_id, months, policy_type, annual_rate, free_months, effective_from, effective_to)
      VALUES (?, 3, '무이자', 0, 0, '2026-01-01', '2026-06-30')
    `).run(cardId);
    db.prepare(`
      INSERT INTO card_installment_policies
        (payment_method_id, months, policy_type, annual_rate, free_months, effective_from)
      VALUES (?, 3, '유이자', 12, 0, '2026-07-01')
    `).run(cardId);

    const id = makeInstallment({ purchase_date: '2026-02-10', months: 3, total_amount: 300000 });
    applyInstallmentDerived(db, id, { requirePreview: false });
    const rows = derivedRowsFor(db, 'installments', id);
    assert.deepStrictEqual(rows.map((r) => r.amount), [100000, 100000, 100000],
      '구매 이후에 생긴 유이자 정책이 소급 적용됐다');
  });
});

describe('E. 조기 완납', () => {
  test('E-1. 완납월 다음 회차부터는 만들지 않는다', () => {
    const id = makeInstallment({ months: 12, total_amount: 1200000, start_billing_month: '2026-02' });
    applyInstallmentDerived(db, id, { requirePreview: false });
    assert.strictEqual(derivedRowsFor(db, 'installments', id).length, 12);

    applyInstallmentDerived(db, id, {
      overrides: { paid_off_on: '2026-04-20' }, requirePreview: false, persistInstallment: true,
    });
    const rows = derivedRowsFor(db, 'installments', id);
    assert.strictEqual(rows.length, 3, '2026-02·03·04 세 회차만 남아야 한다');
    assert.strictEqual(rows.at(-1).date, '2026-04-01');
  });

  test('E-2. 완납 회차가 잔여 원금을 전부 싣는다', () => {
    const id = makeInstallment({ months: 12, total_amount: 1200000, start_billing_month: '2026-02' });
    applyInstallmentDerived(db, id, {
      overrides: { paid_off_on: '2026-04-20' }, requirePreview: false, persistInstallment: true,
    });
    const rows = derivedRowsFor(db, 'installments', id);
    assert.strictEqual(rows.reduce((s, r) => s + r.amount, 0), 1200000);
    assert.strictEqual(rows.at(-1).amount, 1000000);
  });

  test('E-3. 완납 후 회차 표기가 실제 청구 횟수를 따른다', () => {
    const id = makeInstallment({ months: 12, total_amount: 1200000, start_billing_month: '2026-02' });
    applyInstallmentDerived(db, id, {
      overrides: { paid_off_on: '2026-04-20' }, requirePreview: false, persistInstallment: true,
    });
    assert.ok(derivedRowsFor(db, 'installments', id).every((r) => r.origin_seq_total === 3));
  });
});

describe('F. 고아 행', () => {
  test('F-1. 할부를 지우면 파생 거래도 사라진다', () => {
    const id = makeInstallment();
    applyInstallmentDerived(db, id, { requirePreview: false });
    assert.strictEqual(txCount(), 12);
    deleteDerivedFor(db, 'installments', id);
    db.prepare('DELETE FROM installments WHERE id=?').run(id);
    assert.strictEqual(txCount(), 0);
  });

  test('F-2. 수동 거래는 같이 지워지지 않는다', () => {
    const id = makeInstallment();
    const catId = db.prepare("SELECT id FROM categories WHERE major_type='변동필수' LIMIT 1").get().id;
    db.prepare(`INSERT INTO transactions (date, category_id, amount, merchant, installment_id)
                VALUES ('2026-02-01', ?, 5000, '수동입력', ?)`).run(catId, id);
    applyInstallmentDerived(db, id, { requirePreview: false });
    deleteDerivedFor(db, 'installments', id);

    const left = db.prepare('SELECT * FROM transactions').all();
    assert.strictEqual(left.length, 1);
    assert.strictEqual(left[0].merchant, '수동입력');
  });
});

describe('G. 리볼빙', () => {
  function makeRevolving(interest) {
    const info = db.prepare(`
      INSERT INTO revolving_history (month, payment_method_id, carried_balance, new_charge, paid_amount, interest, next_carried_balance)
      VALUES ('2026-03', ?, 100000, 50000, 30000, ?, ?)
    `).run(cardId, interest, 120000 + interest);
    return Number(info.lastInsertRowid);
  }

  test('G-1. 수수료가 있으면 거래 1건', () => {
    const id = makeRevolving(4500);
    assert.deepStrictEqual(syncRevolvingDerived(db, id), { created: 1, deleted: 0 });
    const rows = derivedRowsFor(db, 'revolving_history', id);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].amount, 4500);
    assert.strictEqual(rows[0].origin, 'revolving');
    assert.strictEqual(rows[0].date, '2026-03-01');
  });

  test('G-2. 수수료가 0 이면 거래를 만들지 않는다', () => {
    const id = makeRevolving(0);
    assert.deepStrictEqual(syncRevolvingDerived(db, id), { created: 0, deleted: 0 });
    assert.strictEqual(derivedRowsFor(db, 'revolving_history', id).length, 0);
  });

  test('G-3. 수수료를 0 으로 고치면 기존 거래가 사라진다', () => {
    const id = makeRevolving(4500);
    syncRevolvingDerived(db, id);
    db.prepare('UPDATE revolving_history SET interest=0 WHERE id=?').run(id);
    assert.deepStrictEqual(syncRevolvingDerived(db, id), { created: 0, deleted: 1 });
    assert.strictEqual(derivedRowsFor(db, 'revolving_history', id).length, 0);
  });

  test('G-4. 여러 번 동기화해도 1건을 넘지 않는다', () => {
    const id = makeRevolving(4500);
    syncRevolvingDerived(db, id);
    syncRevolvingDerived(db, id);
    syncRevolvingDerived(db, id);
    assert.strictEqual(derivedRowsFor(db, 'revolving_history', id).length, 1);
  });
});

describe('H. 부채 이자', () => {
  function makeDebtWithInterest(amount) {
    const debtId = Number(db.prepare(`INSERT INTO debts (name, balance, annual_rate) VALUES ('학자금', 1000000, 12)`).run().lastInsertRowid);
    const logId = Number(db.prepare(`
      INSERT INTO debt_interest_log (debt_id, log_date, rate_at_time, interest_amount, balance_before, balance_after)
      VALUES (?, '2026-03-15', 12, ?, 1000000, ?)
    `).run(debtId, amount, 1000000 + amount).lastInsertRowid);
    return { debtId, logId };
  }

  test('H-1. 이자 기록이 거래 1건을 만든다', () => {
    const { logId } = makeDebtWithInterest(10000);
    assert.deepStrictEqual(createDebtInterestDerived(db, logId), { created: 1 });
    const rows = derivedRowsFor(db, 'debt_interest_log', logId);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].amount, 10000);
    assert.strictEqual(rows[0].origin, 'debt_interest');
    assert.strictEqual(rows[0].date, '2026-03-15');
  });

  test('H-2. 이자가 0 이면 거래를 만들지 않는다', () => {
    const { logId } = makeDebtWithInterest(0);
    assert.deepStrictEqual(createDebtInterestDerived(db, logId), { created: 0 });
  });

  test('H-3. 부채를 지우면 이자 거래도 사라진다', () => {
    const { debtId, logId } = makeDebtWithInterest(10000);
    createDebtInterestDerived(db, logId);
    assert.strictEqual(derivedRowsForDebt(db, debtId).length, 1);
    assert.strictEqual(deleteDebtDerived(db, debtId), 1);
    assert.strictEqual(txCount(), 0);
  });

  test('H-4. 다른 부채의 이자 거래는 건드리지 않는다', () => {
    const a = makeDebtWithInterest(10000);
    const b = makeDebtWithInterest(20000);
    createDebtInterestDerived(db, a.logId);
    createDebtInterestDerived(db, b.logId);
    deleteDebtDerived(db, a.debtId);
    assert.strictEqual(derivedRowsForDebt(db, b.debtId).length, 1);
  });
});

describe('I. 파생 카테고리', () => {
  test('I-1. 세 출처가 서로 다른 카테고리를 쓴다', () => {
    const names = Object.values(DERIVED_CATEGORIES).map((c) => c.name);
    assert.strictEqual(new Set(names).size, 3, '파생 유형이 카테고리를 공유하면 분석이 무의미해진다');
  });

  test('I-2. 카테고리를 지워도 다음 생성에서 복구된다', () => {
    const id = makeInstallment({ months: 2, total_amount: 200000 });
    applyInstallmentDerived(db, id, { requirePreview: false });
    const catId = findCategoryId(db, 'installment');
    assert.ok(catId > 0);

    db.prepare('DELETE FROM transactions').run();
    db.prepare('DELETE FROM categories WHERE id=?').run(catId);
    assert.strictEqual(findCategoryId(db, 'installment'), 0);

    applyInstallmentDerived(db, id, { requirePreview: false });
    assert.ok(findCategoryId(db, 'installment') > 0);
    assert.strictEqual(derivedRowsFor(db, 'installments', id).length, 2);
  });
});
