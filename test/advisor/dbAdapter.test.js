'use strict';

// dbAdapter 단위 — better-sqlite3 없이 스텁 db 로 SQL 매핑/필터만 검증한다.

const test = require('node:test');
const assert = require('node:assert');
const { loadInstallments, loadRecurringMonthly, latestAnchor } = require('../../src/services/advisor/dbAdapter');

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

test('loadRecurringMonthly 바인딩 인자(월 경계)', () => {
  let captured;
  const db = { prepare: (sql) => ({ all: (...a) => { captured = a; return [{ amount: 9900, label: '구독' }]; } }) };
  const out = loadRecurringMonthly(db, '2026-10');
  assert.deepStrictEqual(out, [{ amount: 9900, label: '구독' }]);
  assert.deepStrictEqual(captured, ['2026-10-31', '2026-10-01']);
});

test('latestAnchor 기준일 이전 최근', () => {
  const db = stubDb({ get: () => ({ as_of_date: '2026-10-13', amount: 2000000 }) });
  assert.deepStrictEqual(latestAnchor(db, '2026-10-20'), { month: '2026-10', amount: 2000000 });
  const empty = stubDb({ get: () => null });
  assert.strictEqual(latestAnchor(empty, '2020-01-01'), null);
});
