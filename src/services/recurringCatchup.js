'use strict';
const { occurrencesBetween } = require('./recurrence');
const { runAs } = require('../utils/auditContext');

// 서버 기동 시점에 "마지막으로 처리한 날 이후 지금까지" 를 메운다(#279).
//
// 이 앱은 사용자가 열 때만 프로세스가 산다. 상시 구동 전제의 스케줄러는 이
// 배포 형태에서 동작하지 않으므로 기동 시점 따라잡기 방식을 쓴다.
//
// 상한을 두지 않는다. 공백이 길어도 규칙대로 전부 만든다 — 사용자가 규칙으로
// 이미 의사를 밝혔는데 "156건을 만들까요" 를 되묻는 것은 규칙의 취지를 없앤다.
//
// 멱등성 근거는 recurring_occurrences 의 UNIQUE(rule_id, occurred_on) 이다.
// 애플리케이션에서 "이미 있나 확인 후 삽입" 하면 확인과 삽입 사이에 경쟁이
// 생긴다. INSERT OR IGNORE 로 DB 가 판정하게 하고, 실제로 들어간 건에 대해서만
// 거래를 만든다.

function pad2(n) { return String(n).padStart(2, '0'); }

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// 두 날짜 문자열 중 늦은 쪽 / 이른 쪽. 'YYYY-MM-DD' 는 사전순 비교가 곧 시간순이다.
function maxDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}
function minDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

// 규칙 하나가 이번 기동에서 메워야 할 구간.
//
// from 은 last_run_on 을 그대로 쓴다(하루 더하지 않는다). 그날 이미 만든 발생일은
// UNIQUE 가 걸러내므로 안전하고, 하루를 더하면 last_run_on 당일에 생겼어야 할
// 발생을 놓칠 수 있다.
function windowFor(rule, today) {
  const from = maxDate(rule.last_run_on, rule.starts_on) || rule.starts_on || today;
  const to = minDate(today, rule.ends_on);
  return { from, to };
}

// 활성 규칙만 대상이다. is_active=0 인 규칙을 다시 켤 때 공백을 어떻게 할지는
// 시스템이 정하지 않고 사용자에게 묻는다(#279 확정) — 여기서는 꺼진 규칙을
// 그냥 건너뛴다.
const SELECT_ACTIVE = `
  SELECT id, category_id, merchant, amount, payment_method_id, payment_style, memo,
         day_of_month, freq, interval, starts_on, ends_on, month_of_year, last_run_on
  FROM recurring_rules
  WHERE is_active = 1
`;

const INSERT_OCCURRENCE = `
  INSERT OR IGNORE INTO recurring_occurrences (rule_id, occurred_on, status)
  VALUES (?, ?, 'created')
`;

const INSERT_TX = `
  INSERT INTO transactions
    (date, category_id, amount, payment_method_id, payment_style, merchant, memo,
     origin, origin_ref_table, origin_ref_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, 'recurring', 'recurring_rules', ?)
`;

const LINK_OCCURRENCE = `
  UPDATE recurring_occurrences SET transaction_id = ? WHERE rule_id = ? AND occurred_on = ?
`;

const TOUCH_RULE = `UPDATE recurring_rules SET last_run_on = ? WHERE id = ?`;

// 기동 시 1회 실행한다. 반환값은 요약이며, 화면이 "무엇이 새로 생겼는지" 를
// 알리는 데 쓴다(#280).
//
// 전체를 한 트랜잭션으로 묶는다. 중간에 실패해 부분만 남으면 다음 기동 때
// last_run_on 과 실제 생성분이 어긋나 상태가 애매해진다.
function runCatchup(db, options = {}) {
  const today = options.today || localToday();

  const rules = db.prepare(SELECT_ACTIVE).all();
  if (rules.length === 0) {
    return { created: 0, skipped: 0, rules: 0, today, details: [] };
  }

  const insertOcc = db.prepare(INSERT_OCCURRENCE);
  const insertTx = db.prepare(INSERT_TX);
  const linkOcc = db.prepare(LINK_OCCURRENCE);
  const touch = db.prepare(TOUCH_RULE);

  const apply = db.transaction(() => {
    let created = 0;
    let skipped = 0;
    const details = [];

    for (const rule of rules) {
      const { from, to } = windowFor(rule, today);
      if (!from || !to || from > to) {
        touch.run(today, rule.id);
        continue;
      }

      const dates = occurrencesBetween(rule, from, to);
      let ruleCreated = 0;

      for (const date of dates) {
        // DB 가 중복을 판정한다. changes 가 0 이면 이미 처리된 발생일이다.
        const res = insertOcc.run(rule.id, date);
        if (res.changes === 0) { skipped++; continue; }

        const tx = insertTx.run(
          date, rule.category_id, rule.amount, rule.payment_method_id,
          rule.payment_style || '일시불', rule.merchant, rule.memo, rule.id
        );
        linkOcc.run(tx.lastInsertRowid, rule.id, date);
        created++;
        ruleCreated++;
      }

      touch.run(today, rule.id);
      if (ruleCreated > 0) {
        details.push({ rule_id: rule.id, merchant: rule.merchant, created: ruleCreated });
      }
    }

    return { created, skipped, rules: rules.length, today, details };
  });

  // 사용자가 지시하지 않은 쓰기다. actor 를 system 으로 남겨야 실행취소가
  // 사용자의 마지막 작업을 되돌린다(#298).
  return runAs('system', apply);
}

// 기동 시 1회 실행한 결과를 화면이 나중에 가져간다. 라우트가 서버 파일의
// 지역 변수를 들여다보지 않도록 여기에 둔다.
let lastSummary = { created: 0, skipped: 0, rules: 0, details: [], error: null };

function setLastCatchupSummary(summary) { lastSummary = summary; }
function getLastCatchupSummary() { return { ...lastSummary }; }

module.exports = { runCatchup, windowFor, localToday, setLastCatchupSummary, getLastCatchupSummary };
