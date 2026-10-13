'use strict';

// dbAdapter 단위 — better-sqlite3 없이 스텁 db 로 SQL 매핑/필터만 검증한다.

const test = require('node:test');
const assert = require('node:assert');
const { loadInstallments, loadRecurringRules, latestAnchor } = require('../../src/services/advisor/dbAdapter');

// sql 문자열에 따라 캔드 결과를 돌려주는 최소 스텁.
function stubDb(spec) {
  return {
    prepare(sql) {
      return {
        all: (...args) => (typeof spec.all === 'function' ? spec.all(sql, args) : spec.all || []),
        get: (...args) => (typeof spec.get === 'function' ? spec.get(sql, args) : spec.get || null),
      };
    },
  };
}

test('loadInstallments 필드 매핑', () => {
  const db = stubDb({ all: () => [{ monthlyAmount: 100, startMonth: '2026-11', months: 3, label: 'X' }] });
  assert.deepStrictEqual(loadInstallments(db), [{ monthlyAmount: 100, startMonth: '2026-11', months: 3, label: 'X' }]);
});


test('latestAnchor 기준일 이전 최근', () => {
  const db = stubDb({ get: () => ({ as_of_date: '2026-10-13', amount: 2000000 }) });
  assert.deepStrictEqual(latestAnchor(db, '2026-10-20'), { month: '2026-10', amount: 2000000 });
  const empty = stubDb({ get: () => null });
  assert.strictEqual(latestAnchor(empty, '2020-01-01'), null);
});


test('loadRecurringRules: 수입/지출 분리 + daily + 기간', () => {
  const db = stubDb({ all: () => [
    { amount: 100000, label: '월세', freq: 'monthly', starts_on: null, ends_on: null, majorType: '고정지출' },
    { amount: 3000, label: '자동매수', freq: 'daily', starts_on: null, ends_on: null, majorType: '저축' },
    { amount: 2460000, label: '월급', freq: 'monthly', starts_on: null, ends_on: null, majorType: '수입' },
    { amount: 52000, label: '통신요금', freq: 'monthly', starts_on: '2026-11-01', ends_on: null, majorType: '고정지출' },
  ] });
  const { expense, income } = loadRecurringRules(db);
  assert.strictEqual(income.length, 1);
  assert.strictEqual(income[0].amount, 2460000);
  assert.strictEqual(expense.length, 3);
  assert.deepStrictEqual(expense.find(e=>e.label==='자동매수'), { label:'자동매수', startMonth:undefined, endMonth:undefined, dailyAmount:3000 });
  assert.strictEqual(expense.find(e=>e.label==='통신요금').startMonth, '2026-11');
});
