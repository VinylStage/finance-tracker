'use strict';

// 여윳돈(cycleHeadroom) 입력을 DB 에서 만든다 — 카드사 파일 없이 데이터만으로.
//
// 결제 의미 규칙
//   - 앵커(cash_anchors)는 "이미 결제된 카드값이 빠진 뒤" 잔액이다.
//   - unpaidCards 에 든 카드(예: 삼성)만, 앵커일까지의 사용분을 cardBilling 규칙
//     (결제일 billing_cycle_day · 마감일 statement_close_day)으로 결제일별로 묶어
//     예정 유출로 잡는다. 나머지 카드는 지금까지 쓴 금액이 선결제됐다고 본다.
//   - 할부 회차는 "지금까지 쓴 금액" 이 아니라 예정된 청구라, 결제일이 기간 안이면
//     카드 구분 없이 예정 유출로 잡는다. 단 미결제 카드의 해당 청구에는 이미
//     원거래가 아닌 회차만 들어가므로(할부 원거래는 일시불 합계에서 뺀다) 겹치지 않는다.
//
// 카드사별 규칙은 코드에 두지 않는다 — 결제일/마감일은 card_products 데이터다.

const { billingMonthFor } = require('../cardBilling');
const { addDays } = require('./headroom');

function monthAddYM(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
// 'YYYY-MM' + 결제일 → 'YYYY-MM-DD'(말일 넘침은 말일로).
function paymentDate(ym, day) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${ym}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

function cardDays(db) {
  const rows = db.prepare(`
    SELECT pm.name AS card, cp.billing_cycle_day, cp.statement_close_day
    FROM card_products cp JOIN payment_methods pm ON pm.id = cp.payment_method_id
    WHERE cp.billing_cycle_day IS NOT NULL AND cp.statement_close_day IS NOT NULL
  `).all();
  const map = {};
  for (const r of rows) if (!map[r.card]) map[r.card] = { billing_cycle_day: r.billing_cycle_day, statement_close_day: r.statement_close_day };
  return map;
}

function latestAnchorRow(db, asOf) {
  return db.prepare('SELECT as_of_date, amount FROM cash_anchors WHERE as_of_date <= ? ORDER BY as_of_date DESC, id DESC LIMIT 1').get(asOf);
}

function loadRules(db, asOf) {
  const rows = db.prepare(`
    SELECT r.merchant AS label, r.amount, r.day_of_month AS day, r.freq, r.starts_on, r.ends_on, c.major_type AS majorType
    FROM recurring_rules r JOIN categories c ON c.id = r.category_id
    WHERE r.is_active = 1 AND r.interval = 1 AND r.freq IN ('monthly', 'daily')
  `).all();
  const per = (r) => ({
    label: r.label, amount: r.amount, day: r.day,
    startMonth: r.starts_on ? r.starts_on.slice(0, 7) : undefined,
    endMonth: r.ends_on ? r.ends_on.slice(0, 7) : undefined,
  });
  const incomes = rows.filter((r) => r.majorType === '수입' && r.freq === 'monthly').map(per);
  const monthlyFixed = rows.filter((r) => r.majorType !== '수입' && r.freq === 'monthly').map(per);
  const dailyOut = rows
    .filter((r) => r.freq === 'daily' && r.majorType !== '수입' && (!r.ends_on || r.ends_on >= asOf))
    .reduce((s, r) => s + r.amount, 0);
  return { incomes, monthlyFixed, dailyOut };
}

// 다음 수입일(가장 큰 월 수입 기준) — from 이후 첫 발생일.
function nextIncomeDate(incomes, from) {
  if (!incomes.length) return null;
  const main = incomes.reduce((a, b) => (b.amount > a.amount ? b : a));
  let ym = from.slice(0, 7);
  for (let i = 0; i < 3; i++) {
    const d = paymentDate(ym, main.day);
    if (d > from) return d;
    ym = monthAddYM(ym, 1);
  }
  return null;
}

function loadHeadroomInputs(db, { asOf, unpaidCards = [], spendDate, target } = {}) {
  const warnings = [];
  const anchorRow = latestAnchorRow(db, asOf);
  if (!anchorRow) return { error: '기준일 이전 보유현금(cash_anchors)이 없습니다.' };
  // 계산은 앵커 시점부터 — 앵커 이후 흐름을 빠뜨리지 않는다.
  asOf = anchorRow.as_of_date;
  const days = cardDays(db);
  const { incomes, monthlyFixed, dailyOut } = loadRules(db, asOf);

  // 새 사용분이 청구되는 날: 선결제(=미결제 목록 밖) 카드 중 가장 이른 다음 결제일.
  if (!spendDate) {
    const cands = Object.entries(days)
      .filter(([card]) => !unpaidCards.includes(card))
      .map(([, cp]) => paymentDate(billingMonthFor(asOf, cp), cp.billing_cycle_day))
      .filter((d) => d > asOf)
      .sort();
    spendDate = cands[0] || null;
  }
  if (!target) {
    const ni = spendDate ? nextIncomeDate(incomes, spendDate) : null;
    target = ni ? addDays(ni, -1) : spendDate;
  }

  // 선결제 카드: 지금까지의 사용분이 실리는 청구일(=현재 청구서) 이전 청구는 이미
  // 냈다. 그 이전 날짜의 예정분(예: 내일 결제될 10월 청구의 할부 회차)은 다시 빼지
  // 않는다. 현재 청구서의 할부 회차는 "지금까지 쓴 금액" 이 아니므로 남긴다.
  const settledBefore = {};
  for (const [card, cp] of Object.entries(days)) {
    if (!unpaidCards.includes(card)) settledBefore[card] = paymentDate(billingMonthFor(asOf, cp), cp.billing_cycle_day);
  }

  const scheduled = [];
  const add = (date, card, amount, kind) => {
    if (!(date > asOf && date <= target) || !amount) return;
    if (settledBefore[card] && date < settledBefore[card]) return;
    const label = `${card} ${kind}`;
    const hit = scheduled.find((s) => s.date === date && s.label === label);
    if (hit) hit.amount += amount; else scheduled.push({ date, amount, label });
  };

  // 미결제 카드 일시불 사용분(할부 원거래는 회차로 따로 잡으므로 제외).
  const lookback = addDays(asOf, -75);
  for (const card of unpaidCards) {
    const cp = days[card];
    if (!cp) { warnings.push(`${card}: 결제일/마감일 미설정 — 청구 예정액 계산 불가`); continue; }
    const txs = db.prepare(`
      SELECT t.date, t.amount FROM transactions t JOIN payment_methods pm ON pm.id = t.payment_method_id
      WHERE pm.name = ? AND t.date > ? AND t.date <= ? AND t.payment_style <> '할부'
    `).all(card, lookback, asOf);
    for (const t of txs) add(paymentDate(billingMonthFor(t.date, cp), cp.billing_cycle_day), card, t.amount, '청구(일시불)');
  }

  // 할부 회차.
  const inst = db.prepare(`
    SELECT i.monthly_amount AS amt, i.months, i.start_billing_month AS sm, pm.name AS card
    FROM installments i JOIN payment_methods pm ON pm.id = i.payment_method_id
    WHERE i.paid_off_on IS NULL
  `).all();
  for (const i of inst) {
    const cp = days[i.card];
    if (!cp) { warnings.push(`${i.card}: 결제일 미설정 — 할부 회차 일정 계산 불가`); continue; }
    for (let k = 0; k < i.months; k++) add(paymentDate(monthAddYM(i.sm, k), cp.billing_cycle_day), i.card, i.amt, '할부회차');
  }
  scheduled.sort((a, b) => (a.date < b.date ? -1 : 1));

  return {
    asOf: anchorRow.as_of_date, anchorAmount: anchorRow.amount,
    spendDate, target, incomes, monthlyFixed, dailyOut, scheduled,
    warnings: [...new Set(warnings)],
  };
}

module.exports = { loadHeadroomInputs, paymentDate, nextIncomeDate };

// 월별 여유자금 베이스라인 — 확정된 흐름만(가정 지출 없음). 앵커 다음날부터
// through 월 말일까지 일 단위로 돌려 월별로 집계한다. 여윳돈과 같은 엔진·같은
// 선결제 규칙을 쓰므로 두 화면 숫자가 어긋나지 않는다.
function loadBaselineInputs(db, { asOf, through, unpaidCards = [] }) {
  const target = paymentDate(through, 31); // through 월 말일
  return loadHeadroomInputs(db, { asOf, unpaidCards, spendDate: target, target });
}

module.exports.loadBaselineInputs = loadBaselineInputs;
