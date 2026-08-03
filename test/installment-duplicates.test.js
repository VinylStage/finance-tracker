'use strict';
const { test, describe, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 실사용 DB 를 건드리지 않는다.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-dup-'));
process.env.DB_PATH = path.join(dir, 'test.db');

const db = require('../src/db/init');
const {
  normalizeMerchant, merchantMatches, daysApart, findDuplicateCandidates,
  planResolve, dismiss, undismiss, CONFIDENCE,
} = require('../src/services/installmentDuplicates');

after(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

let categoryId;
beforeEach(() => {
  db.prepare('DELETE FROM installment_duplicate_dismissals').run();
  db.prepare('DELETE FROM transactions').run();
  db.prepare('DELETE FROM installments').run();
  categoryId = db.prepare("SELECT id FROM categories LIMIT 1").get().id;
});

function makeInstallment(over = {}) {
  const v = {
    purchase_date: '2026-07-06', merchant: '예스이십사 주식회사', total_amount: 232897,
    months: 6, monthly_amount: 38817, ...over,
  };
  return Number(db.prepare(`
    INSERT INTO installments (purchase_date, merchant, total_amount, months, monthly_amount, start_billing_month, status)
    VALUES (?, ?, ?, ?, ?, '2026-08', '진행중')
  `).run(v.purchase_date, v.merchant, v.total_amount, v.months, v.monthly_amount).lastInsertRowid);
}

function makeTx(over = {}) {
  const v = {
    date: '2026-07-06', merchant: '예스이십사(주)', amount: 232897,
    payment_style: '할부', origin: 'manual', ...over,
  };
  return Number(db.prepare(`
    INSERT INTO transactions (date, category_id, amount, merchant, payment_style, origin)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(v.date, categoryId, v.amount, v.merchant, v.payment_style, v.origin).lastInsertRowid);
}

describe('A. 가맹점명 정규화', () => {
  // 실데이터에 같은 가게가 세 가지 표기로 들어 있다.
  const cases = [
    ['예스이십사 주식회사', '예스이십사(주)', true],
    ['예스이십사 주식회사', '예스이십사', true],
    ['예스이십사(주)', '예스이십사', true],
    ['무신사', '무신사 스탠다드', true],
    ['크로켓', '무신사', false],
    ['', '무신사', false],
    [null, '무신사', false],
    // 한 글자짜리가 우연히 포함되는 것을 막는다
    ['A', 'ABC상사', false],
  ];
  for (const [a, b, expected] of cases) {
    test(`A. "${a}" ↔ "${b}" → ${expected}`, () => {
      assert.strictEqual(merchantMatches(a, b), expected);
    });
  }

  test('A-1. 법인 표기와 공백·괄호를 걷어낸다', () => {
    assert.strictEqual(normalizeMerchant('예스이십사 주식회사'), '예스이십사');
    assert.strictEqual(normalizeMerchant('예스이십사(주)'), '예스이십사');
    assert.strictEqual(normalizeMerchant('(유)무신사'), '무신사');
  });
});

describe('B. 날짜 근접', () => {
  test('B-1. 일수 차이를 절댓값으로 센다', () => {
    assert.strictEqual(daysApart('2026-07-06', '2026-07-06'), 0);
    assert.strictEqual(daysApart('2026-07-06', '2026-07-13'), 7);
    assert.strictEqual(daysApart('2026-07-13', '2026-07-06'), 7);
  });

  test('B-2. 월·연 경계를 넘어도 맞는다', () => {
    assert.strictEqual(daysApart('2026-06-30', '2026-07-01'), 1);
    assert.strictEqual(daysApart('2026-12-31', '2027-01-01'), 1);
  });
});

describe('C. 탐지', () => {
  test('C-1. 가맹점·금액·날짜가 맞으면 exact', () => {
    makeInstallment();
    makeTx();
    const found = findDuplicateCandidates(db);
    assert.strictEqual(found.length, 1);
    assert.strictEqual(found[0].confidence, CONFIDENCE.EXACT);
    assert.strictEqual(found[0].matched_on, 'total');
  });

  test('C-2. 월납입액과 맞으면 likely', () => {
    makeInstallment();
    makeTx({ amount: 38817 });
    const found = findDuplicateCandidates(db);
    assert.strictEqual(found[0].confidence, CONFIDENCE.LIKELY);
    assert.strictEqual(found[0].matched_on, 'monthly');
  });

  test('C-3. 할부로 적혔는데 연결될 할부가 없으면 review', () => {
    // 실데이터의 주된 패턴 — 할부로 적어 뒀지만 할부 등록은 안 한 거래.
    makeTx({ merchant: '등록안된가게', amount: 99999 });
    const found = findDuplicateCandidates(db);
    assert.strictEqual(found.length, 1);
    assert.strictEqual(found[0].confidence, CONFIDENCE.REVIEW);
    assert.strictEqual(found[0].installment_id, null);
  });

  test('C-4. 날짜가 창을 벗어나면 exact 가 아니다', () => {
    makeInstallment({ purchase_date: '2026-01-01' });
    makeTx({ date: '2026-07-06' });
    const found = findDuplicateCandidates(db, { dayWindow: 14 });
    // 할부 스타일이라 review 로는 남지만 특정 할부와 엮이지 않는다.
    assert.strictEqual(found[0].confidence, CONFIDENCE.REVIEW);
  });

  test('C-5. 창을 넓히면 잡힌다', () => {
    makeInstallment({ purchase_date: '2026-06-25' });
    makeTx({ date: '2026-07-06' });
    assert.strictEqual(findDuplicateCandidates(db, { dayWindow: 5 })[0].confidence, CONFIDENCE.REVIEW);
    assert.strictEqual(findDuplicateCandidates(db, { dayWindow: 30 })[0].confidence, CONFIDENCE.EXACT);
  });

  test('C-6. 파생 거래는 후보가 아니다', () => {
    // 계산 결과라 중복일 수 없다.
    makeInstallment();
    makeTx({ origin: 'installment' });
    assert.deepStrictEqual(findDuplicateCandidates(db), []);
  });

  test('C-7. 할부와 무관한 일시불 거래는 후보가 아니다', () => {
    makeInstallment();
    makeTx({ payment_style: '일시불', amount: 7700, merchant: '예스이십사' });
    assert.deepStrictEqual(findDuplicateCandidates(db), []);
  });

  test('C-8. 확신도가 높은 순으로 정렬된다', () => {
    makeInstallment();
    makeTx({ amount: 232897 });                                   // exact
    makeTx({ amount: 38817 });                                    // likely
    makeTx({ merchant: '딴가게', amount: 5000 });                  // review
    assert.deepStrictEqual(
      findDuplicateCandidates(db).map((c) => c.confidence),
      [CONFIDENCE.EXACT, CONFIDENCE.LIKELY, CONFIDENCE.REVIEW]
    );
  });

  test('C-9. 내부 컬럼을 통째로 흘리지 않는다', () => {
    makeInstallment();
    makeTx();
    const keys = Object.keys(findDuplicateCandidates(db)[0].transaction).sort();
    assert.deepStrictEqual(keys,
      ['amount', 'category_name', 'date', 'id', 'memo', 'merchant', 'payment_style']);
  });
});

describe('D. 판단 기억 (dismiss)', () => {
  test('D-1. 중복이 아니라고 하면 다음부터 안 나온다', () => {
    makeInstallment();
    const txId = makeTx();
    assert.strictEqual(findDuplicateCandidates(db).length, 1);

    assert.strictEqual(dismiss(db, [txId]), 1);
    assert.strictEqual(findDuplicateCandidates(db).length, 0);
  });

  test('D-2. 같은 것을 두 번 판단해도 한 번만 기록된다', () => {
    makeInstallment();
    const txId = makeTx();
    dismiss(db, [txId]);
    assert.strictEqual(dismiss(db, [txId]), 0);
  });

  test('D-3. 판단을 되돌리면 다시 나온다', () => {
    makeInstallment();
    const txId = makeTx();
    dismiss(db, [txId]);
    assert.strictEqual(undismiss(db, [txId]), 1);
    assert.strictEqual(findDuplicateCandidates(db).length, 1);
  });

  test('D-4. 거래를 지우면 판단도 사라진다', () => {
    makeInstallment();
    const txId = makeTx();
    dismiss(db, [txId]);
    db.prepare('DELETE FROM transactions WHERE id=?').run(txId);
    const left = db.prepare('SELECT COUNT(*) c FROM installment_duplicate_dismissals').get().c;
    assert.strictEqual(left, 0, '고아 판단 기록이 남았다');
  });
});

describe('E. 지우기 계획 (프리뷰)', () => {
  test('E-1. 대상과 합계를 알려준다', () => {
    makeInstallment();
    const a = makeTx();
    const b = makeTx({ amount: 38817 });
    const plan = planResolve(db, [a, b]);
    assert.strictEqual(plan.rows.length, 2);
    assert.strictEqual(plan.total, 232897 + 38817);
    assert.ok(plan.fingerprint);
  });

  test('E-2. 파생 거래가 섞이면 따로 골라낸다', () => {
    // 계산 결과를 중복으로 지우면 원본과 어긋난다.
    makeInstallment();
    const manual = makeTx();
    const derived = makeTx({ origin: 'installment' });
    const plan = planResolve(db, [manual, derived]);
    assert.strictEqual(plan.rows.length, 1);
    assert.strictEqual(plan.locked.length, 1);
    assert.strictEqual(plan.locked[0].id, derived);
  });

  test('E-3. 없는 id 를 알려준다', () => {
    const plan = planResolve(db, [999999]);
    assert.deepStrictEqual(plan.missing, [999999]);
  });

  test('E-4. 대상이 바뀌면 지문이 달라진다', () => {
    makeInstallment();
    const id = makeTx();
    const before = planResolve(db, [id]).fingerprint;
    db.prepare('UPDATE transactions SET amount = 1 WHERE id = ?').run(id);
    assert.notStrictEqual(planResolve(db, [id]).fingerprint, before);
  });

  test('E-5. 순서가 달라도 같은 지문이다', () => {
    makeInstallment();
    const a = makeTx();
    const b = makeTx({ amount: 38817 });
    assert.strictEqual(planResolve(db, [a, b]).fingerprint, planResolve(db, [b, a]).fingerprint);
  });

  test('E-6. 빈 목록은 계획이 없다', () => {
    const plan = planResolve(db, []);
    assert.deepStrictEqual(plan.rows, []);
    assert.strictEqual(plan.fingerprint, null);
  });

  test('E-7. 계획을 세워도 아무것도 지워지지 않는다', () => {
    // 프리뷰가 조용히 쓰면 ADR 0008 이 무의미해진다.
    makeInstallment();
    const id = makeTx();
    planResolve(db, [id]);
    assert.ok(db.prepare('SELECT id FROM transactions WHERE id=?').get(id));
  });
});
