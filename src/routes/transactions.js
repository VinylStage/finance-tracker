'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');

// GET /api/transactions?limit=50&offset=0&from=&to=&category_id=
router.get('/', (req, res) => {
  try {
    const { limit = 100, offset = 0, from, to, category_id } = req.query;
    let sql = `
      SELECT t.*, c.name AS category_name, c.major_type,
             p.name AS payment_method_name
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN payment_methods p ON t.payment_method_id = p.id
      WHERE 1=1
    `;
    const params = [];
    if (from) { sql += ' AND t.date >= ?'; params.push(from); }
    if (to)   { sql += ' AND t.date <= ?'; params.push(to); }
    if (category_id) { sql += ' AND t.category_id = ?'; params.push(category_id); }
    sql += ' ORDER BY t.date DESC, t.id DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    const rows = db.prepare(sql).all(...params);
    const total = db.prepare(`SELECT COUNT(*) as cnt FROM transactions`).get().cnt;
    res.json({ data: rows, total });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/transactions/:id
router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT t.*, c.name AS category_name, c.major_type, p.name AS payment_method_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN payment_methods p ON t.payment_method_id = p.id
    WHERE t.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// POST /api/transactions
router.post('/', (req, res) => {
  try {
    const { date, category_id, amount, payment_method_id, payment_style = '일시불', merchant, memo } = req.body;
    if (!date || !category_id || amount === undefined) {
      return res.status(400).json({ error: 'date, category_id, amount required' });
    }
    const result = db.prepare(`
      INSERT INTO transactions (date, category_id, amount, payment_method_id, payment_style, merchant, memo)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(date, category_id, amount, payment_method_id || null, payment_style, merchant || null, memo || null);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/transactions/:id
router.put('/:id', (req, res) => {
  try {
    const { date, category_id, amount, payment_method_id, payment_style, merchant, memo } = req.body;
    db.prepare(`
      UPDATE transactions SET date=?, category_id=?, amount=?, payment_method_id=?,
        payment_style=?, merchant=?, memo=?
      WHERE id=?
    `).run(date, category_id, amount, payment_method_id || null, payment_style || '일시불',
           merchant || null, memo || null, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/transactions/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM transactions WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// GET /api/transactions/summary/dashboard — 대시보드 집계
router.get('/summary/dashboard', (req, res) => {
  try {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    
    const income = db.prepare(`
      SELECT COALESCE(SUM(t.amount),0) AS total
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE strftime('%Y-%m', t.date) = ? AND c.major_type = '수입'
    `).get(thisMonth).total;

    const expense = db.prepare(`
      SELECT COALESCE(SUM(t.amount),0) AS total
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE strftime('%Y-%m', t.date) = ? AND c.major_type != '수입'
      AND t.payment_style NOT IN ('할부','리볼빙')
    `).get(thisMonth).total;

    const installmentsDue = db.prepare(`
      SELECT COALESCE(SUM(monthly_amount),0) AS total
      FROM installments
      WHERE start_billing_month <= ? AND status = '진행중'
    `).get(thisMonth).total;

    const revolvingPaid = db.prepare(`
      SELECT COALESCE(SUM(paid_amount), 0) AS total
      FROM revolving_history
      WHERE month = ?
    `).get(thisMonth).total;

    const budgets = db.prepare(`
      SELECT c.name, c.major_type, c.monthly_budget,
        COALESCE(SUM(t.amount),0) AS spent
      FROM categories c
      LEFT JOIN transactions t ON t.category_id = c.id AND strftime('%Y-%m', t.date) = ?
      WHERE c.is_active = 1 AND c.monthly_budget > 0
      GROUP BY c.id
    `).all(thisMonth);

    res.json({
      thisMonth, income, expense,
      available: income - expense - installmentsDue - revolvingPaid,
      installmentsDue, revolvingPaid, budgets,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/transactions/suggest/category?merchant=
router.get('/suggest/category', (req, res) => {
  const { merchant } = req.query;
  if (!merchant) return res.json({ category_id: null });
  const exact = db.prepare(`
    SELECT category_id FROM transactions WHERE merchant = ? ORDER BY date DESC LIMIT 1
  `).get(merchant);
  if (exact) return res.json({ category_id: exact.category_id });
  const partial = db.prepare(`
    SELECT category_id, COUNT(*) as cnt FROM transactions
    WHERE merchant LIKE ? GROUP BY category_id ORDER BY cnt DESC LIMIT 1
  `).get(`%${merchant}%`);
  res.json({ category_id: partial ? partial.category_id : null });
});

module.exports = router;
