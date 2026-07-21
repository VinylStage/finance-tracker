'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');

function monthsBetween(startDate, endDate) {
  const s = new Date(startDate);
  const e = new Date(endDate);
  return Math.max(1, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1);
}

// GET /api/savings
router.get('/', (req, res) => {
  try {
    const data = db.prepare(`
      SELECT s.*, c.name AS category_name
      FROM savings_products s
      LEFT JOIN categories c ON s.category_id = c.id
      ORDER BY s.status ASC, s.start_date DESC
    `).all();
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/savings
router.post('/', (req, res) => {
  try {
    const { name, monthly_contribution, start_date, maturity_date, expected_payout, category_id } = req.body;
    if (!name || !monthly_contribution || !start_date) {
      return res.status(400).json({ error: 'name, monthly_contribution, start_date required' });
    }
    const result = db.prepare(`
      INSERT INTO savings_products (name, monthly_contribution, start_date, maturity_date, expected_payout, category_id, status)
      VALUES (?, ?, ?, ?, ?, ?, '진행중')
    `).run(name, monthly_contribution, start_date, maturity_date || null, expected_payout || null, category_id || null);
    res.status(201).json({ id: result.lastInsertRowid, ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/savings/:id
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM savings_products WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const merged = { ...existing, ...req.body };
    db.prepare(`
      UPDATE savings_products SET name=?, monthly_contribution=?, start_date=?, maturity_date=?,
        expected_payout=?, category_id=?, status=?
      WHERE id=?
    `).run(
      merged.name, merged.monthly_contribution, merged.start_date, merged.maturity_date || null,
      merged.expected_payout || null, merged.category_id || null, merged.status, req.params.id
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/savings/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM savings_products WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// POST /api/savings/:id/mature — 만기 처리: 원금 회수(저축 마이너스) + 이자 수입 분리 기록
router.post('/:id/mature', (req, res) => {
  try {
    const product = db.prepare('SELECT * FROM savings_products WHERE id=?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Not found' });
    if (product.status === '완료') return res.status(400).json({ error: '이미 만기 처리된 상품입니다.' });

    const settleDate = req.body.settle_date || product.maturity_date || new Date().toISOString().slice(0, 10);
    const months = monthsBetween(product.start_date, settleDate);
    const principal = product.monthly_contribution * months;
    const payout = product.expected_payout || principal;
    const interest = payout - principal;

    const incomeCategory = db.prepare(`SELECT id FROM categories WHERE major_type='수입' AND name='기타수입' LIMIT 1`).get();

    const tx = db.transaction(() => {
      if (product.category_id) {
        db.prepare(`
          INSERT INTO transactions (date, category_id, amount, payment_style, merchant, memo)
          VALUES (?, ?, ?, '해당없음', ?, '적금 만기 - 원금 회수')
        `).run(settleDate, product.category_id, -principal, product.name);
      }
      if (interest !== 0 && incomeCategory) {
        db.prepare(`
          INSERT INTO transactions (date, category_id, amount, payment_style, merchant, memo)
          VALUES (?, ?, ?, '해당없음', ?, '적금 만기 - 이자')
        `).run(settleDate, incomeCategory.id, interest, product.name);
      }
      db.prepare(`UPDATE savings_products SET status='완료' WHERE id=?`).run(req.params.id);
    });
    tx();

    res.json({ ok: true, principal, interest, payout });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
