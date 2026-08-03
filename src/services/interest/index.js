'use strict';

const { LOAN_TYPES, LOAN_TYPE_DEFAULTS } = require('../../constants');
const generalLoan = require('./generalLoan');

// 유형별 이자 전략 디스패치(#285).
//
// 한 함수에 if (loan_type === ...) 를 쌓지 않는다. 유형이 늘 때마다 그 함수가
// 커지고, 한 유형을 고치다 다른 유형을 깨뜨린다. #267 부분무이자 결함이 그런
// 유형이었다 — 한 조건식의 방향이 뒤집혀 있었는데 그 파일만 봐서는 드러나지 않았다.
//
// 전략마다 반환 형태가 다르다. 할부는 회차 배열을 돌려주고 마이너스통장은 구간별
// 누적을 돌려준다(#286). 억지로 하나의 인터페이스에 맞추지 않는다 — 계산의 성질이
// 다른 것을 같은 모양으로 만들면 호출부가 다시 유형을 물어보게 된다.
//
// 대신 **어떤 유형이 어떤 전략을 쓰는가** 는 여기 한 곳에서만 정한다.

const STRATEGIES = {
  general: generalLoan,
  // credit_line 은 #286 이 채운다. 지금 등록하지 않는 이유는 아래 참조.
};

// 아직 전략이 없는 유형. LOAN_TYPES 에는 있어서 **저장은 되지만** 계산은 못 한다.
//
// 저장을 먼저 허용하는 이유는 사용자가 마이너스통장을 지금 등록해 둘 수 있어야
// 하기 때문이다(이자는 지금도 직접 입력한다). 계산만 아직 없다.
const PENDING = {
  credit_line: '마이너스통장 이자 계산은 아직 준비 중입니다(#286).',
};

class UnknownLoanTypeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnknownLoanTypeError';
  }
}

class StrategyNotReadyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StrategyNotReadyError';
  }
}

/**
 * 유형에 맞는 전략을 돌려준다.
 *
 * **모르는 유형을 조용히 기본값으로 흘리지 않는다.** 흘리면 잘못된 계산이 맞는
 * 것처럼 저장되고, 사용자는 숫자가 틀렸다는 것을 한참 뒤에나 안다. 계산이 없는
 * 편이 틀린 계산보다 낫다.
 */
function strategyFor(loanType) {
  if (!LOAN_TYPES.includes(loanType)) {
    throw new UnknownLoanTypeError(`unknown loan_type: ${loanType}`);
  }
  const strategy = STRATEGIES[loanType];
  if (!strategy) {
    throw new StrategyNotReadyError(PENDING[loanType] || `no strategy for loan_type: ${loanType}`);
  }
  return strategy;
}

// 이 부채가 실제로 쓰는 계산 설정. 행에 값이 없으면 유형 기본값으로 채운다.
//
// 유형만 고르면 계산이 정해지도록 하는 것이 목적이다. 사용자가 일할/복리를 따로
// 고르게 두면 마이너스통장인데 월할 단리 같은 조합이 조용히 저장된다.
function settingsFor(debt) {
  const loanType = (debt && debt.loan_type) || 'general';
  if (!LOAN_TYPES.includes(loanType)) {
    throw new UnknownLoanTypeError(`unknown loan_type: ${loanType}`);
  }
  const defaults = LOAN_TYPE_DEFAULTS[loanType];
  return {
    loan_type: loanType,
    interest_basis: debt.interest_basis || defaults.interest_basis,
    // 0 을 "값 없음" 으로 보면 복리를 끈 설정이 기본값으로 되살아난다.
    compounds: debt.compounds === null || debt.compounds === undefined
      ? defaults.compounds
      : Number(debt.compounds),
    credit_limit: debt.credit_limit ?? null,
  };
}

// 유형별로 반드시 있어야 하는 필드. 없으면 저장을 거부한다.
// 반환값은 사용자에게 그대로 보이는 문구다(#231).
function validateLoanFields(debt) {
  const loanType = (debt && debt.loan_type) || 'general';
  if (!LOAN_TYPES.includes(loanType)) {
    return '대출 유형을 선택해 주세요.';
  }
  for (const field of LOAN_TYPE_DEFAULTS[loanType].requires) {
    const value = debt[field];
    if (value === undefined || value === null || value === '') {
      if (field === 'credit_limit') {
        return '마이너스통장은 한도를 입력해 주세요. 한도가 있어야 남은 여유를 계산할 수 있어요.';
      }
      return '필수 항목이 비어 있습니다. 입력을 확인해 주세요.';
    }
  }
  if (loanType === 'credit_line') {
    const limit = Number(debt.credit_limit);
    if (!Number.isFinite(limit) || limit <= 0) {
      return '한도는 0보다 큰 금액이어야 합니다.';
    }
  }
  return null;
}

// 한도를 넘었는가.
//
// **넘었다고 저장을 막지 않는다.** 실제로 한도를 초과한 상태가 존재할 수 있고
// (연체 이자가 붙어 잔액이 한도를 넘는 경우), 그때 앱이 입력을 거부하면 사용자는
// 사실을 기록할 방법이 없어진다. 대신 초과 사실을 돌려주어 화면이 알린다.
function creditLineStatus(debt) {
  const limit = Number(debt.credit_limit);
  if (!Number.isFinite(limit) || limit <= 0) return null;
  const balance = Number(debt.balance) || 0;
  return {
    credit_limit: limit,
    used: balance,
    available: limit - balance,
    over_limit: balance > limit,
  };
}

module.exports = {
  strategyFor, settingsFor, validateLoanFields, creditLineStatus,
  UnknownLoanTypeError, StrategyNotReadyError,
};
