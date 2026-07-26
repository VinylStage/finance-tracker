'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { localYearMonth } = require('../utils/date');
const { installmentsDueForMonth } = require('../utils/aggregation');

// FND-20(감사): 여기서 쓰던 strftime(...,'now')는 UTC라서 KST 자정~9시 사이엔
// remaining_months/billed_months가 1개월 어긋났다. SQL이 직접 'now'를
// 참조하지 않도록, 현재 연/월을 JS(localYearMonth)에서 계산해 바인딩한다.
const MONTHS_ELAPSED = `
  (? - CAST(strftime('%Y', i.start_billing_month || '-01') AS INT)) * 12
  + ? - CAST(strftime('%m', i.start_billing_month || '-01') AS INT)
  + 1
`;

// GET /api/installments?status=진행중
router.get('/', (req, res) => {
  try {
    const { status } = req.query;
    const [curYear, curMonth] = localYearMonth();
    let sql = `
      SELECT i.*,
        p.name AS payment_method_name,
        MAX(0, i.months - (${MONTHS_ELAPSED})) AS remaining_months,
        MIN(i.months, MAX(0, ${MONTHS_ELAPSED})) AS billed_months
      FROM installments i
      LEFT JOIN payment_methods p ON i.payment_method_id = p.id
      WHERE 1=1
    `;
    const params = [curYear, curMonth, curYear, curMonth];
    if (status) { sql += ' AND i.status = ?'; params.push(status); }
    sql += ' ORDER BY i.status ASC, i.start_billing_month DESC';
    const data = db.prepare(sql).all(...params);

    const thisMonth = `${curYear}-${String(curMonth).padStart(2, '0')}`;
    // FND-05(감사): 여기서 청구 기간 종료를 반영하지 않던 별도 쿼리를 쓰고 있었다.
    // 대시보드(/api/transactions/summary/dashboard)의 installmentsDue와 항상
    // 같은 값을 내도록 동일 함수를 공유한다.
    const this_month_total = installmentsDueForMonth(thisMonth);

    res.json({ data, this_month_total });
  } catch (e) {
    serverError(res, e, 'installments');
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
    serverError(res, e, 'installments');
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
    serverError(res, e, 'installments');
  }
});

// DELETE /api/installments/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM installments WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
