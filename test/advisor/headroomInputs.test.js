'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { paymentDate, nextIncomeDate } = require('../../src/services/advisor/headroomInputs');

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
