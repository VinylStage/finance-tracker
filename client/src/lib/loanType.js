// 대출 유형을 화면에서 어떻게 말할 것인가(#329).
//
// 서버가 `loan_type`(계산 방식)과 `type`(용도)을 다른 축으로 나눴다(#285).
// 계산과 관련된 판정은 `loan_type` 을 봐야 한다 — 용도를 '학자금' 으로 바꿨다고
// 마이너스통장 기능이 사라지면 안 된다.
//
// 내부 값(`credit_line` 등)이 화면에 새지 않도록 문구를 여기 모은다(#231).

export const LOAN_TYPE_OPTIONS = [
  { value: 'general', label: '일반' },
  { value: 'credit_line', label: '마이너스통장' },
];

const SPEC = {
  general: {
    label: '일반',
    // 유형별로 어떤 입력이 의미가 있는가. 서버도 같은 조합을 요구하므로
    // (services/interest/index.js) 화면과 규칙이 어긋나지 않게 한 곳에서 정한다.
    fields: { credit_limit: false, interest_day: false },
    hint: '월 이자를 잔액 × 연이율 ÷ 12 로 어림해 보여줘요.',
  },
  credit_line: {
    label: '마이너스통장',
    fields: { credit_limit: true, interest_day: true },
    hint: '쓴 만큼 날짜로 계산하고, 이자가 잔액에 더해져요.',
  },
};

export function loanTypeLabel(loanType) {
  return (SPEC[loanType] || SPEC.general).label;
}

export function loanTypeFields(loanType) {
  return (SPEC[loanType] || SPEC.general).fields;
}

export function loanTypeHint(loanType) {
  return (SPEC[loanType] || SPEC.general).hint;
}

// 기간별 이자 계산을 지원하는 유형인가. 서버가 내려주는 계산 설정을 따른다 —
// 화면이 유형 목록을 다시 만들면 서버와 어긋난다.
export function supportsProjection(debt) {
  return debt?.interest_settings?.interest_basis === 'daily';
}

// 한도 사용률. 화면에서 막대 폭으로 쓴다. 초과하면 100% 로 자른다.
export function creditUsageRatio(creditLine) {
  if (!creditLine || !creditLine.credit_limit) return 0;
  const ratio = (creditLine.used / creditLine.credit_limit) * 100;
  if (!Number.isFinite(ratio) || ratio < 0) return 0;
  return Math.min(100, ratio);
}
