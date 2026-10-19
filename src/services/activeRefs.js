'use strict';

function inactiveRefError(db, body, existing = null) {
  const checks = [
    { field: 'category_id', table: 'categories', error: '비활성화된 분류는 새 거래·규칙에 쓸 수 없습니다.' },
    { field: 'payment_method_id', table: 'payment_methods', error: '비활성화된 결제수단은 새 거래·규칙에 쓸 수 없습니다.' }
  ];

  for (const { field, table, error } of checks) {
    const value = body[field];
    if (value === undefined || value === null || value === '') continue;
    
    const id = Number(value);
    if (!Number.isInteger(id)) continue;
    if (existing && Number(existing[field]) === id) continue;

    const row = db.prepare(`SELECT is_active FROM ${table} WHERE id = ?`).get(id);
    if (!row) continue;
    if (row.is_active === 0) {
      return error;
    }
  }

  return null;
}

function usageOf(db, kind, id) {
  let column;
  if (kind === 'category') {
    column = 'category_id';
  } else if (kind === 'payment_method') {
    column = 'payment_method_id';
  } else {
    throw new Error('unknown kind');
  }

  const activeRules = db.prepare(`SELECT count(*) AS n FROM recurring_rules WHERE ${column} = ? AND is_active = 1`).get(id).n;
  const transactions = db.prepare(`SELECT count(*) AS n FROM transactions WHERE ${column} = ?`).get(id).n;

  return { active_rules: activeRules, transactions };
}

module.exports = { inactiveRefError, usageOf };
