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
const { installmentBillings } = require('./installmentBillings');

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

function loadRules(db, asOf, days = {}, warnings = []) {
  const rows = db.prepare(`
    SELECT r.merchant AS label, r.amount, r.day_of_month AS day, r.freq, r.starts_on, r.ends_on, c.major_type AS majorType,
           pm.name AS card, pm.type AS cardType
    FROM recurring_rules r JOIN categories c ON c.id = r.category_id
    LEFT JOIN payment_methods pm ON pm.id = r.payment_method_id
    WHERE r.is_active = 1 AND r.interval = 1 AND r.freq IN ('monthly', 'daily')
  `).all();
  const per = (r) => ({
    label: r.label, amount: r.amount, day: r.day,
    startMonth: r.starts_on ? r.starts_on.slice(0, 7) : undefined,
    endMonth: r.ends_on ? r.ends_on.slice(0, 7) : undefined,
  });
  const incomes = rows.filter((r) => r.majorType === '수입' && r.freq === 'monthly').map(per);
  // 카드로 결제되는 고정지출(예: 통신요금 자동납부)은 이용일이 아니라 그 카드
  // 결제일에 현금이 빠진다 → 현금 고정비에서 빼서 cardFixed 로. 결제일 미설정
  // 카드면 경고를 내고 현금으로 둔다(빠뜨리는 것보다 낫다).
  const monthlyFixed = [], cardFixed = [];
  for (const r of rows.filter((x) => x.majorType !== '수입' && x.freq === 'monthly')) {
    if (r.card && days[r.card]) cardFixed.push({ ...per(r), card: r.card });
    else {
      if (r.card && ['신용', '체크'].includes(r.cardType)) {
        warnings.push(`${r.card}: 결제일 미설정 — '${r.label}' 을 현금 유출로 계산`);
      }
      monthlyFixed.push(per(r));
    }
  }
  const dailyOut = rows
    .filter((r) => r.freq === 'daily' && r.majorType !== '수입' && (!r.ends_on || r.ends_on >= asOf))
    .reduce((s, r) => s + r.amount, 0);
  return { incomes, monthlyFixed, cardFixed, dailyOut };
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
  const { incomes, monthlyFixed, cardFixed, dailyOut } = loadRules(db, asOf, days, warnings);

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

  // 할부 회차(#774). 장부의 파생 회차가 정본이다 — 카드사 정책 이자·끝수가 거래내역과
  // 같아진다. 파생 회차가 없는 할부(파생 기능 이전 등록분)만 installments 에서 계산한다
  // (monthly_amount + fee_per_month, #772). 완납 할부는 두 경로 모두 뺀다(H2).
  const derived = db.prepare(`
    SELECT t.installment_id, substr(t.date, 1, 7) AS ym, t.amount, pm.name AS card
    FROM transactions t JOIN installments i ON i.id = t.installment_id
    JOIN payment_methods pm ON pm.id = t.payment_method_id
    WHERE t.origin = 'installment' AND i.paid_off_on IS NULL
    ORDER BY t.date, t.id
  `).all();
  const inst = db.prepare(`
    SELECT i.id, i.monthly_amount + COALESCE(i.fee_per_month, 0) AS amount, i.months,
      i.start_billing_month AS start_month, pm.name AS card
    FROM installments i JOIN payment_methods pm ON pm.id = i.payment_method_id
    WHERE i.paid_off_on IS NULL
  `).all();
  for (const b of installmentBillings({ derived, installments: inst })) {
    const cp = days[b.card];
    if (!cp) { warnings.push(`${b.card}: 결제일 미설정 — 할부 회차 일정 계산 불가`); continue; }
    add(paymentDate(b.ym, cp.billing_cycle_day), b.card, b.amount, '할부회차');
  }
  // 카드 결제 고정지출: 앵커 이후 이용분만(그 전 이용분은 미결제 카드면 거래내역으로,
  // 선결제 카드면 이미 정산으로 잡혀 있다) — 이용일 → cardBilling 으로 결제일.
  for (const f of cardFixed) {
    const cp = days[f.card];
    for (let ym = asOf.slice(0, 7); ym <= target.slice(0, 7); ym = monthAddYM(ym, 1)) {
      if ((f.startMonth && ym < f.startMonth) || (f.endMonth && ym > f.endMonth)) continue;
      const usage = paymentDate(ym, f.day);
      if (usage <= asOf) continue;
      add(paymentDate(billingMonthFor(usage, cp), cp.billing_cycle_day), f.card, f.amount, `고정청구(${f.label})`);
    }
  }
  scheduled.sort((a, b) => (a.date < b.date ? -1 : 1));

  return {
    asOf: anchorRow.as_of_date, anchorAmount: anchorRow.amount,
    spendDate, target, incomes, monthlyFixed, dailyOut, scheduled,
    warnings: [...new Set(warnings)],
  };
}

module.exports = { loadHeadroomInputs, paymentDate, nextIncomeDate, latestAnchorRow, monthAddYM };

// 월별 여유자금 베이스라인 — 확정된 흐름만(가정 지출 없음). 앵커 다음날부터
// through 월 말일까지 일 단위로 돌려 월별로 집계한다. 여윳돈과 같은 엔진·같은
// 선결제 규칙을 쓰므로 두 화면 숫자가 어긋나지 않는다.
function loadBaselineInputs(db, { asOf, through, unpaidCards = [] }) {
  const target = paymentDate(through, 31); // through 월 말일
  return loadHeadroomInputs(db, { asOf, unpaidCards, spendDate: target, target });
}

// 장기 전망(/projection)은 일별 베이스라인 엔진의 월 집계(cycleHeadroom().months)를
// 그대로 쓴다 — 옛 월별 엔진(projectCashflow)은 앵커월의 이미 지난 흐름을 통째로
// 다시 더했고(감사 H1, 실측 최대 113만원 차이) 완납 할부도 걸러내지 않았다(H2).
// 일별 엔진은 앵커 "당일 이후"만, 완납 할부 제외, 카드고정비는 카드 결제일에 반영한다.
//
// months → 전망 타임라인. 월말잔액(endBalance)을 '잔액'으로 쓴다(화면의 월별 표와
// 같은 값). minBalance·firstNegativeMonth 도 월말 기준으로 계산해 표와 어긋나지
// 않게 한다(일중 저점은 '이번 주기 여윳돈' 카드의 몫이다).
function monthsToTimeline(months) {
  const timeline = months.map((m) => ({
    month: m.month, inflow: m.inflow, outflow: m.outflow, net: m.net, balance: m.endBalance, partial: m.partial,
  }));
  let minBalance = timeline.length ? Infinity : 0;
  let firstNegativeMonth = null;
  for (const t of timeline) {
    if (t.balance < minBalance) minBalance = t.balance;
    if (firstNegativeMonth === null && t.balance < 0) firstNegativeMonth = t.month;
  }
  return { timeline, minBalance, firstNegativeMonth };
}

// what-if 추가 지출 시나리오 → 일별 엔진 scheduled(현금 유출). 월 단위 전망이라
// 월말(말일)에 배치한다 — 월말 잔액에만 영향을 주면 되고, 그래야 앵커월에 넣어도
// '이미 지난 날짜'로 밀려 빠지지 않는다. 할부는 회차마다, 일시불은 한 번.
//
// 지금은 전부 '현금·월말' 로만 반영한다. 현금/카드 구분과 카드 결제일 라우팅,
// 다항목 혼합은 what-if 확장(별도 작업)에서 cardBilling 경로로 넓힌다 — 이 함수가
// 그 확장 지점이다.
function simToScheduled(simulated = []) {
  const out = [];
  for (const it of simulated) {
    const label = it.label || '추가 지출';
    if (it.kind === 'lumpsum') {
      if (it.amount) out.push({ date: paymentDate(it.month, 31), amount: it.amount, label });
    } else { // installment(기본)
      for (let k = 0; k < it.months; k++) out.push({ date: paymentDate(monthAddYM(it.startMonth, k), 31), amount: it.monthlyAmount, label });
    }
  }
  return out;
}

module.exports.loadBaselineInputs = loadBaselineInputs;
module.exports.monthsToTimeline = monthsToTimeline;
module.exports.simToScheduled = simToScheduled;
