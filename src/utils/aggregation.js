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

module.exports = { INCOME_CASE, EXPENSE_CASE, installmentsDueForMonth };
