'use strict';

// "이번 청구주기 가용 여유자금" — 지금부터 새로 긁는 카드값을 다음 결제일에 내고도
// 다음 수입 전까지 통장이 버티는 최대 추가사용액(스펙 B 핵심).
//
// 장기 월별 투영(projection.js)과 달리 일 단위로 끊는다. 반영:
//   - 앵커 현금(이미 결제된 카드값은 반영된 "결제 후" 잔액)
//   - 유입(월급 25일·경비정산 10일)
//   - 고정유출(일자·유효기간), 일일 자동매수
//   - scheduled: 날짜가 정해진 확정 유출(아직 안 낸 삼성 청구, 다음달 할부 회차 등)
// 이미 정산된 카드값을 다시 빼지 않는다 — 그건 앵커에 이미 들어 있다.

function parseYMD(s) { const [y, m, d] = s.split('-').map(Number); return { y, m, d }; }
function toISO(y, m, d) { return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
function addDays(iso, n) { const { y, m, d } = parseYMD(iso); const dt = new Date(Date.UTC(y, m - 1, d + n)); return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()); }
function dayOf(iso) { return parseYMD(iso).d; }
function monthOf(iso) { return iso.slice(0, 7); }

function inPeriod(item, ym) {
  if (item.startMonth && ym < item.startMonth) return false;
  if (item.endMonth && ym > item.endMonth) return false;
  return true;
}

// asOf 다음날부터 target(포함)까지 일 단위 전개.
// incomes / monthlyFixed: [{ amount, day, startMonth?, endMonth?, label? }]
// dailyOut: 매일 유출 합
// scheduled: [{ date:'YYYY-MM-DD', amount, label }] 확정 유출
// spendDate: 새 카드사용분이 청구되는 날(예: 다음 14일). 주어지면 그날 이후
//            최저잔액이 곧 "추가로 써도 되는 금액"이다.
function cycleHeadroom({ asOf, anchorAmount, target, incomes = [], monthlyFixed = [], dailyOut = 0, scheduled = [], spendDate = null, recordDaily = false }) {
  // recordDaily: 매일 {date, inflow, outflow, balance, items} 를 남긴다(앵커일 포함).
  // 2년이면 ~720행이라 여윳돈 API 처럼 짧은 구간에서는 끈다.
  const days = recordDaily ? [{ date: asOf, inflow: 0, outflow: 0, balance: anchorAmount, items: ['앵커'] }] : null;
  let balance = anchorAmount;
  let minBalance = balance, minDate = asOf;
  let minBefore = balance;              // spendDate 이전 구간 최저
  let minAfter = Infinity, minAfterDate = null; // spendDate 이후 구간 최저
  const timeline = [];
  // 월별 집계 — 월별 여유자금 베이스라인(순유입 = 수입 − 고정비 − 카드청구·할부 − 일일).
  // 기준월은 앵커 다음날부터만 센다(앵커 잔액에 이미 반영된 흐름을 다시 세지 않는다).
  const months = [];
  // partial: 그 달을 1일부터 세지 않았다(기준월은 앵커 다음날부터).
  const monthRow = (ym, day) => {
    let m = months[months.length - 1];
    if (!m || m.month !== ym) { m = { month: ym, inflow: 0, fixed: 0, scheduled: 0, daily: 0, outflow: 0, net: 0, endBalance: 0, partial: day !== 1 }; months.push(m); }
    return m;
  };
  const schedByDate = {};
  for (const s of scheduled) (schedByDate[s.date] = schedByDate[s.date] || []).push(s);

  let cur = asOf;
  // `<` 로 끝낸다(#781). `!==` 는 target 이 asOf 보다 과거이거나 없는 날짜일 때 영원히
  // 같아지지 않아 요청 하나가 서버를 멈췄다. YYYY-MM-DD 는 사전순이 곧 날짜순이다.
  while (cur < target) {
    cur = addDays(cur, 1);
    const d = dayOf(cur), ym = monthOf(cur);
    const items = [];
    const row = monthRow(ym, d);
    let inflow = 0, outflow = dailyOut;
    row.daily += dailyOut;
    for (const inc of incomes) if (inc.day === d && inPeriod(inc, ym)) { inflow += inc.amount; items.push(`+${inc.label || '수입'}`); }
    for (const f of monthlyFixed) if (f.day === d && inPeriod(f, ym)) { outflow += f.amount; row.fixed += f.amount; items.push(`-${f.label || '고정'}`); }
    for (const s of (schedByDate[cur] || [])) { outflow += s.amount; row.scheduled += s.amount; items.push(`-${s.label}`); }
    balance += inflow - outflow;
    row.inflow += inflow; row.outflow += outflow; row.net = row.inflow - row.outflow; row.endBalance = balance;
    if (balance < minBalance) { minBalance = balance; minDate = cur; }
    if (spendDate && cur < spendDate) minBefore = Math.min(minBefore, balance);
    if (spendDate && cur >= spendDate && balance < minAfter) { minAfter = balance; minAfterDate = cur; }
    if (items.length) timeline.push({ date: cur, inflow, outflow, balance, items });
    if (days) days.push({ date: cur, inflow, outflow, balance, items });
  }
  if (days) attachSpendable(days, incomes);

  // 여윳돈은 "그 돈이 언제 통장에서 빠지는가" 에 따라 둘이다.
  //   capacity          — 신용카드(spendDate 에 청구): 청구 전 잔액은 줄이지 않으므로
  //                        spendDate 이후 최저잔액이 한도. 단 그 전에 이미 바닥이면
  //                        추가 여력은 없고 부족분(음수)을 그대로 보인다.
  //   capacityImmediate — 체크카드·현금(지금 바로 빠짐): 전 구간 최저잔액.
  let capacity = null;
  if (spendDate) {
    const after = minAfter === Infinity ? balance : minAfter;
    capacity = minBefore < 0 ? minBefore : after;
  }
  const capacityImmediate = minBalance;
  return { endBalance: balance, minBalance, minDate, minBefore: spendDate ? minBefore : null, minAfter: spendDate ? minAfter : null, minAfterDate, capacity, capacityImmediate, timeline, months, days };
}

// 일별 여유자금(spendable): 그날부터 다음 월급 전날까지의 최저잔액. 그날 바로
// (현금·체크카드로) 써도 다음 월급 전까지 마이너스가 안 나는 금액이다.
// 월급날 = 가장 큰 월 수입 규칙의 day. 뒤에서부터 훑으며 월급날 직전에서 끊는다.
function attachSpendable(days, incomes) {
  const main = incomes.length ? incomes.reduce((a, b) => (b.amount > a.amount ? b : a)) : null;
  const isPayday = (iso) => !!main && dayOf(iso) === main.day && inPeriod(main, monthOf(iso));
  let running = Infinity;
  for (let i = days.length - 1; i >= 0; i--) {
    const next = days[i + 1];
    running = (next && isPayday(next.date)) ? days[i].balance : Math.min(days[i].balance, running);
    days[i].spendable = running;
  }
}

module.exports = { cycleHeadroom, addDays, dayOf };
