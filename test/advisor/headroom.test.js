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

test('청구일 전 바닥이면 capacity 는 이후 회복과 무관하게 부족분', () => {
  const r = cycleHeadroom({
    asOf: '2026-10-13', anchorAmount: 100000, target: '2026-10-20', spendDate: '2026-10-18',
    incomes: [{ amount: 500000, day: 18, label: '수입' }],
    scheduled: [{ date: '2026-10-15', amount: 300000, label: '청구' }],
  });
  assert.strictEqual(r.minBefore, -200000);
  assert.strictEqual(r.minAfter, 300000);
  assert.strictEqual(r.capacity, -200000);
});

test('청구일 당일 잔액도 청구 후 구간에 포함한다', () => {
  const r = cycleHeadroom({
    asOf: '2026-10-13', anchorAmount: 1000000, target: '2026-10-20', spendDate: '2026-10-18',
    incomes: [{ amount: 500000, day: 19, label: '수입' }],
    scheduled: [{ date: '2026-10-18', amount: 400000, label: '할부' }],
  });
  assert.strictEqual(r.minAfter, 600000);   // 10/18 당일(수입 전)
  assert.strictEqual(r.capacity, 600000);
});

test('월별 집계: 기준월은 앵커 다음날부터만, 항목별 분해·월말잔액', () => {
  const r = cycleHeadroom({
    asOf: '2026-10-13', anchorAmount: 600000, target: '2026-11-30',
    incomes: [{ amount: 2000000, day: 25 }, { amount: 100000, day: 10 }],
    monthlyFixed: [{ amount: 500000, day: 1 }, { amount: 200000, day: 10 }],
    dailyOut: 1000,
    scheduled: [{ date: '2026-11-14', amount: 50000, label: '할부' }],
  });
  const [oct, nov] = r.months;
  // 10월: 10/14~31(18일). 10/1·10/10 흐름은 이미 앵커에 반영 → 세지 않는다
  assert.deepStrictEqual(
    { month: oct.month, inflow: oct.inflow, fixed: oct.fixed, daily: oct.daily, net: oct.net, partial: oct.partial },
    { month: '2026-10', inflow: 2000000, fixed: 0, daily: 18000, net: 1982000, partial: true },
  );
  assert.strictEqual(oct.endBalance, 2582000);
  // 11월 전체: 수입 2,100,000 − 고정 700,000 − 할부 50,000 − 일일 30,000 = 1,320,000
  assert.deepStrictEqual(
    { inflow: nov.inflow, fixed: nov.fixed, scheduled: nov.scheduled, daily: nov.daily, net: nov.net, partial: nov.partial },
    { inflow: 2100000, fixed: 700000, scheduled: 50000, daily: 30000, net: 1320000, partial: false },
  );
  assert.strictEqual(nov.endBalance, 2582000 + 1320000);
});

test('일별 원자료 + 일별 여유자금(다음 월급 전날까지 최저잔액)', () => {
  const r = cycleHeadroom({
    asOf: '2026-10-13', anchorAmount: 1000000, target: '2026-11-05', recordDaily: true,
    incomes: [{ amount: 2000000, day: 25, label: '월급' }],
    monthlyFixed: [{ amount: 300000, day: 20 }, { amount: 3000000, day: 28 }],
  });
  const at = (d) => r.days.find((x) => x.date === d);
  assert.strictEqual(r.days.length, 24);                 // 10/13(앵커)~11/05
  assert.strictEqual(at('2026-10-13').balance, 1000000);
  assert.strictEqual(at('2026-10-24').balance, 700000);
  assert.strictEqual(at('2026-10-25').balance, 2700000);
  assert.strictEqual(at('2026-10-28').balance, -300000);
  // 월급 전 구간은 월급 뒤 큰 유출과 섞이지 않는다
  assert.strictEqual(at('2026-10-13').spendable, 700000);
  assert.strictEqual(at('2026-10-24').spendable, 700000);
  // 월급날부터는 다음 월급 전까지(여기선 구간 끝) — 10/28 유출이 걸린다
  assert.strictEqual(at('2026-10-25').spendable, -300000);
  assert.strictEqual(r.days[r.days.length - 1].spendable, -300000);
});

test('recordDaily 를 끄면 days 는 null', () => {
  const r = cycleHeadroom({ asOf: '2026-10-13', anchorAmount: 0, target: '2026-10-15' });
  assert.strictEqual(r.days, null);
});

test('월급날은 가장 큰 수입 기준(작은 수입이 먼저 나열돼도)', () => {
  const r = cycleHeadroom({
    asOf: '2026-10-13', anchorAmount: 1000000, target: '2026-11-05', recordDaily: true,
    incomes: [{ amount: 100000, day: 20, label: '정산' }, { amount: 2000000, day: 25, label: '월급' }],
    monthlyFixed: [{ amount: 3000000, day: 28 }],
  });
  const at = (d) => r.days.find((x) => x.date === d);
  // 10/20 정산은 월급날이 아니다 → 10/24 의 창은 10/24 하루(다음날이 월급), 10/28 유출과 무관
  assert.strictEqual(at('2026-10-24').spendable, 1100000);
});
