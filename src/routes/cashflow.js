'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');

function pad2(n) { return String(n).padStart(2, '0'); }

function lastNDates(n) {
  const arr = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    arr.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`);
  }
  return arr;
}

function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function lastNWeeks(n) {
  const weeks = [];
  const thisMonday = mondayOf(new Date());
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(thisMonday);
    start.setDate(thisMonday.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const fmtDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    weeks.push({ label: fmtDate(start), start: fmtDate(start), end: fmtDate(end) });
  }
  return weeks;
}

function lastNMonths(n) {
  const arr = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    arr.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
  }
  return arr;
}

function lastNYears(n) {
  const arr = [];
  const year = new Date().getFullYear();
  for (let i = n - 1; i >= 0; i--) arr.push(String(year - i));
  return arr;
}

const FLOW_SELECT = `
  SELECT
    COALESCE(SUM(CASE WHEN c.major_type = '수입' THEN t.amount ELSE 0 END), 0) AS income,
    COALESCE(SUM(CASE WHEN c.major_type != '수입' AND t.payment_style NOT IN ('할부','리볼빙') THEN t.amount ELSE 0 END), 0) AS expense
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
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
