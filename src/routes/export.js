'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(rows, columns) {
  const header = columns.join(',');
  const lines = rows.map(r => columns.map(c => csvEscape(r[c])).join(','));
  return [header, ...lines].join('\n');
}

// GET /api/export?format=csv|json&from=&to= — 거래(CSV) 또는 전체 스키마 백업(JSON)
router.get('/', (req, res) => {
  try {
    const { format = 'json', from, to } = req.query;

    let txSql = `
      SELECT t.id, t.date, c.major_type, c.name AS category, t.amount, p.name AS payment_method,
             t.payment_style, t.merchant, t.memo
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN payment_methods p ON t.payment_method_id = p.id
      WHERE 1=1
    `;
    const params = [];
    if (from) { txSql += ' AND t.date >= ?'; params.push(from); }
    if (to) { txSql += ' AND t.date <= ?'; params.push(to); }
    txSql += ' ORDER BY t.date DESC, t.id DESC';
    const transactions = db.prepare(txSql).all(...params);

    if (format === 'csv') {
      const csv = toCsv(transactions, ['id', 'date', 'major_type', 'category', 'amount', 'payment_method', 'payment_style', 'merchant', 'memo']);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="transactions_${from || 'all'}_${to || 'all'}.csv"`);
      res.send('﻿' + csv);
      return;
    }

    const data = {
      exported_at: new Date().toISOString(),
      transactions,
      categories: db.prepare('SELECT * FROM categories').all(),
      payment_methods: db.prepare('SELECT * FROM payment_methods').all(),
      installments: db.prepare('SELECT * FROM installments').all(),
      revolving_history: db.prepare('SELECT * FROM revolving_history').all(),
      debts: db.prepare('SELECT * FROM debts').all(),
      debt_interest_log: db.prepare('SELECT * FROM debt_interest_log').all(),
      savings_products: db.prepare('SELECT * FROM savings_products').all(),
    };
    res.setHeader('Content-Disposition', 'attachment; filename="finance-tracker-export.json"');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
