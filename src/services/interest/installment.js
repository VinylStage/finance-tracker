'use strict';

// 할부 이자 계산(#267).
//
// ─────────────────────────────────────────────────────────────────────────
// 계산 방식: 원금 균등 + 잔액 기준 + 월할(연이율 ÷ 12). 조사로 확정했다(#284).
//
//   - 원금은 개월수로 균등 분할한다. 끝수는 마지막 회차 원금에 몰아준다
//   - 이자는 그 회차 시작 시점의 잔여 원금에 월이자율을 곱한다
//
// ── 잔액 기준인 근거
//
// 여신금융협회 신용카드 이용자 가이드가 계산식을 이렇게 적는다.
//
//   할부수수료 = 할부잔액 × 할부수수료율 × 사용일수 ÷ 365 (윤년 366)
//   할부잔액   = 이용원금 − 기결제원금
//
// 원리금 균등을 쓰지 않는 이유가 여기 있다 — 카드사 할부수수료는 잔액 기준이다.
//
// ── 월할을 쓰는 근거 (협회 공식은 일할인데도)
//
// 위 공식은 실제 정산 방식이고, 카드사가 **회원에게 안내하는 금액**은 월할이다.
// 비씨카드 공시가 "100원당 수수료 1.66원(1회차에 부담할 예상 금액)" 을 연 19.90%
// 기준으로 적는데, 이 값은 ÷12 로만 나온다.
//
//   월할  100 × 19.90% ÷ 12        = 1.6583 → 1.66  ← 공시값과 일치
//   일할  100 × 19.90% × 30 ÷ 365  = 1.6356 → 1.64
//   일할  100 × 19.90% × 31 ÷ 365  = 1.6901 → 1.69
//
// 신한카드 개인회원 약관 제9조③ 도 "현금가격의 분할대금에 **월간 수수료**를
// 가산한 할부금" 이라고 쓴다.
//
// 이 앱이 아는 것은 청구 '월' 뿐이다. 일할로 가려면 카드 결제일, 카드사별 이용
// 기간 마감일, 구매일부터 첫 결제일까지의 간격이 모두 필요한데 하나라도 없으면
// 일할 결과가 월할보다 더 틀린다. 사용자가 대조할 수 있는 숫자도 카드사가
// 안내하는 예상액(월할)이다.
//
// ── 알려진 오차
//
// **1회차가 실제와 가장 크게 어긋난다.** 구매일부터 첫 결제일까지가 30일이 아닐
// 수 있고(예: 1일 구매 · 익월 25일 결제 → 약 54일) 그만큼 실제 청구액이 커진다.
// 일할 전환과 결제일 스키마는 #284 로 넘긴다.
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
//   부분무이자  : free_from_sequence 회차부터 면제. 그 앞은 고객 부담
//   유이자      : 면제 없음
//
// 부분무이자의 방향에 주의한다. 카드사 안내는 "6개월 부분무이자(4회차부터 면제)"
// 처럼 **뒤쪽**을 면제한다 — 앞 회차일수록 할부잔액이 커서 수수료도 크기 때문에
// 비싼 구간을 고객이 부담한다. 처음엔 이걸 반대로 잡아 이자가 실제의 40% 만
// 계산됐다(#267 수정, 근거는 migrations/009 주석).
function isFreeMonth(policy, sequence) {
  if (policy.policy_type === '무이자') return true;
  if (policy.policy_type === '부분무이자') {
    // 0 이면 면제 시작 회차가 없다는 뜻이라 전 회차 유이자로 본다.
    const from = policy.free_from_sequence || 0;
    return from > 0 && sequence >= from;
  }
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
