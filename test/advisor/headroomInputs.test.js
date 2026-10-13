'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { paymentDate, nextIncomeDate, monthsToTimeline, simToScheduled } = require('../../src/services/advisor/headroomInputs');

test('paymentDate: 결제일이 그 달 말일을 넘으면 말일', () => {
  assert.strictEqual(paymentDate('2026-11', 31), '2026-11-30');
  assert.strictEqual(paymentDate('2028-02', 30), '2028-02-29');
  assert.strictEqual(paymentDate('2026-10', 14), '2026-10-14');
});

test('nextIncomeDate: 가장 큰 수입의 다음 발생일', () => {
  const inc = [{ amount: 170000, day: 10 }, { amount: 2460000, day: 25 }];
  assert.strictEqual(nextIncomeDate(inc, '2026-11-14'), '2026-11-25');
  assert.strictEqual(nextIncomeDate(inc, '2026-11-25'), '2026-12-25');
});

// 일별 엔진 month 집계 → 전망 타임라인. 월말잔액을 잔액으로, minBalance·
// firstNegativeMonth 도 월말 기준.
test('monthsToTimeline: 월말잔액 매핑 + 첫 적자월 + 최소잔액 + partial 보존', () => {
  const months = [
    { month: '2026-10', inflow: 2000000, outflow: 0, net: 2000000, endBalance: 2600000, partial: true },
    { month: '2026-11', inflow: 2000000, outflow: 2600000, net: -600000, endBalance: 2000000, partial: false },
    // 월말잔액이 정확히 0 인 달 — 0 은 '적자' 가 아니다(< 0 이지 <= 0 이 아님).
    { month: '2026-12', inflow: 0, outflow: 2000000, net: -2000000, endBalance: 0, partial: false },
    { month: '2027-01', inflow: 0, outflow: 100000, net: -100000, endBalance: -100000, partial: false },
    { month: '2027-02', inflow: 3000000, outflow: 0, net: 3000000, endBalance: 2900000, partial: false },
  ];
  const { timeline, minBalance, firstNegativeMonth } = monthsToTimeline(months);
  assert.strictEqual(timeline.length, 5);
  assert.deepStrictEqual(timeline[0], { month: '2026-10', inflow: 2000000, outflow: 0, net: 2000000, balance: 2600000, partial: true });
  assert.strictEqual(timeline[1].balance, 2000000);          // endBalance 를 balance 로
  // 잔액 0 인 2026-12 는 적자가 아니다 → 첫 적자월은 실제 음수인 2027-01.
  assert.strictEqual(firstNegativeMonth, '2027-01');
  assert.strictEqual(minBalance, -100000);                    // 월말잔액 최소(이후 회복돼도 최소는 유지)
  assert.strictEqual(timeline[4].partial, false);
});

test('monthsToTimeline: 적자 없으면 firstNegativeMonth=null, 빈 입력은 minBalance 0', () => {
  const r = monthsToTimeline([{ month: '2026-10', inflow: 1, outflow: 0, net: 1, endBalance: 100, partial: false }]);
  assert.strictEqual(r.firstNegativeMonth, null);
  assert.strictEqual(r.minBalance, 100);
  const empty = monthsToTimeline([]);
  assert.strictEqual(empty.minBalance, 0);
  assert.strictEqual(empty.firstNegativeMonth, null);
});

// what-if 시나리오 → scheduled(현금·월말). 할부는 회차마다, 일시불은 1건.
test('simToScheduled: 할부는 회차별 말일 배치 + 라벨', () => {
  const sch = simToScheduled([{ kind: 'installment', monthlyAmount: 50000, startMonth: '2026-11', months: 3, label: '노트북' }]);
  assert.deepStrictEqual(sch, [
    { date: '2026-11-30', amount: 50000, label: '노트북' },
    { date: '2026-12-31', amount: 50000, label: '노트북' },
    { date: '2027-01-31', amount: 50000, label: '노트북' },
  ]);
});

test('simToScheduled: 일시불은 1건, 라벨 기본값, 0/빈 입력은 제외', () => {
  assert.deepStrictEqual(
    simToScheduled([{ kind: 'lumpsum', amount: 1000000, month: '2026-12' }]),
    [{ date: '2026-12-31', amount: 1000000, label: '추가 지출' }]
  );
  assert.deepStrictEqual(simToScheduled([{ kind: 'lumpsum', amount: 0, month: '2026-12' }]), []);
  assert.deepStrictEqual(simToScheduled([]), []);
  assert.deepStrictEqual(simToScheduled(), []);
});
