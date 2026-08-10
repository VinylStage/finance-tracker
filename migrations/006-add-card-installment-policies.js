'use strict';

// 카드사 할부 정책 마스터(#266).
//
// 지금까지 할부 수수료는 installments.fee_per_month 에 사용자가 직접 입력한
// 고정 금액이었다. 이자율도, 무이자 구간도, 부분무이자 개념도 없었다.
//
// effective_from / effective_to 를 두는 이유는 정책이 보통 1년 단위로 갱신되기
// 때문이다. 과거 할부의 이자를 재계산할 때 그 시점에 유효했던 정책을 써야 한다.
// 덮어쓰기로 관리하면 과거 계산이 소급해서 바뀐다.
//
// 부분무이자는 "12개월 중 앞 3개월 무이자" 를 months=12, policy_type='부분무이자',
// free_months=3, annual_rate=<나머지 9개월 이자율> 로 적는다.
//
// ※ 이 전제는 틀렸다. 실제 카드사는 앞 회차를 고객이 부담하고 뒤쪽을 면제한다
//    ("6개월 부분무이자(4회차부터 면제)"). migrations/009 가 free_months 를
//    free_from_sequence 로 옮기며 바로잡았다. 적용된 마이그레이션이라 SQL 은
//    그대로 두고 기록만 남긴다.
function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_installment_policies (
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

    CREATE INDEX IF NOT EXISTS idx_cip_method_months
      ON card_installment_policies(payment_method_id, months);
  `);
}

module.exports = { up };
