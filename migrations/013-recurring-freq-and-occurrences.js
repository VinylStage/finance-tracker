'use strict';

// 반복 규칙을 일·월·연 주기와 적용 기간으로 확장한다(#278).
//
// 기존 규칙은 월 단위 고정(day_of_month)이었다. freq/interval 기본값이
// 'monthly'/1 이라 기존 행은 그대로 월 반복으로 남는다 — 마이그레이션이 동작을
// 바꾸지 않는다.
//
// recurring_rule_months 의 year_month 는 월 단위 전제라 daily 규칙의 멱등성을
// 보장할 수 없다(한 달에 여러 번 발생한다). 발생일 단위 테이블로 바꾸되,
// 기존 테이블은 지우지 않고 남겨 롤백 여지를 둔다.
function up(db) {
  const cols = db.prepare('PRAGMA table_info(recurring_rules)').all().map((c) => c.name);

  const add = (name, ddl) => {
    if (!cols.includes(name)) db.exec(`ALTER TABLE recurring_rules ADD COLUMN ${ddl}`);
  };

  add('freq', `freq TEXT NOT NULL DEFAULT 'monthly'`);
  add('interval', `interval INTEGER NOT NULL DEFAULT 1`);
  add('starts_on', `starts_on TEXT`);
  add('ends_on', `ends_on TEXT`);
  add('month_of_year', `month_of_year INTEGER`);
  add('last_run_on', `last_run_on TEXT`);

  // UNIQUE(rule_id, occurred_on) 이 멱등성의 근거다. catch-up(#279)이 같은
  // 날짜를 두 번 만들려 하면 DB 가 거부한다. 애플리케이션 로직으로 "이미 있나
  // 확인 후 삽입" 하면 확인과 삽입 사이에 경쟁이 생긴다.
  db.exec(`
    CREATE TABLE IF NOT EXISTS recurring_occurrences (
      id INTEGER PRIMARY KEY,
      rule_id INTEGER NOT NULL REFERENCES recurring_rules(id) ON DELETE CASCADE,
      occurred_on TEXT NOT NULL,
      status TEXT NOT NULL,
      transaction_id INTEGER REFERENCES transactions(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(rule_id, occurred_on)
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_recurring_occ_rule
      ON recurring_occurrences(rule_id, occurred_on);
  `);

  // 기존 월 단위 기록을 발생일 단위로 옮긴다. day_of_month 가 그 달에 없는
  // 경우(1/31 규칙의 2월)는 말일로 당긴다 — A안 확정 사항과 같은 규칙이다.
  // date(year_month-01, '+1 month', '-1 day') 가 그 달 말일이고, MIN 으로 고른다.
  const migrated = db.prepare(`
    SELECT m.rule_id, m.year_month, m.status, m.transaction_id, m.created_at,
           r.day_of_month
    FROM recurring_rule_months m
    JOIN recurring_rules r ON r.id = m.rule_id
  `).all();

  const insert = db.prepare(`
    INSERT OR IGNORE INTO recurring_occurrences
      (rule_id, occurred_on, status, transaction_id, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const row of migrated) {
    const lastDay = db.prepare(
      `SELECT CAST(strftime('%d', date(? || '-01', '+1 month', '-1 day')) AS INT) AS d`
    ).get(row.year_month).d;
    const day = Math.min(row.day_of_month, lastDay);
    const occurredOn = `${row.year_month}-${String(day).padStart(2, '0')}`;
    insert.run(row.rule_id, occurredOn, row.status, row.transaction_id, row.created_at);
  }
}

module.exports = { up };
