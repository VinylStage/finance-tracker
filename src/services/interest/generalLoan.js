'use strict';

// 일반 부채의 이자(#285).
//
// M10 이전의 동작을 그대로 옮긴 것이다. routes/debts.js 가 목록 조회에서
// `ROUND(balance * annual_rate / 100.0 / 12)` 로 월 이자를 어림해 왔고, 그 값이
// 화면의 "월이자 (참고)" 열이다. 이름 그대로 참고값이라 실제 청구액이 아니다.
//
// 여기로 옮기는 이유는 유형이 늘 때 계산이 라우트 SQL 안에 흩어져 있으면 안 되기
// 때문이다. 지금은 한 줄이지만 이 자리가 "general 유형의 계산" 이라는 것이 코드로
// 드러나야 다음 유형을 붙일 때 어디를 봐야 하는지 알 수 있다.

const BASIS = 'monthly';

// 한 달치 이자. 잔액 × 연이율 ÷ 12, 원 단위 반올림(기존 SQL 의 ROUND 와 같다).
//
// 일할이 아닌 이유는 이 유형이 "계산 방식을 모르는 부채" 이기 때문이다. 사용자가
// 유형을 정확히 골랐다면 credit_line 등 전용 전략으로 간다. 여기서 일할을 흉내내면
// 근거 없는 정밀도가 된다.
function monthlyInterest({ balance, annualRate }) {
  if (!Number.isFinite(balance) || !Number.isFinite(annualRate)) {
    throw new Error('balance and annualRate must be finite numbers');
  }
  return Math.round((balance * annualRate) / 100 / 12);
}

// 구간 이자. general 은 월 단위 어림이므로 구간을 개월수로 환산한다.
// 정확한 일수 계산이 필요하면 그 부채는 general 이 아니다.
function accrue({ balance, annualRate, months = 1 }) {
  return monthlyInterest({ balance, annualRate }) * months;
}

module.exports = { BASIS, monthlyInterest, accrue };
