'use strict';

function savingsBalanceAt(savings, ym) {
  let total = 0;
  
  for (const item of savings) {
    if (item.status !== '진행중') continue;
    
    const startDate = item.start_date.slice(0, 7);
    const maturityDate = item.maturity_date ? item.maturity_date.slice(0, 7) : ym;
    
    const startYear = parseInt(startDate.split('-')[0]);
    const startMonth = parseInt(startDate.split('-')[1]);
    const maturityYear = parseInt(maturityDate.split('-')[0]);
    const maturityMonth = parseInt(maturityDate.split('-')[1]);
    const targetYear = parseInt(ym.split('-')[0]);
    const targetMonth = parseInt(ym.split('-')[1]);
    
    const startMonthNum = startYear * 12 + startMonth;
    const maturityMonthNum = maturityYear * 12 + maturityMonth;
    const targetMonthNum = targetYear * 12 + targetMonth;
    
    const actualEndMonthNum = Math.min(targetMonthNum, maturityMonthNum);
    
    if (startMonthNum > actualEndMonthNum) continue;
    
    const months = actualEndMonthNum - startMonthNum + 1;
    total += item.monthly_contribution * months;
  }
  
  return total;
}

function netWorthTimeline(timeline, { debts = [], savings = [] } = {}) {
  const debtSum = debts.reduce((sum, debt) => sum + debt.balance, 0);
  
  return timeline.map(t => {
    const cash = t.balance;
    const savingsBalance = savingsBalanceAt(savings, t.month);
    const debt = debtSum;
    const netWorth = cash + savingsBalance - debt;
    
    return {
      month: t.month,
      cash,
      savings: savingsBalance,
      debt,
      netWorth
    };
  });
}

module.exports = { savingsBalanceAt, netWorthTimeline };
