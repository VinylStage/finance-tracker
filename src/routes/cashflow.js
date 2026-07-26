'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { pad2, lastNDates, lastNWeeks, lastNMonths, lastNYears, localYMD } = require('../utils/date');
const { INCOME_CASE, EXPENSE_CASE, rangeTotalsByDate } = require('../utils/aggregation');

// FND-07(감사): 기간(일/주/월/년)마다 쿼리를 따로 날려(최대 30회) N+1을 만들었다.
// transactions.js가 검증해 쓰던 "범위 전체를 한 번에 조회 후 JS에서 기간별로
// 합산" 패턴을 그대로 이식한다. 겸사겸사 monthly/yearly의 WHERE 절도
// strftime(...)  등호 비교(FND-08, 인덱스를 못 씀) 대신 date >= ? AND date < ?
// 범위 비교로 바꿔, cashflow.js 부분은 FND-08의 non-sargable 문제도 함께
// 해소한다(GROUP BY 표현식 자체는 strftime을 써도 무방 — WHERE만 sargable하면 됨).
function monthlyRangeRows(months) {
  const start = `${months[0]}-01`;
  const [endY, endM] = months[months.length - 1].split('-').map(Number);
  const endExclusive = endM === 12 ? `${endY + 1}-01-01` : `${endY}-${pad2(endM + 1)}-01`;
  return db.prepare(`
    SELECT strftime('%Y-%m', t.date) AS period,
      COALESCE(SUM(${INCOME_CASE}), 0) AS income,
      COALESCE(SUM(${EXPENSE_CASE}), 0) AS expense
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    WHERE t.date >= ? AND t.date < ?
    GROUP BY period
  `).all(start, endExclusive);
}

function yearlyRangeRows(years) {
  const start = `${years[0]}-01-01`;
  const endExclusive = `${Number(years[years.length - 1]) + 1}-01-01`;
  return db.prepare(`
    SELECT strftime('%Y', t.date) AS period,
      COALESCE(SUM(${INCOME_CASE}), 0) AS income,
      COALESCE(SUM(${EXPENSE_CASE}), 0) AS expense
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    WHERE t.date >= ? AND t.date < ?
    GROUP BY period
  `).all(start, endExclusive);
}

// GET /api/cashflow?granularity=daily|weekly|monthly|yearly
router.get('/', (req, res) => {
  try {
    const granularity = req.query.granularity || 'monthly';
    let periods;

    if (granularity === 'daily') {
      const dates = lastNDates(30);
      const dayMap = rangeTotalsByDate(dates[0], dates[dates.length - 1]);
      periods = dates.map(date => {
        const r = dayMap.get(date) || { income: 0, expense: 0 };
        return { period: date, income: r.income, expense: r.expense };
      });
    } else if (granularity === 'weekly') {
      const weeks = lastNWeeks(12);
      const dayMap = rangeTotalsByDate(weeks[0].start, weeks[weeks.length - 1].end);
      periods = weeks.map(w => {
        let income = 0, expense = 0;
        for (let d = new Date(w.start), end = new Date(w.end); d <= end; d.setDate(d.getDate() + 1)) {
          const r = dayMap.get(localYMD(d));
          if (r) { income += r.income; expense += r.expense; }
        }
        return { period: w.label, income, expense };
      });
    } else if (granularity === 'yearly') {
      const years = lastNYears(5);
      const rows = yearlyRangeRows(years);
      const yearMap = new Map(rows.map(r => [r.period, r]));
      periods = years.map(year => {
        const r = yearMap.get(year) || { income: 0, expense: 0 };
        return { period: year, income: r.income, expense: r.expense };
      });
    } else {
      const months = lastNMonths(12);
      const rows = monthlyRangeRows(months);
      const monthMap = new Map(rows.map(r => [r.period, r]));
      periods = months.map(month => {
        const r = monthMap.get(month) || { income: 0, expense: 0 };
        return { period: month, income: r.income, expense: r.expense };
      });
    }

    let running = 0;
    const data = periods.map(p => {
      running += p.income - p.expense;
      return { ...p, balance: running };
    });

    const comparison = data.length >= 2
      ? { current: data[data.length - 1], previous: data[data.length - 2] }
      : null;

    res.json({ granularity, data, comparison });
  } catch (e) {
    serverError(res, e, 'cashflow');
  }
});

module.exports = router;
