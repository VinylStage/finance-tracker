'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { projectCashflow, monthAdd, monthDiff } = require('../../src/services/advisor/projection');

test('monthAdd / monthDiff 경계', () => {
  assert.strictEqual(monthAdd('2026-10', 3), '2027-01');
  assert.strictEqual(monthAdd('2026-01', -1), '2025-12');
  assert.strictEqual(monthDiff('2027-01', '2026-10'), 3);
});

test('앵커에서만 전개(이전 이력 무시) + 반복/할부', () => {
  const r = projectCashflow({
    anchor: { month: '2026-10', amount: 1000000 },
    horizonMonths: 4,
    monthlyIncome: 500000,
    recurring: [{ amount: 100000, label: '구독' }],
    installments: [{ monthlyAmount: 200000, startMonth: '2026-10', months: 2, label: '기존할부' }],
  });
  // 10월: +500k -100k(구독) -200k(할부) = +200k → 1,200,000
  assert.strictEqual(r.timeline[0].balance, 1200000);
  // 11월: 할부 마지막 → 1,400,000
  assert.strictEqual(r.timeline[1].balance, 1400000);
  // 12월: 할부 끝(off=2, >=months) → +400k → 1,800,000
  assert.strictEqual(r.timeline[2].outflow, 100000);
  assert.strictEqual(r.timeline[2].balance, 1800000);
  assert.strictEqual(r.firstNegativeMonth, null);
});

test('휴대폰 구입 시뮬(할부) → 월별 유출 + 적자 감지', () => {
  const base = { anchor: { month: '2026-10', amount: 300000 }, horizonMonths: 6, monthlyIncome: 0, recurring: [{ amount: 50000 }] };
  // 시뮬 없이: 매월 -50k → 6개월 후 0, 적자 안 남(마지막달 300k-300k=0)
  const noSim = projectCashflow(base);
  assert.strictEqual(noSim.firstNegativeMonth, null);
  assert.strictEqual(noSim.minBalance, 0);
  // 휴대폰 24개월 할부(월 40k) 2026-11 시작 추가 → 11월부터 -90k
  const sim = projectCashflow({ ...base, simulated: [{ kind: 'installment', monthlyAmount: 40000, startMonth: '2026-11', months: 24, label: '휴대폰' }] });
  // 10월: 300k-50k=250k / 11월:250-90=160 / 12월:70 / 1월:70-90=-20 → 적자
  assert.strictEqual(sim.timeline[0].balance, 250000);
  assert.strictEqual(sim.timeline[3].balance, -20000);
  assert.strictEqual(sim.firstNegativeMonth, '2027-01');
  assert.ok(sim.minBalance < 0);
});

test('lumpsum(일시 지출) 특정 월 반영', () => {
  const r = projectCashflow({
    anchor: { month: '2026-10', amount: 500000 }, horizonMonths: 3, monthlyIncome: 0,
    simulated: [{ kind: 'lumpsum', amount: 600000, month: '2026-11', label: '보증금' }],
  });
  assert.strictEqual(r.timeline[1].outflow, 600000);
  assert.strictEqual(r.timeline[1].balance, -100000);
  assert.strictEqual(r.firstNegativeMonth, '2026-11');
});
