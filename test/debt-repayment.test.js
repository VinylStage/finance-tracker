'use strict';
const { test, describe, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 실사용 DB 를 건드리지 않는다.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-repay-'));
process.env.DB_PATH = path.join(dir, 'test.db');

const db = require('../src/db/init');
const {
  allocateRepayment, validateRepayment, recordRepayment,
  listRepayments, deleteRepayment, balanceTimeline,
} = require('../src/services/debtRepayment');
const { createRepaymentDerived, derivedRowsForDebt } = require('../src/services/derivedTransactions');
const { accrueInterest } = require('../src/services/interest/creditLine');

after(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function makeDebt(balance = 3566196) {
  const info = db.prepare(`
    INSERT INTO debts (name, balance, annual_rate, type, loan_type, credit_limit, interest_day)
    VALUES ('마이너스통장', ?, 4.17, '마이너스통장', 'credit_line', 4800000, 30)
  `).run(balance);
  return Number(info.lastInsertRowid);
}

beforeEach(() => {
  db.prepare('DELETE FROM transactions').run();
  db.prepare('DELETE FROM debt_repayments').run();
  db.prepare('DELETE FROM debt_interest_log').run();
  db.prepare('DELETE FROM debt_rate_history').run();
  db.prepare('DELETE FROM debts').run();
});

describe('A. 마이그레이션 012', () => {
  test('A-1. debt_repayments 테이블과 인덱스가 생긴다', () => {
    const t = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='debt_repayments'").get();
    assert.ok(t, '테이블 없음');
    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_repay_debt'").get();
    assert.ok(idx, '인덱스 없음');
  });

  test('A-2. debt_interest_log 와 같은 모양이다', () => {
    // 두 이력을 같은 방식으로 읽어야 합치는 코드가 단순해진다.
    const cols = db.prepare('PRAGMA table_info(debt_repayments)').all().map((c) => c.name);
    for (const c of ['balance_before', 'balance_after', 'memo', 'created_at']) {
      assert.ok(cols.includes(c), `${c} 없음`);
    }
  });
});

describe('B. 원금·이자 배분', () => {
  test('B-1. 이자를 먼저 갚고 남은 것이 원금이다', () => {
    assert.deepStrictEqual(
      allocateRepayment({ amount: 100000, outstandingInterest: 12222 }),
      { interest_portion: 12222, principal_portion: 87778 }
    );
  });

  test('B-2. 상환액이 이자보다 적으면 전액이 이자분이다', () => {
    assert.deepStrictEqual(
      allocateRepayment({ amount: 5000, outstandingInterest: 12222 }),
      { interest_portion: 5000, principal_portion: 0 }
    );
  });

  test('B-3. 미수 이자가 없으면 전액이 원금이다', () => {
    // 이 앱은 이자를 잔액에 편입하므로 실무상 대부분 이 경우다.
    assert.deepStrictEqual(
      allocateRepayment({ amount: 100000 }),
      { interest_portion: 0, principal_portion: 100000 }
    );
  });

  test('B-4. 배분 합이 항상 상환액과 같다', () => {
    for (const [amount, owed] of [[100000, 0], [100000, 12222], [5000, 12222], [1, 1]]) {
      const r = allocateRepayment({ amount, outstandingInterest: owed });
      assert.strictEqual(r.interest_portion + r.principal_portion, amount);
    }
  });

  test('B-5. 0 이하 상환액은 거부한다', () => {
    assert.throws(() => allocateRepayment({ amount: 0 }));
    assert.throws(() => allocateRepayment({ amount: -1 }));
    assert.throws(() => allocateRepayment({ amount: 1000.5 }));
  });
});

describe('C. 입력 검증', () => {
  const cases = [
    { name: '금액 0 거부', input: { amount: 0, repaid_on: '2026-05-01' }, fails: true },
    { name: '소수 금액 거부', input: { amount: 1000.5, repaid_on: '2026-05-01' }, fails: true },
    { name: '날짜 누락 거부', input: { amount: 1000 }, fails: true },
    { name: '날짜 형식 거부', input: { amount: 1000, repaid_on: '2026/05/01' }, fails: true },
    { name: '정상 통과', input: { amount: 1000, repaid_on: '2026-05-01' }, fails: false },
    {
      name: '배분 합이 안 맞으면 거부',
      input: { amount: 100000, repaid_on: '2026-05-01', principal_portion: 90000, interest_portion: 5000 },
      fails: true,
    },
    {
      name: '배분 합이 맞으면 통과',
      input: { amount: 100000, repaid_on: '2026-05-01', principal_portion: 90000, interest_portion: 10000 },
      fails: false,
    },
    {
      name: '음수 배분 거부',
      input: { amount: 100000, repaid_on: '2026-05-01', principal_portion: 110000, interest_portion: -10000 },
      fails: true,
    },
  ];

  for (const c of cases) {
    test(`C. ${c.name}`, () => {
      const r = validateRepayment(c.input);
      if (c.fails) {
        assert.ok(r, '거부돼야 하는데 통과했다');
        for (const bad of ['amount', 'repaid_on', 'principal_portion', 'interest_portion']) {
          assert.ok(!r.includes(bad), `문구에 내부 필드명 노출: ${r}`);
        }
      } else {
        assert.strictEqual(r, null);
      }
    });
  }
});

describe('D. 상환 기록', () => {
  test('D-1. 이력이 남고 잔액이 줄어든다', () => {
    const id = makeDebt(3566196);
    const r = recordRepayment(db, id, { amount: 500000, repaid_on: '2026-05-01' });

    assert.strictEqual(r.balance_before, 3566196);
    assert.strictEqual(r.balance_after, 3066196);
    assert.strictEqual(db.prepare('SELECT balance FROM debts WHERE id=?').get(id).balance, 3066196);
    assert.strictEqual(listRepayments(db, id).length, 1);
  });

  test('D-2. 원금분만 잔액에서 뺀다', () => {
    // 이자분은 이미 잔액에 편입돼 있던 이자를 갚는 것이라 전액을 빼면 이중으로 준다.
    const id = makeDebt(1000000);
    const r = recordRepayment(db, id, {
      amount: 100000, repaid_on: '2026-05-01', outstandingInterest: 12222,
    });
    assert.strictEqual(r.interest_portion, 12222);
    assert.strictEqual(r.principal_portion, 87778);
    assert.strictEqual(r.balance_after, 1000000 - 87778);
  });

  test('D-3. 여러 번 갚으면 이력이 쌓인다', () => {
    const id = makeDebt(1000000);
    recordRepayment(db, id, { amount: 100000, repaid_on: '2026-05-01' });
    recordRepayment(db, id, { amount: 200000, repaid_on: '2026-06-01' });
    assert.strictEqual(listRepayments(db, id).length, 2);
    assert.strictEqual(db.prepare('SELECT balance FROM debts WHERE id=?').get(id).balance, 700000);
  });

  test('D-4. 없는 부채면 null', () => {
    assert.strictEqual(recordRepayment(db, 999999, { amount: 1000, repaid_on: '2026-05-01' }), null);
  });
});

describe('E. 상환 취소', () => {
  test('E-1. 지우면 원금분만큼 잔액이 되돌아온다', () => {
    const id = makeDebt(1000000);
    const r = recordRepayment(db, id, { amount: 300000, repaid_on: '2026-05-01' });
    deleteRepayment(db, r.id);
    assert.strictEqual(db.prepare('SELECT balance FROM debts WHERE id=?').get(id).balance, 1000000);
    assert.strictEqual(listRepayments(db, id).length, 0);
  });

  test('E-2. 그 뒤에 있었던 상환은 되감기지 않는다', () => {
    // balance_after 로 되돌리면 사이에 있던 다른 기록까지 날아간다.
    const id = makeDebt(1000000);
    const first = recordRepayment(db, id, { amount: 100000, repaid_on: '2026-05-01' });
    recordRepayment(db, id, { amount: 200000, repaid_on: '2026-06-01' });

    deleteRepayment(db, first.id);
    // 1,000,000 − 200,000 = 800,000 (첫 상환만 되돌아왔다)
    assert.strictEqual(db.prepare('SELECT balance FROM debts WHERE id=?').get(id).balance, 800000);
  });

  test('E-3. 없는 기록이면 null', () => {
    assert.strictEqual(deleteRepayment(db, 999999), null);
  });
});

describe('F. 거래내역 반영', () => {
  test('F-1. 상환이 거래 1건을 만든다', () => {
    const id = makeDebt(1000000);
    const r = recordRepayment(db, id, { amount: 300000, repaid_on: '2026-05-01' });
    assert.deepStrictEqual(createRepaymentDerived(db, r.id), { created: 1 });

    const rows = db.prepare("SELECT * FROM transactions WHERE origin='debt_repayment'").all();
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].amount, 300000);
    assert.strictEqual(rows[0].date, '2026-05-01');
    assert.strictEqual(rows[0].origin_ref_table, 'debt_repayments');
    assert.strictEqual(rows[0].origin_ref_id, r.id);
  });

  test('F-2. 이자분이 있으면 메모에 배분을 적는다', () => {
    const id = makeDebt(1000000);
    const r = recordRepayment(db, id, {
      amount: 100000, repaid_on: '2026-05-01', outstandingInterest: 12222,
    });
    createRepaymentDerived(db, r.id);
    const row = db.prepare("SELECT memo FROM transactions WHERE origin='debt_repayment'").get();
    assert.ok(row.memo.includes('원금 87,778원'));
    assert.ok(row.memo.includes('이자 12,222원'));
  });

  test('F-3. 부채 화면 목록에 이자와 상환이 함께 나온다', () => {
    const id = makeDebt(1000000);
    const logId = Number(db.prepare(`
      INSERT INTO debt_interest_log (debt_id, log_date, rate_at_time, interest_amount, balance_before, balance_after)
      VALUES (?, '2026-04-30', 4.17, 12222, 1000000, 1012222)
    `).run(id).lastInsertRowid);
    require('../src/services/derivedTransactions').createDebtInterestDerived(db, logId);

    const r = recordRepayment(db, id, { amount: 300000, repaid_on: '2026-05-01' });
    createRepaymentDerived(db, r.id);

    const rows = derivedRowsForDebt(db, id);
    assert.strictEqual(rows.length, 2);
    assert.deepStrictEqual(rows.map((x) => x.origin), ['debt_interest', 'debt_repayment']);
  });

  test('F-4. 거래내역에서 고칠 수 없다', () => {
    const { isEditable, lockedMessage } = require('../src/services/transactionOrigin');
    assert.strictEqual(isEditable({ origin: 'debt_repayment' }), false);
    const msg = lockedMessage({ origin: 'debt_repayment' });
    assert.ok(msg.includes('부채 화면'));
    assert.ok(!msg.includes('debt_repayment'), `내부 값 노출: ${msg}`);
  });
});

describe('G. 잔액 타임라인 — 이자와 상환을 합친다 (#286 입력)', () => {
  test('G-1. 두 이력이 시간순으로 이어진다', () => {
    const id = makeDebt(1000000);
    db.prepare(`
      INSERT INTO debt_interest_log (debt_id, log_date, rate_at_time, interest_amount, balance_before, balance_after)
      VALUES (?, '2026-04-30', 4.17, 3424, 1000000, 1003424)
    `).run(id);
    db.prepare(`
      INSERT INTO debt_repayments (debt_id, repaid_on, amount, principal_portion, interest_portion, balance_before, balance_after)
      VALUES (?, '2026-05-15', 500000, 500000, 0, 1003424, 503424)
    `).run(id);

    assert.deepStrictEqual(balanceTimeline(db, id, 503424), [
      { from: '1900-01-01', balance: 1000000 },
      { from: '2026-04-30', balance: 1003424 },
      { from: '2026-05-15', balance: 503424 },
    ]);
  });

  test('G-2. 같은 날이면 이자가 먼저다', () => {
    // 이자가 붙고 나서 갚는 것이 실제 순서다.
    const id = makeDebt(1000000);
    db.prepare(`
      INSERT INTO debt_interest_log (debt_id, log_date, rate_at_time, interest_amount, balance_before, balance_after)
      VALUES (?, '2026-05-01', 4.17, 3424, 1000000, 1003424)
    `).run(id);
    db.prepare(`
      INSERT INTO debt_repayments (debt_id, repaid_on, amount, principal_portion, interest_portion, balance_before, balance_after)
      VALUES (?, '2026-05-01', 500000, 500000, 0, 1003424, 503424)
    `).run(id);

    const t = balanceTimeline(db, id, 503424);
    assert.strictEqual(t[t.length - 1].balance, 503424);
  });

  test('G-3. 이력이 없으면 현재 잔액이 처음부터 유지된 것으로 본다', () => {
    const id = makeDebt(1000000);
    assert.deepStrictEqual(balanceTimeline(db, id, 1000000), [
      { from: '1900-01-01', balance: 1000000 },
    ]);
  });

  test('G-4. 상환이 이자 계산에 실제로 반영된다', () => {
    // 이 이슈의 존재 이유 — 상환 이력이 없으면 과거 이자를 재계산할 수 없다.
    const id = makeDebt(3566196);
    recordRepayment(db, id, { amount: 1566196, repaid_on: '2026-03-16' });

    const timeline = balanceTimeline(db, id, 2000000);
    const { interest } = accrueInterest({
      balanceTimeline: timeline,
      rateTimeline: [{ from: '2026-01-01', annual_rate: 4.17 }],
      from: '2026-03-01', to: '2026-03-31',
    });

    // 3/1~3/16 은 3,566,196, 3/16~3/31 은 2,000,000
    const expected = Math.floor((3566196 * 0.0417 * 15) / 365)
      + Math.floor((2000000 * 0.0417 * 15) / 365);
    assert.strictEqual(interest, expected);

    // 상환을 무시하고 원래 잔액으로 계산하면 더 크다.
    const ignoring = accrueInterest({
      balanceTimeline: [{ from: '1900-01-01', balance: 3566196 }],
      rateTimeline: [{ from: '2026-01-01', annual_rate: 4.17 }],
      from: '2026-03-01', to: '2026-03-31',
    }).interest;
    assert.ok(ignoring > interest, '상환이 이자에 반영되지 않았다');
  });
});
