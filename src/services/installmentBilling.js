'use strict';

const { computeSchedule, scheduleTotals } = require('./interest/installment');

// 총 결제금액과 정책으로 월별 청구액을 계산한다(#316).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 새 엔진을 만들지 않았나
//
// #316 인수 기준 마지막 항목이 "#267 의 기존 이자 엔진과 중복 구현하지 않는다"
// 다. `computeSchedule` 이 이미 회차별 원금·이자를 만든다 — ADR 0009 의 잔액
// 기준 월할이고, 끝수는 첫 회차에 얹는다(#343).
//
// 여기가 하는 일은 그 스케줄을 **입력 폼이 쓸 수 있는 모양으로 요약**하는 것뿐이다.
// 계산 규칙이 두 군데로 갈라지면 화면에 보이는 값과 실제로 생성되는 거래가
// 어긋난다 — 그게 이 파일이 얇아야 하는 이유다.
//
// ─────────────────────────────────────────────────────────────────────────
// 단일 값으로 요약하는 것이 왜 손실인가
//
// `installments` 는 `monthly_amount` 와 `fee_per_month` 를 각각 한 값으로만
// 저장한다. 그런데 실제 스케줄은 회차마다 다르다.
//
//   - 원금: 끝수 때문에 1회차만 크다
//   - 이자: 잔액 기준이라 회차가 갈수록 줄어든다
//
// 그래서 대표값은 **1회차 값**으로 잡는다. 카드사가 "첫 달 얼마" 로 안내하는
// 값이고, 사용자가 청구서에서 가장 먼저 대조하는 값이다. 실사용 DB 의 할부
// 한 건(232,897원 6개월)은 저장된 `monthly_amount` 가 38,817 인데 1회차 원금과
// 정확히 일치한다 — 카드사 안내값을 그대로 넣은 것으로 보인다.
//
// 대신 `varies` 로 "회차마다 다르다" 는 사실을 함께 돌려준다. 단일 값만 보여주고
// 넘어가면 사용자는 2회차 청구서를 보고 앱이 틀렸다고 판단한다.
// ─────────────────────────────────────────────────────────────────────────

// 정책이 없을 때. 이율 0 이라 원금만 쪼갠다.
// derivedTransactions 의 NO_POLICY 와 같은 의미다 — 그쪽은 기존 fee_per_month 를
// 그대로 얹지만, 여기는 "무엇을 채울지" 를 제안하는 자리라 얹을 값이 없다.
const NO_POLICY = { policy_type: '유이자', annual_rate: 0, free_from_sequence: 0 };

function allSame(values) {
  return values.every((v) => v === values[0]);
}

/**
 * 총액·개월수·정책으로 회차별 청구액을 계산하고 입력 폼용 대표값을 뽑는다.
 *
 * DB 를 보지 않는다. 정책 조회는 호출부가 한다(#316 인수 기준).
 *
 * @param {object} args
 * @param {number} args.totalAmount        총 할부 금액(원)
 * @param {number} args.months             할부 개월수 (2 이상)
 * @param {object|null} args.policy        card_installment_policies 행. 없으면 null
 * @param {string} args.startBillingMonth  첫 청구월 'YYYY-MM'
 * @returns {object} 회차 배열 + 대표값 + 합계 + 변동 여부
 */
function estimateBilling({ totalAmount, months, policy, startBillingMonth }) {
  const schedule = computeSchedule({
    totalAmount,
    months,
    policy: policy || NO_POLICY,
    startBillingMonth,
  });

  const rows = schedule.map((s) => ({
    sequence: s.sequence,
    billing_month: s.billing_month,
    principal: s.principal,
    interest: s.interest,
    total: s.principal + s.interest,
    remaining_principal: s.remaining_principal,
  }));

  const totals = scheduleTotals(schedule);
  const first = rows[0];

  return {
    rows,
    // 폼이 채울 값. 1회차 기준이다(위 주석 참조).
    monthly_amount: first.principal,
    fee_per_month: first.interest,
    first_total: first.total,
    totals: {
      principal: totals.principal,
      interest: totals.interest,
      total: totals.total,
    },
    // 회차마다 달라지는가. 화면이 "1회차만 다릅니다" 를 말할 수 있어야 한다.
    varies: {
      principal: !allSame(rows.map((r) => r.principal)),
      interest: !allSame(rows.map((r) => r.interest)),
    },
  };
}

/**
 * 계산 근거. 화면이 "왜 이 값인가" 를 사용자 말로 설명할 수 있어야 한다(#316).
 *
 * @param {object|null} policy  적용된 정책 행
 * @param {string} source       resolvePolicy 의 source — 'category' | 'base' | 'none'
 */
function billingBasis(policy, source) {
  if (!policy) {
    return {
      policy_type: null,
      annual_rate: null,
      free_from_sequence: null,
      source: source || 'none',
      // 정책이 없다는 사실을 숨기지 않는다. 수수료 0 으로 계산했는데 실제
      // 청구서에 수수료가 붙으면 사용자는 앱을 못 믿게 된다.
      reason: '등록된 카드 할부 정책이 없어 수수료 없이 원금만 나눴어요. 실제 청구액과 다를 수 있어요.',
    };
  }

  const rate = policy.annual_rate || 0;
  const from = policy.free_from_sequence || 0;

  let reason;
  if (policy.policy_type === '무이자') {
    reason = '무이자 정책이라 수수료가 붙지 않아요.';
  } else if (policy.policy_type === '부분무이자') {
    reason = from > 0
      ? `${from}회차부터 무이자예요. 그 앞 회차에 연 ${rate}% 수수료가 붙어요.`
      : `부분무이자 정책인데 무이자 시작 회차가 비어 있어요. 전 회차에 연 ${rate}% 로 계산했어요.`;
  } else {
    reason = `연 ${rate}% 수수료가 남은 금액에 붙어요. 갚을수록 수수료가 줄어요.`;
  }

  return {
    policy_type: policy.policy_type,
    annual_rate: rate,
    free_from_sequence: from,
    source: source || 'base',
    reason,
  };
}

module.exports = { estimateBilling, billingBasis, NO_POLICY };
