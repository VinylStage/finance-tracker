const { test, describe, before } = require('node:test');
const assert = require('node:assert');

let budgetStatus, budgetLabel;

before(async () => {
  ({ budgetStatus, budgetLabel } = await import('../client/src/lib/budget.js'));
});

describe('budgetStatus', () => {
  const monthlyBudget = 100000;

  test('spent 0, ratio 0%', () => {
    const status = budgetStatus(0, monthlyBudget);
    assert.strictEqual(status.level, 'normal');
    assert.strictEqual(status.barPct, 0);
    assert.strictEqual(status.remaining, 100000);
    assert.strictEqual(status.over, 0);
  });

  test('spent 79000, ratio 79%', () => {
    const status = budgetStatus(79000, monthlyBudget);
    assert.strictEqual(status.level, 'normal');
    assert.strictEqual(status.barPct, 79);
    assert.strictEqual(status.remaining, 21000);
    assert.strictEqual(status.over, 0);
  });

  test('spent 79999, ratio 79.999%', () => {
    const status = budgetStatus(79999, monthlyBudget);
    assert.strictEqual(status.level, 'normal');
    assert.strictEqual(status.barPct, 80);
    assert.strictEqual(status.remaining, 20001);
    assert.strictEqual(status.over, 0);
  });

  test('spent 80000, ratio 80%', () => {
    const status = budgetStatus(80000, monthlyBudget);
    assert.strictEqual(status.level, 'caution');
    assert.strictEqual(status.barPct, 80);
    assert.strictEqual(status.remaining, 20000);
    assert.strictEqual(status.over, 0);
  });

  test('spent 99000, ratio 99%', () => {
    const status = budgetStatus(99000, monthlyBudget);
    assert.strictEqual(status.level, 'caution');
    assert.strictEqual(status.barPct, 99);
    assert.strictEqual(status.remaining, 1000);
    assert.strictEqual(status.over, 0);
  });

  test('spent 100000, ratio 100%', () => {
    const status = budgetStatus(100000, monthlyBudget);
    assert.strictEqual(status.level, 'caution');
    assert.strictEqual(status.barPct, 100);
    assert.strictEqual(status.remaining, 0);
    assert.strictEqual(status.over, 0);
  });

  test('spent 100001, ratio 100.001%', () => {
    const status = budgetStatus(100001, monthlyBudget);
    assert.strictEqual(status.level, 'over');
    assert.strictEqual(status.barPct, 100);
    assert.strictEqual(status.remaining, 0);
    assert.strictEqual(status.over, 1);
  });

  test('spent 150000, ratio 150%', () => {
    const status = budgetStatus(150000, monthlyBudget);
    assert.strictEqual(status.level, 'over');
    assert.strictEqual(status.barPct, 100);
    assert.strictEqual(status.remaining, 0);
    assert.strictEqual(status.over, 50000);
  });

  test('budget is 0', () => {
    const status = budgetStatus(50000, 0);
    assert.strictEqual(status.level, 'normal');
    assert.strictEqual(status.barPct, 0);
  });

  test('budget is null', () => {
    const status = budgetStatus(50000, null);
    assert.strictEqual(status.level, 'normal');
    assert.strictEqual(status.barPct, 0);
  });

  test('spent is null', () => {
    const status = budgetStatus(null, 100000);
    assert.strictEqual(status.level, 'normal');
    assert.strictEqual(status.barPct, 0);
    assert.strictEqual(status.remaining, 100000);
  });
});

describe('budgetLabel', () => {
  const fmt = (n) => n.toLocaleString('ko-KR') + '원';

  test('normal status', () => {
    const status = budgetStatus(50000, 100000);
    const label = budgetLabel(status, fmt);
    assert.strictEqual(label, '50,000원 남음');
  });

  test('caution status', () => {
    const status = budgetStatus(85000, 100000);
    const label = budgetLabel(status, fmt);
    assert.strictEqual(label, '15,000원 남음 (얼마 안 남음)');
  });

  test('over status', () => {
    const status = budgetStatus(150000, 100000);
    const label = budgetLabel(status, fmt);
    assert.strictEqual(label, '50,000원 초과');
  });
});
