const { test, describe, before } = require('node:test');
const assert = require('node:assert');

let monthsBetween, savingsProgress, MILESTONES;

before(async () => {
  ({ monthsBetween, savingsProgress, MILESTONES } = await import('../client/src/lib/savingsProgress.js'));
});

describe('monthsBetween', () => {
  test('same date', () => {
    assert.strictEqual(monthsBetween('2025-01-15', '2025-01-15'), 0);
  });

  test('less than a month', () => {
    assert.strictEqual(monthsBetween('2025-01-15', '2025-02-14'), 0);
  });

  test('exactly one month', () => {
    assert.strictEqual(monthsBetween('2025-01-15', '2025-02-15'), 1);
  });

  test('exactly one year', () => {
    assert.strictEqual(monthsBetween('2025-01-15', '2026-01-15'), 12);
  });

  test('end of month case', () => {
    assert.strictEqual(monthsBetween('2025-01-31', '2025-02-28'), 0);
  });

  test('negative difference', () => {
    assert.strictEqual(monthsBetween('2025-01-15', '2024-12-15'), -1);
  });

  test('null from date', () => {
    assert.strictEqual(monthsBetween(null, '2025-01-15'), null);
  });

  test('invalid to date', () => {
    assert.strictEqual(monthsBetween('2025-01-15', 'bad'), null);
  });

  test('invalid from date format', () => {
    assert.strictEqual(monthsBetween('2025-1-5', '2025-02-15'), null);
  });
});

describe('savingsProgress', () => {
  const base = { monthly_contribution: 100000, start_date: '2025-01-15', maturity_date: '2026-01-15', status: '진행중' };

  test('start date', () => {
    const result = savingsProgress(base, '2025-01-15');
    assert.strictEqual(result.hasSchedule, true);
    assert.strictEqual(result.totalMonths, 12);
    assert.strictEqual(result.paidMonths, 1);
    assert.strictEqual(result.goal, 1200000);
    assert.strictEqual(result.contributed, 100000);
    assert.strictEqual(result.remaining, 1100000);
    assert.strictEqual(result.ratio, 1/12);
    assert.strictEqual(result.barPct, 8);
    assert.strictEqual(result.milestone, null);
  });

  test('after 2 months', () => {
    const result = savingsProgress(base, '2025-03-15');
    assert.strictEqual(result.hasSchedule, true);
    assert.strictEqual(result.totalMonths, 12);
    assert.strictEqual(result.paidMonths, 3);
    assert.strictEqual(result.goal, 1200000);
    assert.strictEqual(result.contributed, 300000);
    assert.strictEqual(result.remaining, 900000);
    assert.strictEqual(result.ratio, 3/12);
    assert.strictEqual(result.barPct, 25);
    assert.strictEqual(result.milestone, 0.25);
  });

  test('after 5 months', () => {
    const result = savingsProgress(base, '2025-06-15');
    assert.strictEqual(result.hasSchedule, true);
    assert.strictEqual(result.totalMonths, 12);
    assert.strictEqual(result.paidMonths, 6);
    assert.strictEqual(result.goal, 1200000);
    assert.strictEqual(result.contributed, 600000);
    assert.strictEqual(result.remaining, 600000);
    assert.strictEqual(result.ratio, 6/12);
    assert.strictEqual(result.barPct, 50);
    assert.strictEqual(result.milestone, 0.5);
  });

  test('after 8 months', () => {
    const result = savingsProgress(base, '2025-09-15');
    assert.strictEqual(result.hasSchedule, true);
    assert.strictEqual(result.totalMonths, 12);
    assert.strictEqual(result.paidMonths, 9);
    assert.strictEqual(result.goal, 1200000);
    assert.strictEqual(result.contributed, 900000);
    assert.strictEqual(result.remaining, 300000);
    assert.strictEqual(result.ratio, 9/12);
    assert.strictEqual(result.barPct, 75);
    assert.strictEqual(result.milestone, 0.75);
  });

  test('maturity date', () => {
    const result = savingsProgress(base, '2026-01-15');
    assert.strictEqual(result.hasSchedule, true);
    assert.strictEqual(result.totalMonths, 12);
    assert.strictEqual(result.paidMonths, 12);
    assert.strictEqual(result.goal, 1200000);
    assert.strictEqual(result.contributed, 1200000);
    assert.strictEqual(result.remaining, 0);
    assert.strictEqual(result.ratio, 1);
    assert.strictEqual(result.barPct, 100);
    assert.strictEqual(result.milestone, 0.75);
  });

  test('after maturity date', () => {
    const result = savingsProgress(base, '2027-01-15');
    assert.strictEqual(result.hasSchedule, true);
    assert.strictEqual(result.totalMonths, 12);
    assert.strictEqual(result.paidMonths, 12);
    assert.strictEqual(result.goal, 1200000);
    assert.strictEqual(result.contributed, 1200000);
    assert.strictEqual(result.remaining, 0);
    assert.strictEqual(result.ratio, 1);
    assert.strictEqual(result.barPct, 100);
    assert.strictEqual(result.milestone, 0.75);
  });

  test('before start date', () => {
    const result = savingsProgress(base, '2024-06-15');
    assert.strictEqual(result.hasSchedule, true);
    assert.strictEqual(result.totalMonths, 12);
    assert.strictEqual(result.paidMonths, 0);
    assert.strictEqual(result.goal, 1200000);
    assert.strictEqual(result.contributed, 0);
    assert.strictEqual(result.remaining, 1200000);
    assert.strictEqual(result.ratio, 0);
    assert.strictEqual(result.barPct, 0);
    assert.strictEqual(result.milestone, null);
  });

  test('completed product', () => {
    const completed = { ...base, status: '완료' };
    const result = savingsProgress(completed, '2025-02-15');
    assert.strictEqual(result.hasSchedule, true);
    assert.strictEqual(result.totalMonths, 12);
    assert.strictEqual(result.paidMonths, 12);
    assert.strictEqual(result.goal, 1200000);
    assert.strictEqual(result.contributed, 1200000);
    assert.strictEqual(result.remaining, 0);
    assert.strictEqual(result.ratio, 1);
    assert.strictEqual(result.barPct, 100);
    assert.strictEqual(result.milestone, 0.75);
  });

  test('no maturity date', () => {
    const result = savingsProgress({ ...base, maturity_date: null }, '2025-02-15');
    assert.strictEqual(result.hasSchedule, false);
    assert.strictEqual(result.barPct, 0);
    assert.strictEqual(result.goal, 0);
  });

  test('maturity date same as start date', () => {
    const result = savingsProgress({ ...base, maturity_date: '2025-01-15' }, '2025-02-15');
    assert.strictEqual(result.hasSchedule, false);
    assert.strictEqual(result.barPct, 0);
    assert.strictEqual(result.goal, 0);
  });

  test('maturity date before start date', () => {
    const result = savingsProgress({ ...base, maturity_date: '2024-01-15' }, '2025-02-15');
    assert.strictEqual(result.hasSchedule, false);
    assert.strictEqual(result.barPct, 0);
    assert.strictEqual(result.goal, 0);
  });

  test('zero monthly contribution', () => {
    const result = savingsProgress({ ...base, monthly_contribution: 0 }, '2025-02-15');
    assert.strictEqual(result.hasSchedule, false);
    assert.strictEqual(result.barPct, 0);
    assert.strictEqual(result.goal, 0);
  });

  test('null product', () => {
    const result = savingsProgress(null, '2025-02-15');
    assert.strictEqual(result.hasSchedule, false);
    assert.strictEqual(result.barPct, 0);
    assert.strictEqual(result.goal, 0);
  });
});

test('MILESTONES', () => {
  assert.deepStrictEqual(MILESTONES, [0.25, 0.5, 0.75]);
});
