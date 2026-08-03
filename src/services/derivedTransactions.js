'use strict';

const crypto = require('node:crypto');
const { computeSchedule } = require('./installmentInterest');
const { policyAt } = require('./cardPolicy');
const { DERIVED_CATEGORIES } = require('../constants');
const { localYearMonth } = require('../utils/date');

// 파생 거래의 생성·재생성·삭제(#269).
//
// ─────────────────────────────────────────────────────────────────────────
// 이 모듈이 하나로 모여 있는 이유
//
// 파생 거래를 만드는 경로가 셋(할부·리볼빙·부채이자)이고, 지우는 경로는 그보다
// 많다(원본 삭제, 원본 수정에 따른 재생성, 부모 부채 삭제). 경로마다 SQL 을
// 적으면 한 곳을 빠뜨렸을 때 고아 행이 남는다. transactionOrigin.js 가 잠금
// 판정을 한곳에 모은 것과 같은 이유다.
//
// DB 핸들을 인자로 받고 require 하지 않는다. 실사용 DB 를 건드리지 않고
// 테스트에서 격리 DB 로 전부 검증할 수 있어야 하기 때문이다.
// ─────────────────────────────────────────────────────────────────────────
//
// 집계에 대한 약속: 이 기능은 기존 화면의 수치를 바꾸지 않는다.
//
//   할부 회차     payment_style='할부'    → EXPENSE_CASE 가 이미 제외한다.
//                                          대시보드는 installmentsDue 로 따로 센다.
//   리볼빙 수수료 payment_style='리볼빙'  → 같음. 수수료는 next_carried_balance 에
//                                          얹히는 발생액이지 그 달의 현금 유출이 아니다.
//   부채 이자     payment_style='해당없음' → 위 두 규칙에 안 걸려서 aggregation.js 가
//                                          origin 으로 따로 제외한다. 이자는 잔액에
//                                          자본화되고 실제 상환은 사용자가 따로
//                                          거래로 넣는다. 둘 다 세면 이중계산이다.
//
// 즉 파생 거래는 지금은 "기록과 표시" 다. 집계를 파생 거래 기준으로 옮기는 것은
// 화면 전체가 걸린 별도 결정이라 M7·M11 로 넘긴다.

// 프리뷰와 실제 실행 사이에 원본이 바뀌었을 때(ADR 0008).
// 실행을 막고 다시 확인받는다 — 사용자가 본 프리뷰와 다른 것이 실행되면
// 프리뷰가 있으나 마나다.
class PreviewMismatchError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PreviewMismatchError';
  }
}

// 프리뷰 없이 대량 변경을 실행하려 할 때. 화면이 아니라 API 를 직접 호출하는
// 경로를 막는다(ADR 0008 "지켜지지 않을 수 있는 지점").
class PreviewRequiredError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PreviewRequiredError';
  }
}

const INSERT_SQL = `
  INSERT INTO transactions
    (date, category_id, amount, payment_method_id, payment_style, merchant, memo,
     installment_id, origin, origin_ref_table, origin_ref_id, origin_seq, origin_seq_total)
  VALUES (@date, @category_id, @amount, @payment_method_id, @payment_style, @merchant, @memo,
          @installment_id, @origin, @origin_ref_table, @origin_ref_id, @origin_seq, @origin_seq_total)
`;

// 파생 카테고리를 필요할 때 만든다.
//
// 마이그레이션에서 시드하지 않는 이유는 db/init.js 가 마이그레이션을 먼저 돌리고
// 그 다음 "카테고리 0건이면 기본 카테고리 시드" 를 판단하기 때문이다. 여기서
// 넣으면 새 DB 에서 기본 카테고리 23종이 통째로 안 생긴다.
// 사용자가 카테고리를 지웠을 때 스스로 복구되는 부수 효과도 있다.
function ensureCategoryId(db, kind) {
  const spec = DERIVED_CATEGORIES[kind];
  if (!spec) throw new Error(`unknown derived kind: ${kind}`);
  const found = findCategoryId(db, kind);
  if (found) return found;
  const info = db.prepare('INSERT INTO categories (major_type, name) VALUES (?, ?)')
    .run(spec.major_type, spec.name);
  return Number(info.lastInsertRowid);
}

// 읽기 전용 조회. 프리뷰 계산이 카테고리를 만들어 버리면 "프리뷰는 DB 를 바꾸지
// 않는다" 가 깨진다. 없으면 0 을 돌려주고 실행 시점에 만든다 — 계획의 금액과
// 회차 수는 카테고리 id 와 무관하므로 프리뷰 결과가 달라지지 않는다.
function findCategoryId(db, kind) {
  const spec = DERIVED_CATEGORIES[kind];
  const found = db.prepare('SELECT id FROM categories WHERE major_type=? AND name=?')
    .get(spec.major_type, spec.name);
  return found ? found.id : 0;
}

// 어떤 원본이 만든 파생 거래들. 화면 목록(#270)과 재생성 계산이 같이 쓴다.
function derivedRowsFor(db, refTable, refId) {
  return db.prepare(`
    SELECT * FROM transactions
    WHERE origin_ref_table = ? AND origin_ref_id = ? AND origin != 'manual'
    ORDER BY date ASC, id ASC
  `).all(refTable, refId);
}

// 원본이 사라질 때 딸린 파생 거래도 지운다. 고아 행 방지의 단일 경로.
function deleteDerivedFor(db, refTable, refIds) {
  const ids = (Array.isArray(refIds) ? refIds : [refIds]).filter((v) => v !== undefined && v !== null);
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const info = db.prepare(`
    DELETE FROM transactions
    WHERE origin_ref_table = ? AND origin_ref_id IN (${placeholders}) AND origin != 'manual'
  `).run(refTable, ...ids);
  return info.changes;
}

function withCommas(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function monthOf(dateOrMonth) {
  return String(dateOrMonth).slice(0, 7);
}

// ─────────────────────────── 할부 ───────────────────────────

// 정책이 없을 때 쓰는 자리표. 이자율 0 이라 computeSchedule 은 원금만 쪼갠다.
// 수수료는 기존 fee_per_month 를 회차마다 그대로 얹어 따로 채운다 — #266 정책을
// 아직 입력하지 않은 사용자(#271 이전)도 할부를 쓸 수 있어야 한다.
const NO_POLICY = { policy_type: '유이자', annual_rate: 0, free_from_sequence: 0 };

// 어느 시점의 정책을 쓸 것인가.
//
// 이슈 본문은 "그 회차의 청구월에 유효했던 정책" 을 적어 뒀지만 구매 시점 기준을
// 쓴다. 실제 카드사가 구매 시점 약정을 할부 종료까지 유지하고, 무엇보다 이쪽이
// "과거 청구액이 소급해서 바뀌지 않는다" 를 더 강하게 보장한다 — 회차마다 그때의
// 정책을 다시 찾으면 정책을 새로 등록하는 것만으로 지난 회차 금액이 움직인다.
function resolveInstallmentPolicy(db, installment) {
  if (!installment.payment_method_id) return null;
  return policyAt(db, installment.payment_method_id, installment.months, installment.purchase_date);
}

// 할부 하나가 만들어야 할 거래 행들. DB 를 읽기만 한다.
// category_id 는 호출자가 채운다(프리뷰 시점에는 아직 없을 수 있다).
function buildInstallmentRows(db, installment, categoryId = 0) {
  const policy = resolveInstallmentPolicy(db, installment);
  const schedule = computeSchedule({
    totalAmount: installment.total_amount,
    months: installment.months,
    policy: policy || NO_POLICY,
    startBillingMonth: installment.start_billing_month,
    paidOffOn: installment.paid_off_on || null,
  });

  const flatFee = policy ? 0 : (installment.fee_per_month || 0);
  const total = schedule.length;

  const rows = schedule.map((s) => {
    const interest = policy ? s.interest : flatFee;
    return {
      date: `${s.billing_month}-01`,
      category_id: categoryId,
      amount: s.principal + interest,
      payment_method_id: installment.payment_method_id || null,
      payment_style: '할부',
      merchant: installment.merchant,
      memo: interest > 0
        ? `${s.sequence}/${total}회차 · 원금 ${withCommas(s.principal)}원 · 수수료 ${withCommas(interest)}원`
        : `${s.sequence}/${total}회차 · 원금 ${withCommas(s.principal)}원`,
      installment_id: installment.id,
      origin: 'installment',
      origin_ref_table: 'installments',
      origin_ref_id: installment.id,
      origin_seq: s.sequence,
      // 조기 완납이면 실제로 청구되는 회차 수가 개월수보다 적다. 화면에
      // "3/12회차" 가 아니라 "3/5회차" 가 보여야 사실과 맞는다.
      origin_seq_total: total,
    };
  });

  return { rows, policy };
}

// 청구월별 합계. 프리뷰의 전/후 비교는 회차 번호가 아니라 청구월로 맞춘다 —
// 개월수가 바뀌면 회차 번호끼리 짝이 안 맞기 때문이다.
function totalsByMonth(rows) {
  const m = new Map();
  for (const r of rows) {
    const key = monthOf(r.date);
    m.set(key, (m.get(key) || 0) + r.amount);
  }
  return m;
}

function sumAmount(rows) {
  return rows.reduce((s, r) => s + r.amount, 0);
}

// 계획의 지문. 프리뷰 이후 원본이나 기존 파생 거래가 바뀌면 값이 달라진다.
//
// 지문에 무엇을 넣는가가 곧 "무엇이 바뀌면 다시 확인받는가" 다.
//
//   existing  DB 에 있는 할부 행 그대로. 이게 없으면 덮어쓸 값(overrides)이 같은
//             한 원본이 바뀐 것을 못 잡는다. persistInstallment 는 overrides 에
//             없는 필드까지 되쓰므로, 그 사이 누가 상태를 바꿨으면 조용히 되돌아간다
//   overrides 적용하려는 변경분. 같은 원본에 다른 수정을 적용하는 것을 구분한다
//   before    지워질 행. 다른 경로가 파생 거래를 이미 손댔으면 달라진다
//   after     생길 행 전체. 금액만 넣으면 가맹점명만 바뀌는 수정이 지문을 통과해
//             사용자가 본 적 없는 내용이 저장된다
//
// category_id 는 뺀다 — 프리뷰 시점에 아직 없을 수 있고 금액에 영향을 주지 않는다.
function planFingerprint({ installmentId, existing, overrides, before, after }) {
  const stripCategory = (r) => {
    const copy = { ...r };
    delete copy.category_id;
    return copy;
  };
  const material = JSON.stringify({
    id: installmentId,
    existing,
    overrides: sortedKeys(overrides),
    before: before.map((r) => ({
      date: r.date, amount: r.amount, memo: r.memo, merchant: r.merchant,
      origin_seq: r.origin_seq, origin_seq_total: r.origin_seq_total,
    })),
    after: after.map(stripCategory),
  });
  return crypto.createHash('sha256').update(material).digest('hex').slice(0, 32);
}

// 키 순서가 달라도 같은 지문이 나오게 한다. JSON.stringify 는 삽입 순서를 따르는데,
// 같은 수정을 화면이 다른 순서로 보내면 프리뷰가 이유 없이 만료된 것처럼 보인다.
function sortedKeys(obj) {
  return Object.keys(obj || {}).sort().reduce((acc, k) => {
    acc[k] = obj[k] === null || obj[k] === undefined ? null : String(obj[k]);
    return acc;
  }, {});
}

/**
 * 할부 파생 거래 재생성 계획. **DB 를 바꾸지 않는다**(ADR 0008).
 *
 * overrides 를 받는 이유는 "이렇게 고치면 무엇이 바뀌는가" 를 고치기 전에 보여야
 * 하기 때문이다. 저장한 뒤 프리뷰를 띄우면 이미 늦다.
 *
 * @param {object} db
 * @param {number} installmentId
 * @param {object} [overrides] 적용하려는 할부 변경분(PUT 본문과 같은 모양)
 * @returns {object|null} 계획. 할부가 없으면 null
 */
function planInstallmentDerived(db, installmentId, overrides = {}) {
  const existing = db.prepare('SELECT * FROM installments WHERE id=?').get(installmentId);
  if (!existing) return null;

  const target = { ...existing, ...overrides, id: existing.id };
  const { rows: after, policy } = buildInstallmentRows(db, target, findCategoryId(db, 'installment'));
  const before = derivedRowsFor(db, 'installments', installmentId);

  const beforeByMonth = totalsByMonth(before);
  const afterByMonth = totalsByMonth(after);
  const [curY, curM] = localYearMonth();
  const currentMonth = `${curY}-${String(curM).padStart(2, '0')}`;

  const months = [...new Set([...beforeByMonth.keys(), ...afterByMonth.keys()])].sort();
  const changed = months
    .map((month) => ({
      billing_month: month,
      before: beforeByMonth.get(month) || 0,
      after: afterByMonth.get(month) || 0,
      is_past: month <= currentMonth,
    }))
    .filter((r) => r.before !== r.after);

  const beforeTotal = sumAmount(before);
  const afterTotal = sumAmount(after);

  return {
    installment_id: installmentId,
    target,
    // 실행이 그대로 쓰는 행 목록. 프리뷰와 실행이 같은 배열을 쓰므로 둘이
    // 어긋날 수 없다(ADR 0008 이 지적한 비용 항목의 대응).
    insert_rows: after,
    // 어떤 정책으로 계산했는지 보여준다. 정책이 없으면 화면이 "고정 수수료로
    // 계산했다" 를 안내할 수 있어야 한다.
    policy_applied: policy
      ? { policy_type: policy.policy_type, annual_rate: policy.annual_rate, free_from_sequence: policy.free_from_sequence }
      : null,
    delete_count: before.length,
    create_count: after.length,
    before_total: beforeTotal,
    after_total: afterTotal,
    delta: afterTotal - beforeTotal,
    rows_before: before.map((r) => ({
      billing_month: monthOf(r.date), sequence: r.origin_seq, amount: r.amount,
    })),
    rows_after: after.map((r) => ({
      billing_month: monthOf(r.date), sequence: r.origin_seq, amount: r.amount,
    })),
    changed_months: changed,
    past_affected: changed.filter((r) => r.is_past),
    // M12(#300) 전까지는 실행취소가 없다. 되돌리는 방법을 사실대로 적는다.
    reversible: 'backup',
    fingerprint: planFingerprint({ installmentId, existing, overrides, before, after }),
  };
}

/**
 * 계획을 실행한다. 삭제 + 재삽입 + (선택) 원본 갱신이 **한 트랜잭션**이다.
 *
 * 하나의 논리적 작업으로 묶는 것이 #269 의 확정 사항이다(M12 실행취소 대비).
 * 6개월치를 지우고 12개월치를 넣는 동안 중간 상태가 보이면 안 된다.
 *
 * @param {object} db
 * @param {number} installmentId
 * @param {object} opts
 * @param {object}  [opts.overrides]              같이 반영할 할부 변경분
 * @param {string}  [opts.fingerprint]            프리뷰가 준 지문
 * @param {boolean} [opts.requirePreview=true]    프리뷰 확인을 강제할 것인가
 * @param {boolean} [opts.persistInstallment=false] overrides 를 installments 에도 쓸 것인가
 */
function applyInstallmentDerived(db, installmentId, opts = {}) {
  const {
    overrides = {}, fingerprint = null,
    requirePreview = true, persistInstallment = false,
  } = opts;

  const plan = planInstallmentDerived(db, installmentId, overrides);
  if (!plan) return null;

  if (requirePreview) {
    if (!fingerprint) {
      throw new PreviewRequiredError('바뀌는 내용을 먼저 확인해 주세요. 미리보기를 거쳐야 저장할 수 있어요.');
    }
    if (fingerprint !== plan.fingerprint) {
      throw new PreviewMismatchError('미리보기를 본 뒤 내용이 달라졌어요. 다시 확인하고 저장해 주세요.');
    }
  }

  const insert = db.prepare(INSERT_SQL);
  const t = plan.target;

  const run = db.transaction(() => {
    const categoryId = ensureCategoryId(db, 'installment');
    if (persistInstallment) {
      db.prepare(`
        UPDATE installments
        SET purchase_date=?, merchant=?, total_amount=?, months=?, monthly_amount=?,
            fee_per_month=?, payment_method_id=?, start_billing_month=?, status=?, paid_off_on=?
        WHERE id=?
      `).run(
        t.purchase_date, t.merchant, t.total_amount, t.months, t.monthly_amount,
        t.fee_per_month, t.payment_method_id || null, t.start_billing_month,
        t.status, t.paid_off_on || null, installmentId
      );
    }
    deleteDerivedFor(db, 'installments', installmentId);
    for (const row of plan.insert_rows) insert.run({ ...row, category_id: categoryId });
  });
  run();

  return { ...plan, applied: true };
}

// ─────────────────────────── 리볼빙 ───────────────────────────

// 리볼빙 이력 1건이 만드는 수수료 거래를 원본 상태에 맞춘다.
//
// 프리뷰를 붙이지 않는다. ADR 0008 이 제외한 "사용자가 한 건씩 직접 하는 CRUD"
// 이고, 영향 범위가 방금 입력한 한 달치 한 건이다. 대신 결과 건수를 응답에
// 실어 조용히 넘어가지 않게 한다.
function syncRevolvingDerived(db, revolvingId) {
  const row = db.prepare(`
    SELECT r.*, p.name AS payment_method_name
    FROM revolving_history r
    LEFT JOIN payment_methods p ON r.payment_method_id = p.id
    WHERE r.id=?
  `).get(revolvingId);
  if (!row) return { created: 0, deleted: 0 };

  const interest = row.interest || 0;
  const insert = db.prepare(INSERT_SQL);

  let deleted = 0;
  let created = 0;
  const run = db.transaction(() => {
    deleted = deleteDerivedFor(db, 'revolving_history', revolvingId);
    // 수수료가 0 이면 거래를 만들지 않는다. 0원짜리 행은 목록만 어지럽힌다.
    if (interest > 0) {
      insert.run({
        date: `${row.month}-01`,
        category_id: ensureCategoryId(db, 'revolving'),
        amount: interest,
        payment_method_id: row.payment_method_id || null,
        payment_style: '리볼빙',
        merchant: row.payment_method_name || '리볼빙',
        memo: `${row.month} 리볼빙 수수료`,
        installment_id: null,
        origin: 'revolving',
        origin_ref_table: 'revolving_history',
        origin_ref_id: revolvingId,
        origin_seq: null,
        origin_seq_total: null,
      });
      created = 1;
    }
  });
  run();
  return { created, deleted };
}

// ─────────────────────────── 부채 이자 ───────────────────────────

// 이자 기록 1건이 거래 1건을 만든다. 이자 기록은 추가만 되고 수정되지 않으므로
// 재생성이 아니라 생성이다.
//
// 호출자(POST /api/debts/:id/interest)가 이미 트랜잭션 안에서 부르므로 여기서는
// 트랜잭션을 열지 않는다. 이자 기록·잔액 갱신·파생 거래가 한 덩어리여야 한다.
function createDebtInterestDerived(db, logId) {
  const log = db.prepare(`
    SELECT l.*, d.name AS debt_name
    FROM debt_interest_log l
    LEFT JOIN debts d ON l.debt_id = d.id
    WHERE l.id=?
  `).get(logId);
  if (!log || !log.interest_amount) return { created: 0 };

  db.prepare(INSERT_SQL).run({
    date: log.log_date,
    category_id: ensureCategoryId(db, 'debt_interest'),
    amount: log.interest_amount,
    payment_method_id: null,
    payment_style: '해당없음',
    merchant: log.debt_name || '대출',
    memo: `${log.debt_name || '대출'} 이자`,
    installment_id: null,
    origin: 'debt_interest',
    origin_ref_table: 'debt_interest_log',
    origin_ref_id: logId,
    origin_seq: null,
    origin_seq_total: null,
  });
  return { created: 1 };
}

// 부채 한 건이 만든 이자 거래 전부(#270 화면용).
// 파생 거래는 이자 기록 단위로 달리므로 부채 단위로 보려면 이력을 거쳐야 한다.
function derivedRowsForDebt(db, debtId) {
  return db.prepare(`
    SELECT t.* FROM transactions t
    JOIN debt_interest_log l ON t.origin_ref_id = l.id
    WHERE t.origin_ref_table = 'debt_interest_log' AND t.origin = 'debt_interest'
      AND l.debt_id = ?
    ORDER BY t.date ASC, t.id ASC
  `).all(debtId);
}

// 부채를 지우면 그 부채의 이자 기록이 만든 거래도 전부 지운다.
// 이자 기록 id 를 먼저 모은다 — 이력을 먼저 지우면 대상을 못 찾는다.
function deleteDebtDerived(db, debtId) {
  const logIds = db.prepare('SELECT id FROM debt_interest_log WHERE debt_id=?')
    .all(debtId).map((r) => r.id);
  return deleteDerivedFor(db, 'debt_interest_log', logIds);
}

module.exports = {
  PreviewMismatchError, PreviewRequiredError,
  ensureCategoryId, findCategoryId, derivedRowsFor, deleteDerivedFor,
  planInstallmentDerived, applyInstallmentDerived, planFingerprint,
  buildInstallmentRows, resolveInstallmentPolicy,
  syncRevolvingDerived, createDebtInterestDerived, deleteDebtDerived, derivedRowsForDebt,
};
