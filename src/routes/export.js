'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');

const SCHEMA_VERSION = 1;

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

function getTransactionsForRange(from, to) {
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
  return db.prepare(txSql).all(...params);
}

function getFullBackup(from, to) {
  let rawTxSql = `SELECT t.* FROM transactions t WHERE 1=1`;
  const params = [];
  if (from) { rawTxSql += ' AND t.date >= ?'; params.push(from); }
  if (to) { rawTxSql += ' AND t.date <= ?'; params.push(to); }
  rawTxSql += ' ORDER BY t.date DESC, t.id DESC';

  return {
    schema_version: SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    range: { from: from || null, to: to || null },
    transactions: db.prepare(rawTxSql).all(...params),
    categories: db.prepare('SELECT * FROM categories').all(),
    payment_methods: db.prepare('SELECT * FROM payment_methods').all(),
    installments: db.prepare('SELECT * FROM installments').all(),
    revolving_history: db.prepare('SELECT * FROM revolving_history').all(),
    debts: db.prepare('SELECT * FROM debts').all(),
    debt_interest_log: db.prepare('SELECT * FROM debt_interest_log').all(),
    savings_products: db.prepare('SELECT * FROM savings_products').all(),
  };
}

function sendCsv(res, from, to) {
  const transactions = getTransactionsForRange(from, to);
  const csv = toCsv(transactions, ['id', 'date', 'major_type', 'category', 'amount', 'payment_method', 'payment_style', 'merchant', 'memo']);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="transactions_${from || 'all'}_${to || 'all'}.csv"`);
  res.send('﻿' + csv);
}

function sendJson(res, from, to) {
  const data = getFullBackup(from, to);
  res.setHeader('Content-Disposition', `attachment; filename="finance-tracker-export_${from || 'all'}_${to || 'all'}.json"`);
  res.json(data);
}

// GET /api/export/csv?from=YYYY-MM-DD&to=YYYY-MM-DD — 거래내역 CSV (카테고리/결제수단 join)
router.get('/csv', (req, res) => {
  try {
    sendCsv(res, req.query.from, req.query.to);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/export/json?from=YYYY-MM-DD&to=YYYY-MM-DD — 전체 스키마 백업 (schema_version 포함, 재import 가능)
router.get('/json', (req, res) => {
  try {
    sendJson(res, req.query.from, req.query.to);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/export?format=csv|json&from=&to= — 구버전 호환용 (내부적으로 위 두 라우트에 위임)
router.get('/', (req, res) => {
  try {
    const { format = 'json', from, to } = req.query;
    if (format === 'csv') return sendCsv(res, from, to);
    return sendJson(res, from, to);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
