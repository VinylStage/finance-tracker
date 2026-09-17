'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { localYMD } = require('../utils/date');
const { numericBody } = require('../utils/validate');

function monthsBetween(startDate, endDate) {
  const s = new Date(startDate);
  const e = new Date(endDate);
  return Math.max(1, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1);
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function isUsableDate(value) {
  return YMD.test(String(value || '')) && !Number.isNaN(new Date(value).getTime());
}

// 월 납입액과 기간의 범위. 안 보낸 값은 검사하지 않는다 — 수정은 일부 필드만 온다.
//
// 기간은 시작일과 만기일 **둘을 같이** 봐야 판단이 선다. 그래서 수정에서는
// 보낸 값이 하나뿐이어도 합쳐진 짝(pairStart·pairMaturity)으로 비교한다.
function validateSavingsNumbers(v) {
  if (v.monthly_contribution !== undefined && v.monthly_contribution !== null && v.monthly_contribution !== '') {
    const amount = Number(v.monthly_contribution);
    if (!Number.isFinite(amount) || amount <= 0) {
      return '월 납입액은 0보다 큰 금액으로 입력해 주세요.';
    }
  }
  if (v.start_date !== undefined && v.start_date !== null && v.start_date !== '' && !isUsableDate(v.start_date)) {
    return '시작일은 YYYY-MM-DD 형식의 실제 날짜여야 합니다.';
  }
  if (v.maturity_date !== undefined && v.maturity_date !== null && v.maturity_date !== '' && !isUsableDate(v.maturity_date)) {
    return '만기일은 YYYY-MM-DD 형식의 실제 날짜여야 합니다.';
  }

  const touchesPeriod = (v.start_date !== undefined && v.start_date !== null && v.start_date !== '')
    || (v.maturity_date !== undefined && v.maturity_date !== null && v.maturity_date !== '');
  if (!touchesPeriod) return null;

  const from = v.pairStart !== undefined ? v.pairStart : v.start_date;
  const to = v.pairMaturity !== undefined ? v.pairMaturity : v.maturity_date;
  if (from && to && isUsableDate(from) && isUsableDate(to) && String(to) < String(from)) {
    return '만기일은 시작일보다 뒤여야 합니다.';
  }
  return null;
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
    serverError(res, e, 'savings');
  }
});

// POST /api/savings
router.post('/', numericBody(['monthly_contribution', 'expected_payout', 'category_id']), (req, res) => {
  try {
    const { name, monthly_contribution, start_date, maturity_date, expected_payout, category_id } = req.body;
    if (!name || !monthly_contribution || !start_date) {
      return res.status(400).json({ error: '상품명, 월 납입액, 시작일은 필수입니다.' });
    }
    const invalid = validateSavingsNumbers({ monthly_contribution, start_date, maturity_date });
    if (invalid) return res.status(400).json({ error: invalid });
    const result = db.prepare(`
      INSERT INTO savings_products (name, monthly_contribution, start_date, maturity_date, expected_payout, category_id, status)
      VALUES (?, ?, ?, ?, ?, ?, '진행중')
    `).run(name, monthly_contribution, start_date, maturity_date || null, expected_payout || null, category_id || null);
    res.status(201).json({ id: result.lastInsertRowid, ok: true });
  } catch (e) {
    serverError(res, e, 'savings');
  }
});

// PUT /api/savings/:id
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM savings_products WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: '찾는 저축 상품이 없습니다. 이미 삭제됐을 수 있어요.' });
    const merged = { ...existing, ...req.body };
    const invalid = validateSavingsNumbers({
      monthly_contribution: req.body.monthly_contribution,
      start_date: req.body.start_date,
      maturity_date: req.body.maturity_date,
      pairStart: merged.start_date,
      pairMaturity: merged.maturity_date,
    });
    if (invalid) return res.status(400).json({ error: invalid });
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
    serverError(res, e, 'savings');
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
    if (!product) return res.status(404).json({ error: '찾는 저축 상품이 없습니다. 이미 삭제됐을 수 있어요.' });
    if (product.status === '완료') return res.status(400).json({ error: '이미 만기 처리된 상품입니다.' });

    const settleDate = req.body.settle_date || product.maturity_date || localYMD();

    if (!isUsableDate(settleDate)) {
      return res.status(400).json({ error: '만기 정산일은 YYYY-MM-DD 형식의 실제 날짜여야 합니다.' });
    }
    if (!isUsableDate(product.start_date)) {
      return res.status(400).json({ error: '이 상품의 시작일이 올바르지 않습니다. 상품 정보를 먼저 고쳐 주세요.' });
    }

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
    serverError(res, e, 'savings');
  }
});

module.exports = router;
