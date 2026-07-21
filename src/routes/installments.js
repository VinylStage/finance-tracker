'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');

const MONTHS_ELAPSED = `
  (CAST(strftime('%Y','now') AS INT) - CAST(strftime('%Y', i.start_billing_month || '-01') AS INT)) * 12
  + CAST(strftime('%m','now') AS INT) - CAST(strftime('%m', i.start_billing_month || '-01') AS INT)
  + 1
`;

// GET /api/installments?status=진행중
router.get('/', (req, res) => {
  try {
    const { status } = req.query;
    let sql = `
      SELECT i.*,
        p.name AS payment_method_name,
        MAX(0, i.months - (${MONTHS_ELAPSED})) AS remaining_months,
        MIN(i.months, MAX(0, ${MONTHS_ELAPSED})) AS billed_months
      FROM installments i
      LEFT JOIN payment_methods p ON i.payment_method_id = p.id
      WHERE 1=1
    `;
    const params = [];
    if (status) { sql += ' AND i.status = ?'; params.push(status); }
    sql += ' ORDER BY i.status ASC, i.start_billing_month DESC';
    const data = db.prepare(sql).all(...params);

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const this_month_total = db.prepare(`
      SELECT COALESCE(SUM(monthly_amount), 0) AS total
      FROM installments
      WHERE status = '진행중' AND start_billing_month <= ?
    `).get(thisMonth).total;

    res.json({ data, this_month_total });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/installments
router.post('/', (req, res) => {
  try {
    const {
      purchase_date, merchant, total_amount, months, monthly_amount,
      fee_per_month = 0, payment_method_id, start_billing_month,
    } = req.body;
    if (!purchase_date || !merchant || !total_amount || !months || !monthly_amount || !start_billing_month) {
      return res.status(400).json({ error: 'purchase_date, merchant, total_amount, months, monthly_amount, start_billing_month required' });
    }
    if (months < 2) {
      return res.status(400).json({ error: 'months must be >= 2 (2개월 미만은 일시불로 처리)' });
    }
    const result = db.prepare(`
      INSERT INTO installments (purchase_date, merchant, total_amount, months, monthly_amount, fee_per_month, payment_method_id, start_billing_month, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, '진행중')
    `).run(purchase_date, merchant, total_amount, months, monthly_amount, fee_per_month, payment_method_id || null, start_billing_month);
    res.status(201).json({ id: result.lastInsertRowid, ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/installments/:id
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM installments WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const merged = { ...existing, ...req.body };
    db.prepare(`
      UPDATE installments SET purchase_date=?, merchant=?, total_amount=?, months=?, monthly_amount=?,
        fee_per_month=?, payment_method_id=?, start_billing_month=?, status=?
      WHERE id=?
    `).run(
      merged.purchase_date, merged.merchant, merged.total_amount, merged.months, merged.monthly_amount,
      merged.fee_per_month, merged.payment_method_id || null, merged.start_billing_month, merged.status,
      req.params.id
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/installments/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM installments WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
