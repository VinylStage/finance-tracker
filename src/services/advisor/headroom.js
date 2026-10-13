'use strict';

// "이번 청구주기 가용 여유자금" — 다음 카드 결제일까지의 단기 현금 쿠션(스펙 B 핵심).
//
// 장기 월별 투영(projection.js)과 달리, 오늘부터 가까운 결제일까지를 **일 단위**로
// 끊어, 그 사이 유입(월급 25일·경비정산 10일)·고정유출(일자별)·일일 자동매수·
// 카드 청구액을 반영해 "통장이 버티는가 / 추가로 더 써도 되는 여유가 얼마인가"를
// 낸다.
//
// 카드 청구액(cardBills)은 외부 입력이다 — 카드사 앱의 이번 청구액 또는 청구주기
// 마감일로부터 역산한 값. 없으면 "카드값 차감 전 가용현금"까지만 확정된다.

function parseYMD(s) { const [y, m, d] = s.split('-').map(Number); return { y, m, d }; }
function toISO(y, m, d) { return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
function addDays(iso, n) { const { y, m, d } = parseYMD(iso); const dt = new Date(Date.UTC(y, m - 1, d + n)); return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()); }
function dayOf(iso) { return parseYMD(iso).d; }

// asOf 다음날부터 target(포함)까지 일 단위 전개.
// anchorAmount: asOf 시점 보유현금.
// incomes: [{ amount, day }]  매월 day 일 유입.
// monthlyFixed: [{ amount, day }]  매월 day 일 고정유출.
// dailyOut: 매일 유출(주식 자동매수 등).
// cardBills: [{ label, date:'YYYY-MM-DD', amount }]  결제일에 빠지는 카드청구액.
function cycleHeadroom({ asOf, anchorAmount, target, incomes = [], monthlyFixed = [], dailyOut = 0, cardBills = [] }) {
  let balance = anchorAmount;
  let minBalance = balance;
  let minDate = asOf;
  const events = [];
  const billByDate = {};
  for (const b of cardBills) { billByDate[b.date] = (billByDate[b.date] || 0) + b.amount; }

  let cur = asOf;
  // asOf 당일은 "지금 잔액"으로 보고, 다음날부터 흐름을 적용한다.
  while (cur !== target) {
    cur = addDays(cur, 1);
    const d = dayOf(cur);
    let inflow = 0, outflow = 0;
    for (const inc of incomes) if (inc.day === d) inflow += inc.amount;
    for (const f of monthlyFixed) if (f.day === d) outflow += f.amount;
    outflow += dailyOut;
    const bill = billByDate[cur] || 0;
    outflow += bill;
    balance += inflow - outflow;
    if (balance < minBalance) { minBalance = balance; minDate = cur; }
    if (inflow || bill || monthlyFixed.some((f) => f.day === d)) {
      events.push({ date: cur, inflow, outflow, bill, balance });
    }
  }
  return { endBalance: balance, minBalance, minDate, events };
}

module.exports = { cycleHeadroom, addDays, dayOf };
