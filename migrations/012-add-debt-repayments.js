'use strict';

// 부분상환 이력(#287).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 별도 테이블인가
//
// 지금은 debts.balance 를 직접 고쳐서 상환을 반영한다. 잔액은 바뀌지만 **언제
// 얼마를 갚았는지가 남지 않는다.** 이자 계산은 잔액 이력에 의존하므로(특히 복리
// #286), 상환 이력이 없으면 과거 이자를 재계산할 수 없다.
//
// debt_interest_log 가 이자 발생을 남기듯 상환도 남긴다. 두 이력을 시간순으로
// 합치면 잔액 타임라인이 되고, 그게 #286 accrueInterest 의 입력이다.
//
// balance_before / balance_after 를 debt_interest_log 와 같은 모양으로 둔다.
// 두 이력을 같은 방식으로 읽을 수 있어야 합치는 코드가 단순해진다.
// ─────────────────────────────────────────────────────────────────────────
//
// 원금분과 이자분을 나눠 적는 이유는 상환액이 이자를 먼저 갚고 남은 것이 원금으로
// 가는 구조이기 때문이다. 이 배분이 이후 이자 계산의 입력이 된다.
//
// 다만 이 앱의 모델에서는 이자가 이미 잔액에 편입돼 있어(#286 복리, debt_interest_log
// 도 balance 에 더한다) 실무상 대부분 전액이 원금분이 된다. 사용자가 명세서에서
// 배분을 확인해 넣을 수 있도록 자리를 남겨 두는 성격이 크다.
function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS debt_repayments (
      id INTEGER PRIMARY KEY,
      debt_id INTEGER NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
      repaid_on TEXT NOT NULL,
      amount INTEGER NOT NULL,
      principal_portion INTEGER NOT NULL,
      interest_portion INTEGER NOT NULL,
      balance_before INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      memo TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_repay_debt ON debt_repayments(debt_id, repaid_on);
  `);
}

module.exports = { up };
