'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');

// GET /api/revolving?payment_method_id=&from=&to=
router.get('/', (req, res) => {
  try {
    const { payment_method_id, from, to } = req.query;
    let sql = `
      SELECT r.*, p.name AS payment_method_name
      FROM revolving_history r
      LEFT JOIN payment_methods p ON r.payment_method_id = p.id
      WHERE 1=1
    `;
    const params = [];
    if (payment_method_id) { sql += ' AND r.payment_method_id = ?'; params.push(payment_method_id); }
    if (from) { sql += ' AND r.month >= ?'; params.push(from); }
    if (to) { sql += ' AND r.month <= ?'; params.push(to); }
    sql += ' ORDER BY r.month DESC';
    const data = db.prepare(sql).all(...params);

    const current_carried_balance = data.length ? data[0].next_carried_balance : 0;

    res.json({ data, current_carried_balance });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/revolving
router.post('/', (req, res) => {
  try {
    const { month, payment_method_id, carried_balance = 0, new_charge = 0, paid_amount, interest = 0 } = req.body;
    if (!month || !payment_method_id || paid_amount === undefined) {
      return res.status(400).json({ error: 'month, payment_method_id, paid_amount required' });
    }
    const next_carried_balance = carried_balance + new_charge - paid_amount + interest;
    const result = db.prepare(`
      INSERT INTO revolving_history (month, payment_method_id, carried_balance, new_charge, paid_amount, interest, next_carried_balance)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(month, payment_method_id, carried_balance, new_charge, paid_amount, interest, next_carried_balance);
    res.status(201).json({ id: result.lastInsertRowid, ok: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: '해당 월/카드 조합이 이미 등록되어 있습니다.' });
    }
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/revolving/:id
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM revolving_history WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const merged = { ...existing, ...req.body };
    const next_carried_balance = merged.carried_balance + merged.new_charge - merged.paid_amount + merged.interest;
    db.prepare(`
      UPDATE revolving_history SET month=?, payment_method_id=?, carried_balance=?, new_charge=?, paid_amount=?, interest=?, next_carried_balance=?
      WHERE id=?
    `).run(
      merged.month, merged.payment_method_id, merged.carried_balance, merged.new_charge,
      merged.paid_amount, merged.interest, next_carried_balance, req.params.id
    );
    res.json({ ok: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: '해당 월/카드 조합이 이미 등록되어 있습니다.' });
    }
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/revolving/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM revolving_history WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
