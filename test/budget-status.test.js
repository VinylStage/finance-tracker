const { test, describe, before } = require('node:test');
const assert = require('node:assert');

let budgetStatus, budgetLabel, overflowWidthPx, CAUTION_TICK_PCT;

before(async () => {
  ({ budgetStatus, budgetLabel, overflowWidthPx, CAUTION_TICK_PCT } = await import('../client/src/lib/budget.js'));
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

  // 상태는 명사로 끝낸다. "(얼마 안 남음)" 은 같은 말을 문장으로 늘여 쓴 것이라
  // 남은 금액과 상태 사이의 위계가 흐려졌다.
  test('caution status', () => {
    const status = budgetStatus(85000, 100000);
    const label = budgetLabel(status, fmt);
    assert.strictEqual(label, '15,000원 남음 · 주의');
  });

  test('over status', () => {
    const status = budgetStatus(150000, 100000);
    const label = budgetLabel(status, fmt);
    assert.strictEqual(label, '50,000원 초과');
  });
});

describe('초과 세그먼트 · 임계 눈금', () => {
  test('임계 눈금은 caution 경계와 같은 지점이다', () => {
    // 눈금이 상태 경계와 어긋나면 "눈금을 넘었는데 아직 정상" 같은 상태가 생긴다.
    assert.strictEqual(CAUTION_TICK_PCT, 80);
  });

  test('초과하지 않으면 세그먼트가 없다', () => {
    assert.strictEqual(overflowWidthPx(budgetStatus(50000, 100000)), 0);
    assert.strictEqual(overflowWidthPx(budgetStatus(100000, 100000)), 0);
  });

  test('100.0% 는 초과가 아니다 — 세그먼트도 나오지 않는다', () => {
    // 경계를 어느 쪽에 붙이느냐가 문구와 막대를 함께 바꾼다. 둘이 어긋나면
    // "초과 세그먼트는 떴는데 문구는 남음" 같은 상태가 생긴다.
    const s = budgetStatus(100000, 100000);
    assert.strictEqual(s.level, 'caution');
    assert.strictEqual(overflowWidthPx(s), 0);
  });

  test('초과분이 클수록 세그먼트가 길어진다', () => {
    const small = overflowWidthPx(budgetStatus(105000, 100000));
    const mid = overflowWidthPx(budgetStatus(125000, 100000));
    const large = overflowWidthPx(budgetStatus(145000, 100000));
    assert.ok(small > 0, '조금이라도 초과하면 보여야 한다');
    assert.ok(small < mid && mid < large);
  });

  test('세그먼트 길이에는 상한이 있다', () => {
    // 상한이 없으면 10배 초과한 카테고리 하나가 레이아웃을 밀어낸다.
    // 그 지점부터는 길이가 아니라 문구가 크기를 전달한다.
    const at50 = overflowWidthPx(budgetStatus(150000, 100000));
    const at1000 = overflowWidthPx(budgetStatus(1100000, 100000));
    assert.strictEqual(at50, at1000);
    assert.ok(at1000 <= 44);
  });

  test('예산이 0 이면 초과를 정의할 수 없다', () => {
    assert.strictEqual(overflowWidthPx(budgetStatus(50000, 0)), 0);
  });
});
