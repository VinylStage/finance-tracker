'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { localYearMonth, localYearMonthParts } = require('../src/utils/date');

test('문자열판은 YYYY-MM 을 돌려준다', () => {
  assert.strictEqual(localYearMonth(new Date(2026, 8, 5)), '2026-09');
});

test('한 자리 달은 0 을 채운다', () => {
  assert.strictEqual(localYearMonth(new Date(2027, 0, 1)), '2027-01');
});

test('12월은 그대로 12', () => {
  assert.strictEqual(localYearMonth(new Date(2026, 11, 31)), '2026-12');
});

test('배열판은 숫자 둘', () => {
  assert.deepStrictEqual(localYearMonthParts(new Date(2026, 8, 5)), [2026, 9]);
});

test('두 판이 같은 달을 가리킨다', () => {
  const dates = [new Date(2026, 0, 1), new Date(2026, 8, 30), new Date(2026, 11, 31)];
  for (const d of dates) {
    const [y, m] = localYearMonthParts(d);
    assert.strictEqual(`${y}-${String(m).padStart(2, '0')}`, localYearMonth(d));
  }
});

test('인자 없이 부르면 오늘의 YYYY-MM', () => {
  assert.match(localYearMonth(), /^\d{4}-\d{2}$/);
});
