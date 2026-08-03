'use strict';

// 부분상환 이력(#287).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 이력이 필요한가
//
// debts.balance 를 직접 고치면 잔액은 바뀌지만 언제 얼마를 갚았는지가 남지 않는다.
// 이자 계산은 잔액 이력에 의존하므로(특히 복리 #286) 상환 이력이 없으면 과거 이자를
// 재계산할 수 없다.
//
// debt_interest_log(이자 발생)와 이 테이블(상환)을 시간순으로 합치면 잔액 타임라인이
// 되고, 그게 #286 accrueInterest 의 입력이다.
// ─────────────────────────────────────────────────────────────────────────
//
// DB 핸들을 인자로 받는다. 실사용 DB 없이 전부 테스트할 수 있어야 한다.

// 상환액을 이자분과 원금분으로 나눈다.
//
// **이자를 먼저 갚고 남은 것이 원금으로 간다.** 이 순서는 대출 일반의 관행이다.
//
// 다만 이 앱의 모델에서는 이자가 이미 잔액에 편입돼 있다 — #286 복리가 그렇고,
// debt_interest_log 도 balance 에 더한다. 그래서 미수 이자를 따로 들고 있지 않는
// 한 실무상 전액이 원금분이 된다. outstandingInterest 를 인자로 받는 이유는
// 사용자가 명세서에서 배분을 확인해 넣거나, credit_line 처럼 미수 이자를 계산할
// 수 있는 경우에 그 값을 쓰기 위해서다.
//
// @returns {{ interest_portion:number, principal_portion:number }}
function allocateRepayment({ amount, outstandingInterest = 0 }) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('amount must be a positive integer');
  }
  const owed = Math.max(0, Math.floor(outstandingInterest) || 0);
  const interest = Math.min(amount, owed);
  return { interest_portion: interest, principal_portion: amount - interest };
}

// 사용자에게 그대로 보이는 문구다(#231).
function validateRepayment({ amount, repaid_on, principal_portion, interest_portion }) {
  if (!Number.isInteger(amount) || amount <= 0) {
    return '상환 금액을 0보다 큰 정수로 입력해 주세요.';
  }
  if (!repaid_on || !/^\d{4}-\d{2}-\d{2}$/.test(repaid_on)) {
    return '상환한 날짜를 입력해 주세요.';
  }
  // 배분을 직접 넣은 경우에만 검사한다. 합이 안 맞으면 잔액이 어긋난다.
  if (principal_portion !== undefined && interest_portion !== undefined) {
    if (principal_portion < 0 || interest_portion < 0) {
      return '원금·이자 배분은 0 이상이어야 합니다.';
    }
    if (principal_portion + interest_portion !== amount) {
      return '원금과 이자를 더한 값이 상환 금액과 달라요. 배분을 확인해 주세요.';
    }
  }
  return null;
}

/**
 * 상환을 기록하고 잔액을 줄인다. 이력과 잔액이 한 트랜잭션이다.
 *
 * 잔액을 직접 고치는 대신 여기를 거치게 하는 것이 이 이슈의 요점이다 — 직접 고치면
 * 이력이 남지 않아 과거 이자를 재계산할 수 없다.
 *
 * 원금분만 잔액에서 뺀다. 이자분은 이미 잔액에 편입돼 있던 이자를 갚는 것이라
 * 전액을 빼면 이중으로 줄어든다.
 */
function recordRepayment(db, debtId, { amount, repaid_on, memo = null, outstandingInterest = 0,
  principal_portion, interest_portion }) {
  const debt = db.prepare('SELECT * FROM debts WHERE id=?').get(debtId);
  if (!debt) return null;

  const split = (principal_portion !== undefined && interest_portion !== undefined)
    ? { principal_portion, interest_portion }
    : allocateRepayment({ amount, outstandingInterest });

  const balanceBefore = debt.balance;
  const balanceAfter = balanceBefore - split.principal_portion;

  let id;
  db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO debt_repayments
        (debt_id, repaid_on, amount, principal_portion, interest_portion,
         balance_before, balance_after, memo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(debtId, repaid_on, amount, split.principal_portion, split.interest_portion,
           balanceBefore, balanceAfter, memo);
    id = Number(info.lastInsertRowid);

    db.prepare('UPDATE debts SET balance=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .run(balanceAfter, debtId);
  })();

  return { id, ...split, balance_before: balanceBefore, balance_after: balanceAfter };
}

function listRepayments(db, debtId) {
  return db.prepare(`
    SELECT * FROM debt_repayments WHERE debt_id = ? ORDER BY repaid_on DESC, id DESC
  `).all(debtId);
}

/**
 * 상환 기록을 지우고 잔액을 되돌린다.
 *
 * 지운 뒤 잔액은 **현재 잔액 + 그 상환의 원금분**이다. balance_after 로 되돌리지
 * 않는다 — 그 사이에 다른 상환이나 이자가 있었으면 그것들까지 되감긴다.
 */
function deleteRepayment(db, repaymentId) {
  const row = db.prepare('SELECT * FROM debt_repayments WHERE id=?').get(repaymentId);
  if (!row) return null;

  db.transaction(() => {
    db.prepare('UPDATE debts SET balance = balance + ?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .run(row.principal_portion, row.debt_id);
    db.prepare('DELETE FROM debt_repayments WHERE id=?').run(repaymentId);
  })();

  return row;
}

/**
 * 잔액 타임라인. 이자 발생과 상환을 시간순으로 합친다(#286 입력).
 *
 * 두 이력 모두 balance_after 를 남기므로 같은 방식으로 읽는다. 같은 날짜에 둘 다
 * 있으면 이자가 먼저다 — 이자가 붙고 나서 갚는 것이 실제 순서다.
 */
function balanceTimeline(db, debtId, currentBalance) {
  const rows = [
    ...db.prepare(`
      SELECT log_date AS at, balance_after, 0 AS ord FROM debt_interest_log WHERE debt_id = ?
    `).all(debtId),
    ...db.prepare(`
      SELECT repaid_on AS at, balance_after, 1 AS ord FROM debt_repayments WHERE debt_id = ?
    `).all(debtId),
  ].sort((a, b) => (a.at === b.at ? a.ord - b.ord : (a.at < b.at ? -1 : 1)));

  if (!rows.length) {
    // 이력이 없으면 현재 잔액이 처음부터 유지된 것으로 본다. 근거 없는 과거
    // 잔액을 지어내지 않는다.
    return [{ from: '1900-01-01', balance: currentBalance }];
  }

  // 첫 이력 이전 구간의 잔액은 그 이력의 balance_before 다.
  const first = db.prepare(`
    SELECT balance_before FROM (
      SELECT log_date AS at, balance_before, 0 AS ord FROM debt_interest_log WHERE debt_id = ?
      UNION ALL
      SELECT repaid_on AS at, balance_before, 1 AS ord FROM debt_repayments WHERE debt_id = ?
    ) ORDER BY at ASC, ord ASC LIMIT 1
  `).get(debtId, debtId);

  return [
    { from: '1900-01-01', balance: first ? first.balance_before : currentBalance },
    ...rows.map((r) => ({ from: r.at, balance: r.balance_after })),
  ];
}

module.exports = {
  allocateRepayment, validateRepayment, recordRepayment,
  listRepayments, deleteRepayment, balanceTimeline,
};
