'use strict';

// 재무상담/지출전략 어드바이저 — 현금흐름 투영 코어 (스펙 B).
//
// 보유현금 "앵커"(기준일 스냅샷)에서 출발해, 그 시점 이후만 월별로 전개한다.
// 앵커 이전 누적 이력은 끌어오지 않는다(사용자 지정 2026-10-13). 과거 거래는
// 삭제하지 않으며 — 이 함수는 순수 계산이고 DB 를 건드리지 않는다.
//
// 휴대폰 구입 시뮬레이션은 simulated 에 할부 1건을 더하는 것으로 표현한다(첫 적용사례).

// 'YYYY-MM' 에 개월 수를 더한다.
function monthAdd(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

// 두 'YYYY-MM' 의 개월 차(a - b).
function monthDiff(a, b) {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (ay * 12 + am) - (by * 12 + bm);
}

// 월별 현금흐름 전개.
//
// anchor: { month:'YYYY-MM', amount }  — 기준 시점 보유현금.
// horizonMonths: 전개할 개월 수(앵커월 포함).
// monthlyIncome: 매월 유입(기본 0).
// recurring: [{ amount, label? }] — 매월 유출(구독·고정비).
// installments: [{ monthlyAmount, startMonth:'YYYY-MM', months, label? }] — 기존 할부 잔여.
// simulated: [{ kind:'installment', monthlyAmount, startMonth, months, label? }
//           | { kind:'lumpsum', amount, month:'YYYY-MM', label? }] — 가정 지출(휴대폰 등).
function projectCashflow({ anchor, horizonMonths, monthlyIncome = 0, recurring = [], installments = [], simulated = [] }) {
  if (!anchor || !anchor.month || typeof anchor.amount !== 'number') {
    throw new Error('anchor { month, amount } 가 필요합니다');
  }
  // 반복 고정비는 시점 인식: startMonth/endMonth 범위에서만 적용(예: 통신요금은
  // 11월 청구분부터 52,000). 유효시작일 개념으로 "월별로 금액이 바뀌는 규칙"을
  // (옛 규칙 종료 + 새 규칙 시작)으로 표현할 수 있다.
  const recurOut = (ym) => recurring.reduce((s, r) => {
    if (r.startMonth && ym < r.startMonth) return s;
    if (r.endMonth && ym > r.endMonth) return s;
    return s + r.amount;
  }, 0);

  const instOut = (list, ym) => list.reduce((s, it) => {
    if (it.kind && it.kind !== 'installment') return s;
    const off = monthDiff(ym, it.startMonth);
    return (off >= 0 && off < it.months) ? s + it.monthlyAmount : s;
  }, 0);
  const lumpOut = (ym) => simulated.reduce((s, it) => (it.kind === 'lumpsum' && it.month === ym ? s + it.amount : s), 0);

  const timeline = [];
  let balance = anchor.amount;
  let minBalance = balance;
  let firstNegativeMonth = null;

  for (let i = 0; i < horizonMonths; i++) {
    const ym = monthAdd(anchor.month, i);
    const inflow = monthlyIncome;
    const outflow = recurOut(ym) + instOut(installments, ym) + instOut(simulated, ym) + lumpOut(ym);
    balance += inflow - outflow;
    if (balance < minBalance) minBalance = balance;
    if (firstNegativeMonth === null && balance < 0) firstNegativeMonth = ym;
    timeline.push({ month: ym, inflow, outflow, net: inflow - outflow, balance });
  }
  return { timeline, minBalance, firstNegativeMonth };
}

module.exports = { projectCashflow, monthAdd, monthDiff };
