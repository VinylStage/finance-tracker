'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { cycleHeadroom, addDays, dayOf } = require('../../src/services/advisor/headroom');

test('addDays/dayOf 경계', () => {
  assert.strictEqual(addDays('2026-10-13', 1), '2026-10-14');
  assert.strictEqual(addDays('2026-10-31', 1), '2026-11-01');
  assert.strictEqual(addDays('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(dayOf('2026-10-25'), 25);
});

test('선결제 반영 앵커: 이미 낸 카드값은 다시 빼지 않고 예정분만 뺀다', () => {
  const r = cycleHeadroom({ asOf: '2026-10-13', anchorAmount: 600000, target: '2026-10-14', dailyOut: 3000 });
  assert.strictEqual(r.endBalance, 597000);
});

test('scheduled + 기간 고정비 + 수입 → 추가사용 가능액(capacity)', () => {
  const r = cycleHeadroom({
    asOf: '2026-10-13', anchorAmount: 600000, target: '2026-11-24', spendDate: '2026-11-14',
    incomes: [{ amount: 2000000, day: 25, label: '월급' }],
    monthlyFixed: [
      { amount: 100000, day: 10, label: '월세', endMonth: '2026-10' },   // 11월엔 없음
      { amount: 50000, day: 10, label: '예외', startMonth: '2026-11', endMonth: '2026-11' },
    ],
    scheduled: [{ date: '2026-10-25', amount: 1500000, label: '삼성' }, { date: '2026-11-14', amount: 100000, label: '할부' }],
  });
  // 10/25: 600000 +2000000 -1500000 = 1,100,000 / 11/10: -50,000 → 1,050,000 / 11/14: -100,000 → 950,000
  assert.strictEqual(r.minBefore, 600000);
  assert.strictEqual(r.minAfter, 950000);
  // 신용카드 사용분은 11/14 에 빠지므로 그 전 잔액을 줄이지 않는다 → 이후 최저가 한도
  assert.strictEqual(r.capacity, 950000);
  // 체크카드·현금은 지금 바로 빠진다 → 전 구간 최저
  assert.strictEqual(r.capacityImmediate, 600000);
});

test('결제일 전에 바닥나면 capacity 는 음수(부족분)', () => {
  const r = cycleHeadroom({
    asOf: '2026-10-13', anchorAmount: 100000, target: '2026-10-20', spendDate: '2026-10-18',
    scheduled: [{ date: '2026-10-15', amount: 300000, label: '청구' }],
  });
  assert.strictEqual(r.capacity, -200000);
});
