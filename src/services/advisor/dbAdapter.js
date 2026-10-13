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

// 활성 반복규칙을 수입/지출로 갈라 반환.
// → { expense: [...], income: [...] }, 각 항목은 { amount | dailyAmount, startMonth?, endMonth?, label }.
// 수입은 카테고리 major_type='수입'(월급·경비정산 등). 투영은 **시점 인식**으로
// 적용하므로 단일 월로 미리 거르지 않고 전부 넘긴다. freq='daily' 는 dailyAmount 로.
function loadRecurringRules(db) {
  const rows = db.prepare(`
    SELECT r.amount, r.merchant AS label, r.freq, r.starts_on, r.ends_on, c.major_type AS majorType
    FROM recurring_rules r JOIN categories c ON c.id = r.category_id
    WHERE r.is_active = 1 AND r.interval = 1 AND r.freq IN ('monthly', 'daily')
  `).all();
  const expense = [], income = [];
  for (const r of rows) {
    const base = {
      label: r.label,
      startMonth: r.starts_on ? r.starts_on.slice(0, 7) : undefined,
      endMonth: r.ends_on ? r.ends_on.slice(0, 7) : undefined,
    };
    const item = r.freq === 'daily' ? { ...base, dailyAmount: r.amount } : { ...base, amount: r.amount };
    (r.majorType === '수입' ? income : expense).push(item);
  }
  return { expense, income };
}

// 기준일 이전 최근 앵커 → { month, amount } | null
function latestAnchor(db, asOfDate) {
  const row = db.prepare(
    'SELECT as_of_date, amount FROM cash_anchors WHERE as_of_date <= ? ORDER BY as_of_date DESC, id DESC LIMIT 1'
  ).get(asOfDate);
  return row ? { month: row.as_of_date.slice(0, 7), amount: row.amount } : null;
}

// projectCashflow 입력 묶음.
function loadProjectionInputs(db) {
  const { expense, income } = loadRecurringRules(db);
  return {
    installments: loadInstallments(db),
    recurring: expense,
    recurringInflow: income,
  };
}

module.exports = { loadInstallments, loadRecurringRules, latestAnchor, loadProjectionInputs };
