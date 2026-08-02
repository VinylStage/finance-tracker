'use strict';

// 할부 이자 계산(#267).
//
// ─────────────────────────────────────────────────────────────────────────
// 주의: 계산 방식은 잠정안이다.
//
// M10 #284 가 국내 카드사 할부수수료 표준 계산공식을 조사하기로 확정돼 있고,
// 그 결과에 따라 아래 규칙이 바뀔 수 있다. 특히 부분무이자 구간의 이자 기산
// 시점과 잔액 기준 여부는 조사 대상이다.
//
// 지금 채택한 잠정안: 원금 균등 + 잔액 기준 이자.
//   - 원금은 개월수로 균등 분할한다
//   - 이자는 그 회차 시작 시점의 잔여 원금에 월이자율을 곱한다
// 원리금 균등을 쓰지 않는 이유는 총 상환액이 달라지기 때문이다. 카드사 할부
// 수수료는 통상 잔액 기준이다.
// ─────────────────────────────────────────────────────────────────────────
//
// 이 모듈은 DB 를 모른다. 정책 객체를 인자로 받는다. 사용자 돈 계산이라
// 케이스를 많이 넣어야 하는데 DB 를 끼면 그게 어려워진다.

// 'YYYY-MM' 에 n 개월을 더한다. 문자열로 다루는 이유는 Date 파싱이 타임존에
// 따라 밀리기 때문이다(services/cardPolicy.js 와 같은 이유).
function addMonths(yearMonth, n) {
  const [y, m] = yearMonth.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

// 그 회차가 이자 면제 구간인가.
//   무이자      : 전 회차 면제
//   부분무이자  : 앞 free_months 회차 면제
//   유이자      : 면제 없음
function isFreeMonth(policy, sequence) {
  if (policy.policy_type === '무이자') return true;
  if (policy.policy_type === '부분무이자') return sequence <= policy.free_months;
  return false;
}

// 완납일이 그 청구월보다 앞서는가. 완납일 'YYYY-MM-DD' 를 'YYYY-MM' 으로 잘라
// 비교한다. 완납월 당월 회차는 살리고 그 다음 회차부터 없앤다 —
// 완납월에도 청구는 이미 발생했다고 본다.
function isAfterPayoff(billingMonth, paidOffOn) {
  if (!paidOffOn) return false;
  return billingMonth > paidOffOn.slice(0, 7);
}

/**
 * 할부 상환 스케줄을 만든다.
 *
 * @param {object} args
 * @param {number} args.totalAmount        총 할부 금액(원)
 * @param {number} args.months             할부 개월수 (2 이상)
 * @param {object} args.policy             card_installment_policies 행
 * @param {string} args.startBillingMonth  첫 청구월 'YYYY-MM'
 * @param {string} [args.paidOffOn]        조기 완납일 'YYYY-MM-DD'. 없으면 정상 진행
 * @returns {Array<{billing_month, sequence, principal, interest, remaining_principal}>}
 */
function computeSchedule({ totalAmount, months, policy, startBillingMonth, paidOffOn = null }) {
  if (!Number.isInteger(totalAmount) || totalAmount <= 0) {
    throw new Error('totalAmount must be a positive integer');
  }
  if (!Number.isInteger(months) || months < 2) {
    throw new Error('months must be an integer >= 2');
  }
  if (!policy || !policy.policy_type) {
    throw new Error('policy is required');
  }

  const monthlyRate = (policy.annual_rate || 0) / 12 / 100;
  // 원 단위 절사. 남는 끝수는 마지막 회차 원금에 몰아준다.
  const basePrincipal = Math.floor(totalAmount / months);

  const rows = [];
  let remaining = totalAmount;

  for (let seq = 1; seq <= months; seq += 1) {
    const billingMonth = addMonths(startBillingMonth, seq - 1);

    // 완납 이후 회차는 만들지 않는다. 이자를 잘라내는 게 아니라 애초에
    // 발생하지 않는다 — 완납 시점에 잔여 원금이 전부 상환되기 때문이다.
    if (isAfterPayoff(billingMonth, paidOffOn)) break;

    const isLast = seq === months;
    const payoffHere = paidOffOn && billingMonth === paidOffOn.slice(0, 7);

    // 이자는 이번 회차 원금을 갚기 전의 잔액에 붙는다.
    const interest = isFreeMonth(policy, seq) ? 0 : Math.floor(remaining * monthlyRate);

    // 마지막 회차이거나 이번 달에 완납하면 잔여 원금을 전부 싣는다.
    const principal = (isLast || payoffHere) ? remaining : basePrincipal;

    remaining -= principal;
    rows.push({
      billing_month: billingMonth,
      sequence: seq,
      principal,
      interest,
      remaining_principal: remaining,
    });

    if (payoffHere) break;
  }

  return rows;
}

// 스케줄의 합계. 화면·검증에서 반복해 쓰는 계산이라 여기 둔다.
function scheduleTotals(rows) {
  return rows.reduce(
    (acc, r) => ({
      principal: acc.principal + r.principal,
      interest: acc.interest + r.interest,
      total: acc.total + r.principal + r.interest,
    }),
    { principal: 0, interest: 0, total: 0 }
  );
}

module.exports = { computeSchedule, scheduleTotals, addMonths, isFreeMonth };
