'use strict';

// 어드바이저 DB 어댑터 — 실 DB 에서 현금흐름 투영 입력을 뽑는다(스펙 B).
// projectCashflow 의 순수 계산과 DB 접근을 분리한다(순수부는 projection.js).
//
// db 는 better-sqlite3 핸들(또는 .prepare(sql).all() 을 제공하는 호환 객체).

// 할부 잔여 → [{ monthlyAmount, startMonth, months, label }]
function loadInstallments(db) {
  const rows = db.prepare(
    'SELECT monthly_amount AS monthlyAmount, start_billing_month AS startMonth, months, merchant AS label FROM installments'
  ).all();
  return rows.map((r) => ({ monthlyAmount: r.monthlyAmount, startMonth: r.startMonth, months: r.months, label: r.label }));
}

// 활성 월 반복규칙 → [{ amount, label }] (freq=monthly, interval=1, 현재 유효).
function loadRecurringMonthly(db, asOfMonth) {
  const firstDay = `${asOfMonth}-01`;
  const rows = db.prepare(`
    SELECT amount, merchant AS label FROM recurring_rules
    WHERE is_active = 1 AND freq = 'monthly' AND interval = 1
      AND (starts_on IS NULL OR starts_on <= ?)
      AND (ends_on IS NULL OR ends_on >= ?)
  `).all(`${asOfMonth}-31`, firstDay);
  return rows.map((r) => ({ amount: r.amount, label: r.label }));
}

// 기준일 이전 최근 앵커 → { month, amount } | null
function latestAnchor(db, asOfDate) {
  const row = db.prepare(
    'SELECT as_of_date, amount FROM cash_anchors WHERE as_of_date <= ? ORDER BY as_of_date DESC, id DESC LIMIT 1'
  ).get(asOfDate);
  return row ? { month: row.as_of_date.slice(0, 7), amount: row.amount } : null;
}

// projectCashflow 입력 묶음.
function loadProjectionInputs(db, { asOfMonth }) {
  return {
    installments: loadInstallments(db),
    recurring: loadRecurringMonthly(db, asOfMonth),
  };
}

module.exports = { loadInstallments, loadRecurringMonthly, latestAnchor, loadProjectionInputs };
