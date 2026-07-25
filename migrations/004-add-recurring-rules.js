'use strict';

// #128: 완전 고정금액 고정지출 자동입력을 위한 반복 규칙 테이블.
// recurring_rule_months는 "이번 달에 이미 생성/건너뛰기 처리했는지"를 기록해
// 같은 규칙이 매번 확인 목록에 다시 뜨지 않게 한다.
function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS recurring_rules (
      id INTEGER PRIMARY KEY,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      merchant TEXT NOT NULL,
      amount INTEGER NOT NULL,
      day_of_month INTEGER NOT NULL,
      payment_method_id INTEGER REFERENCES payment_methods(id),
      payment_style TEXT NOT NULL DEFAULT '일시불',
      memo TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recurring_rule_months (
      id INTEGER PRIMARY KEY,
      rule_id INTEGER NOT NULL REFERENCES recurring_rules(id),
      year_month TEXT NOT NULL,
      status TEXT NOT NULL,
      transaction_id INTEGER REFERENCES transactions(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(rule_id, year_month)
    );
  `);
}

module.exports = { up };
