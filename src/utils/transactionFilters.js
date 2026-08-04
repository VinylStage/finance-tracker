'use strict';
const { asInt, escapeLike } = require('./validate');

// FND-02(감사): 화면(client/Transactions.jsx)이 최대 5000건을 요청했지만
// 서버가 500건으로 잘라(응답의 total은 정확했지만 화면이 안 씀) 검색/월별합계/
// 연도탭이 최신 500건 범위 안에서만 동작했다. 근본 해결은 검색·집계를 서버
// 파라미터로 전부 넘기는 것 — 이 함수가 그 필터를 목록/월별요약 두 라우트가
// 공유하는 단일 WHERE 절로 만든다(중복 방지).
//
// 카드 재매핑(#302 3단계)도 같은 조건으로 대상을 고른다. 사용자는 거래내역에서
// 범위를 좁혀 본 뒤 그 범위를 그대로 재매핑하므로, 두 화면이 같은 기간·가맹점·
// 금액대를 다르게 해석하면 "목록에 보이던 건수" 와 "바뀐 건수" 가 어긋난다.
// 라우트 안에 두면 공유할 수 없어 여기로 옮겼다.
function buildTransactionFilters(query) {
  const { from, to, category_id, merchant, memo, min_amount, max_amount, payment_method_id } = query;
  let where = ' WHERE 1=1';
  const params = [];
  if (from) { where += ' AND t.date >= ?'; params.push(from); }
  if (to)   { where += ' AND t.date <= ?'; params.push(to); }
  if (category_id) {
    const ids = String(category_id).split(',').map(s => asInt(s.trim())).filter(v => v !== null);
    if (ids.length) { where += ` AND t.category_id IN (${ids.map(() => '?').join(',')})`; params.push(...ids); }
  }
  if (merchant) { where += ` AND t.merchant LIKE ? ESCAPE '\\'`; params.push(`%${escapeLike(merchant)}%`); }
  if (memo) { where += ` AND t.memo LIKE ? ESCAPE '\\'`; params.push(`%${escapeLike(memo)}%`); }
  if (min_amount !== undefined && min_amount !== '') {
    const v = asInt(min_amount);
    if (v !== null) { where += ' AND t.amount >= ?'; params.push(v); }
  }
  if (max_amount !== undefined && max_amount !== '') {
    const v = asInt(max_amount);
    if (v !== null) { where += ' AND t.amount <= ?'; params.push(v); }
  }
  if (payment_method_id) {
    const v = asInt(payment_method_id);
    if (v !== null) { where += ' AND t.payment_method_id = ?'; params.push(v); }
  }
  return { where, params };
}

module.exports = { buildTransactionFilters };
