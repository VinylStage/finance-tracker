'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');

// GET /api/debts
router.get('/', (req, res) => {
  try {
    const data = db.prepare(`
      SELECT *, ROUND(balance * annual_rate / 100.0 / 12) AS monthly_interest
      FROM debts
      ORDER BY balance DESC
    `).all();
    const total_balance = data.reduce((s, d) => s + d.balance, 0);
    const total_monthly_interest = data.reduce((s, d) => s + d.monthly_interest, 0);
    res.json({ data, total_balance, total_monthly_interest });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/debts
router.post('/', (req, res) => {
  try {
    const { name, balance, annual_rate = 0, type = '일반', memo } = req.body;
    if (!name || balance === undefined) {
      return res.status(400).json({ error: 'name, balance required' });
    }
    const result = db.prepare(`
      INSERT INTO debts (name, balance, annual_rate, type, memo)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, balance, annual_rate, type, memo || null);
    res.status(201).json({ id: result.lastInsertRowid, ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/debts/:id
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM debts WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const merged = { ...existing, ...req.body };
    db.prepare(`
      UPDATE debts SET name=?, balance=?, annual_rate=?, type=?, memo=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(merged.name, merged.balance, merged.annual_rate, merged.type || '일반', merged.memo || null, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/debts/:id
router.delete('/:id', (req, res) => {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM debt_interest_log WHERE debt_id=?').run(req.params.id);
    db.prepare('DELETE FROM debts WHERE id=?').run(req.params.id);
  });
  tx();
  res.json({ ok: true });
});

// POST /api/debts/:id/interest — 이자 추가 (잔액 자동 반영)
router.post('/:id/interest', (req, res) => {
  try {
    const debt = db.prepare('SELECT * FROM debts WHERE id=?').get(req.params.id);
    if (!debt) return res.status(404).json({ error: 'Not found' });

    const { rate, interest_amount, log_date, memo } = req.body;
    if (rate === undefined || interest_amount === undefined || !log_date) {
      return res.status(400).json({ error: 'rate, interest_amount, log_date required' });
    }

    const balance_before = debt.balance;
    const balance_after = balance_before + interest_amount;

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO debt_interest_log (debt_id, log_date, rate_at_time, interest_amount, balance_before, balance_after, memo)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(req.params.id, log_date, rate, interest_amount, balance_before, balance_after, memo || null);

      db.prepare(`
        UPDATE debts SET balance=?, annual_rate=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
      `).run(balance_after, rate, req.params.id);
    });
    tx();

    res.status(201).json({ ok: true, balance_after });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/debts/:id/interest-log — 이자 이력 조회
router.get('/:id/interest-log', (req, res) => {
  try {
    const data = db.prepare(`
      SELECT * FROM debt_interest_log WHERE debt_id = ? ORDER BY log_date DESC, id DESC
    `).all(req.params.id);
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
