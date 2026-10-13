'use strict';
const test=require('node:test');const assert=require('node:assert');
const { cycleHeadroom, addDays, dayOf }=require('../../src/services/advisor/headroom');
test('addDays/dayOf 경계', ()=>{
  assert.strictEqual(addDays('2026-10-13',1),'2026-10-14');
  assert.strictEqual(addDays('2026-10-31',1),'2026-11-01');
  assert.strictEqual(dayOf('2026-10-25'),25);
});
test('결제일까지 쿠션 + 월급 유입 + 카드청구', ()=>{
  const r=cycleHeadroom({
    asOf:'2026-10-13', anchorAmount:600000, target:'2026-10-25',
    incomes:[{amount:2460000,day:25}], monthlyFixed:[], dailyOut:3000,
    cardBills:[{label:'기타카드',date:'2026-10-14',amount:400000}],
  });
  // 10/14: -3000(daily) -400000(bill) → 197,000. 이후 매일 -3000, 10/25 +2,460,000
  assert.ok(r.minBalance < 600000);
  assert.strictEqual(r.minDate <= '2026-10-25', true);
  // 10/25 월급 들어오면 endBalance 는 크게 +
  assert.ok(r.endBalance > 2000000);
});
test('카드청구액 0(미입력)이면 쿠션은 현금-일일만', ()=>{
  const r=cycleHeadroom({asOf:'2026-10-13',anchorAmount:600000,target:'2026-10-14',dailyOut:3000});
  assert.strictEqual(r.endBalance, 597000); // 하루치 -3000
});
