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
    const { name, balance, annual_rate = 0, memo } = req.body;
    if (!name || balance === undefined) {
      return res.status(400).json({ error: 'name, balance required' });
    }
    const result = db.prepare(`
      INSERT INTO debts (name, balance, annual_rate, memo)
      VALUES (?, ?, ?, ?)
    `).run(name, balance, annual_rate, memo || null);
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
      UPDATE debts SET name=?, balance=?, annual_rate=?, memo=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(merged.name, merged.balance, merged.annual_rate, merged.memo || null, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/debts/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM debts WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
