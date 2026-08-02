'use strict';

const { INSTALLMENT_POLICY_TYPES } = require('../constants');

// 카드사 할부 정책 조회·검증(#266).
//
// DB 접근이 필요한 함수와 순수 함수를 한 파일에 두되, 순수 쪽을 먼저 정의해
// 테스트에서 DB 없이 쓸 수 있게 한다. 이자 계산 엔진(#267)이 정책 객체만 받고
// DB 를 모르는 것도 같은 이유다.

// 'YYYY-MM-DD' 문자열 비교로 날짜 구간을 판정한다. Date 로 파싱하면 타임존에
// 따라 하루가 밀린다 — utils/date.js 가 존재하는 이유와 같은 문제다.
function isEffectiveOn(policy, date) {
  if (date < policy.effective_from) return false;
  if (policy.effective_to && date > policy.effective_to) return false;
  return true;
}

// 두 정책의 유효기간이 겹치는가. effective_to 가 없으면 무기한으로 본다.
function overlaps(a, b) {
  const aEnd = a.effective_to || '9999-12-31';
  const bEnd = b.effective_to || '9999-12-31';
  return a.effective_from <= bEnd && b.effective_from <= aEnd;
}

// 정책 자체의 정합성. 라우트와 테스트가 같은 규칙을 쓴다.
// 반환값은 사용자에게 보이는 문구다 — 필드명을 노출하지 않는다(#231).
function validatePolicy(p) {
  if (!INSTALLMENT_POLICY_TYPES.includes(p.policy_type)) {
    return '할부 정책 종류를 무이자·부분무이자·유이자 중에서 선택해 주세요.';
  }
  if (!Number.isInteger(p.months) || p.months < 2) {
    return '할부 개월수는 2개월 이상이어야 합니다.';
  }
  if (p.effective_to && p.effective_from > p.effective_to) {
    return '적용 시작일이 종료일보다 늦습니다. 날짜를 확인해 주세요.';
  }
  // annual_rate 는 소수를 허용해야 해서(연 15.9% 등) numericBody(정수 전용)를
  // 쓸 수 없다. 그래서 여기서 직접 막는다. NaN 은 비교 연산이 전부 false 라
  // 범위 검사만으로는 통과해버린다 — 유한수인지 먼저 본다.
  if (!Number.isFinite(p.annual_rate)) {
    return '이자율을 숫자로 입력해 주세요.';
  }
  if (p.annual_rate < 0 || p.annual_rate > 100) {
    return '이자율은 0에서 100 사이로 입력해 주세요.';
  }
  if (p.free_months < 0 || p.free_months >= p.months) {
    return '무이자 개월수는 전체 개월수보다 작아야 합니다.';
  }
  // 종류와 값이 서로 어긋나는 입력을 막는다. 무이자인데 이자율이 있으면
  // 어느 쪽이 사용자의 의도인지 알 수 없다.
  if (p.policy_type === '무이자' && p.annual_rate > 0) {
    return '무이자 정책에는 이자율을 넣을 수 없습니다.';
  }
  if (p.policy_type === '부분무이자' && p.free_months === 0) {
    return '부분무이자는 면제 개월수가 1 이상이어야 합니다.';
  }
  if (p.policy_type === '유이자' && p.free_months > 0) {
    return '유이자 정책에는 면제 개월수를 넣을 수 없습니다.';
  }
  return null;
}

// 특정 시점에 유효한 정책을 돌려준다. 없으면 null.
// 겹침을 등록 단계에서 막으므로 결과는 최대 1건이다.
function policyAt(db, paymentMethodId, months, date) {
  const rows = db.prepare(`
    SELECT * FROM card_installment_policies
    WHERE payment_method_id = ? AND months = ?
  `).all(paymentMethodId, months);
  return rows.find((p) => isEffectiveOn(p, date)) || null;
}

// 등록·수정 시 같은 (결제수단, 개월수) 안에서 기간이 겹치는 정책이 있는가.
// excludeId 는 수정 시 자기 자신을 제외하기 위한 것이다.
function findOverlapping(db, policy, excludeId = null) {
  const rows = db.prepare(`
    SELECT * FROM card_installment_policies
    WHERE payment_method_id = ? AND months = ?
  `).all(policy.payment_method_id, policy.months);
  return rows.find((r) => r.id !== excludeId && overlaps(r, policy)) || null;
}

module.exports = { isEffectiveOn, overlaps, validatePolicy, policyAt, findOverlapping };
