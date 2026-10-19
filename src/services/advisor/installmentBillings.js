'use strict';

function installmentBillings({ derived = [], installments = [] } = {}) {
  const result = [];
  
  // 먼저 derived를 그대로 추가
  for (const row of derived) {
    result.push({
      ym: row.ym,
      card: row.card,
      amount: row.amount
    });
  }
  
  // installments 처리
  const usedIds = new Set(derived.map(r => r.installment_id));
  
  for (const installment of installments) {
    if (usedIds.has(installment.id)) continue;
    
    if (installment.months <= 0) continue;
    
    const [year, month] = installment.start_month.split('-').map(Number);
    const base = year * 12 + (month - 1);
    
    for (let k = 0; k < installment.months; k++) {
      const n = base + k;
      const y = Math.floor(n / 12);
      const m = (n % 12) + 1;
      const ym = `${y}-${m.toString().padStart(2, '0')}`;
      
      result.push({
        ym,
        card: installment.card,
        amount: installment.amount
      });
    }
  }
  
  return result;
}

module.exports = { installmentBillings };
