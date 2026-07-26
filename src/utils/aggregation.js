'use strict';
const db = require('../db/init');

// FND-13(감사): "지출 = 수입이 아닌 카테고리 중 할부·리볼빙 제외" 규칙이
// transactions.js 6곳 + cashflow.js 1곳에 SQL 조각 단위로 완전히 동일하게
// 중복돼 있었다. 규칙이 바뀌면 한 곳만 고치면 되도록 단일 상수로 추출한다.
// 사용하는 모든 쿼리가 transactions AS t, categories AS c 로 조인한다고 가정한다.
const INCOME_CASE = `CASE WHEN c.major_type = '수입' THEN t.amount ELSE 0 END`;
const EXPENSE_CASE = `CASE WHEN c.major_type != '수입' AND t.payment_style NOT IN ('할부','리볼빙') THEN t.amount ELSE 0 END`;

// FND-05(감사): installments.js가 청구 기간 종료를 반영하지 않고 "진행중"
// 상태 + 시작월만 보고 합산해, 종료된 할부까지 계속 이번 달 합계에 포함시켰다
// (할부 상태 자동 전이가 없어 사람이 수동으로 '완료' 처리하기 전까지는 종료 후에도
// '진행중'으로 남아있는 게 정상 상태다 — 그래서 쿼리가 청구 기간 종료를 직접
// 계산해야 한다). transactions.js 대시보드가 쓰던 정확한 버전으로 통일한다.
function installmentsDueForMonth(month) {
  return db.prepare(`
    SELECT COALESCE(SUM(monthly_amount), 0) AS total
    FROM installments
    WHERE status = '진행중'
      AND start_billing_month <= ?
      AND ? < strftime('%Y-%m', date(start_billing_month || '-01', '+' || months || ' months'))
  `).get(month, month).total;
}

// FND-08(감사): transactions.js 대시보드의 월별 트렌드가
// "strftime('%Y-%m', t.date) >= ? AND strftime('%Y-%m', t.date) <= ?"로
// 필터링해 인덱스 컬럼을 함수로 감싼 탓에 풀스캔이었다. [시작월 1일, 끝월
// 다음달 1일) 범위 비교로 바꿔 idx_tx_date를 타도록 한다. GROUP BY 표현식
// 자체는 strftime을 써도 무방하다 — WHERE만 sargable하면 인덱스를 쓴다.
function monthlyTotalsInRange(startMonth, endMonthInclusive) {
  const start = `${startMonth}-01`;
  const [endY, endM] = endMonthInclusive.split('-').map(Number);
  const endExclusive = endM === 12 ? `${endY + 1}-01-01` : `${endY}-${String(endM + 1).padStart(2, '0')}-01`;
  const rows = db.prepare(`
    SELECT strftime('%Y-%m', t.date) AS month,
      COALESCE(SUM(${INCOME_CASE}), 0) AS income,
      COALESCE(SUM(${EXPENSE_CASE}), 0) AS expense
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    WHERE t.date >= ? AND t.date < ?
    GROUP BY month
  `).all(start, endExclusive);
  return new Map(rows.map(r => [r.month, r]));
}

module.exports = { INCOME_CASE, EXPENSE_CASE, installmentsDueForMonth, monthlyTotalsInRange };
