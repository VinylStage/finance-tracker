'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { lastNDates, lastNWeeks, lastNMonths, lastNYears } = require('../utils/date');
const { INCOME_CASE, EXPENSE_CASE } = require('../utils/aggregation');

const FLOW_SELECT = `
  SELECT
    COALESCE(SUM(${INCOME_CASE}), 0) AS income,
    COALESCE(SUM(${EXPENSE_CASE}), 0) AS expense
  FROM transactions t
  JOIN categories c ON t.category_id = c.id
`;

// GET /api/cashflow?granularity=daily|weekly|monthly|yearly
router.get('/', (req, res) => {
  try {
    const granularity = req.query.granularity || 'monthly';
    let periods;

    if (granularity === 'daily') {
      const stmt = db.prepare(`${FLOW_SELECT} WHERE t.date = ?`);
      periods = lastNDates(30).map(date => ({ period: date, ...stmt.get(date) }));
    } else if (granularity === 'weekly') {
      const stmt = db.prepare(`${FLOW_SELECT} WHERE t.date >= ? AND t.date <= ?`);
      periods = lastNWeeks(12).map(w => ({ period: w.label, ...stmt.get(w.start, w.end) }));
    } else if (granularity === 'yearly') {
      const stmt = db.prepare(`${FLOW_SELECT} WHERE strftime('%Y', t.date) = ?`);
      periods = lastNYears(5).map(year => ({ period: year, ...stmt.get(year) }));
    } else {
      const stmt = db.prepare(`${FLOW_SELECT} WHERE strftime('%Y-%m', t.date) = ?`);
      periods = lastNMonths(12).map(month => ({ period: month, ...stmt.get(month) }));
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
