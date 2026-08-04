// 잔액 추이의 표시 계층(#291).
//
// 계산은 서버가 하고 여기서는 문장만 만든다. 예측을 단정적으로 제시하면
// 사용자가 그대로 믿고 손해를 보므로, 무엇을 반영했는지 항상 함께 말한다.

import { formatWon } from './balanceView.js';

export function monthLabel(month, asOf) {
  if (!month || !asOf) return '';
  
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) return '';
  
  const [, year, monthNum] = match;
  const asOfYear = asOf.substring(0, 4);
  // 선행 0 을 뗀다. '09월' 이 아니라 '9월' 이다 — 사람이 말하는 방식과 맞춘다.
  const m = String(Number(monthNum));

  if (year === asOfYear) {
    return `${m}월`;
  }
  return `${year}년 ${m}월`;
}

export function describeScope(includes) {
  if (!includes || includes.length === 0) {
    return '반영할 예정 내역이 없어요.';
  }
  
  const labels = {
    'scheduled': '예정된 인출',
    'card-unpaid': '카드값'
  };
  
  const parts = includes.map(key => labels[key]).filter(Boolean);
  
  if (parts.length === 0) {
    return '반영할 예정 내역이 없어요.';
  }
  
  const joined = parts.join('과 ');
  const hasUnpaid = includes.includes('card-unpaid');
  
  if (hasUnpaid) {
    return `${joined}만 반영했어요. 앞으로의 지출은 포함되지 않았어요.`;
  } else {
    return `${joined}만 반영했어요. 앞으로의 지출은 포함되지 않았어요.`;
  }
}

export function describeNegativeTurn(projection) {
  if (!projection || !projection.negativeFrom) return null;
  
  const { negativeFrom, months, asOf } = projection;
  
  // Find the month data
  const monthData = months.find(m => m.month === negativeFrom);
  if (!monthData) return null;
  
  const balance = monthData.balance;
  const formattedBalance = formatWon(balance);
  
  // monthLabel 을 재사용한다. 직접 자르면 선행 0 이 남고, 해가 넘어갈 때
  // 연도가 빠져 '1월' 이 올해인지 내년인지 알 수 없게 된다.
  return `${monthLabel(negativeFrom, projection.asOf)}에 잔액이 ${formattedBalance}이 돼요.`;
}
