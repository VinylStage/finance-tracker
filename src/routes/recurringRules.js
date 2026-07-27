'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { asInt, missingFields } = require('../utils/validate');
const { serverError, errMsg } = require('../utils/errors');
const { PAYMENT_STYLES } = require('../constants');

function pad2(n) { return String(n).padStart(2, '0'); }
function thisYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

// day_of_month가 해당 월의 실제 일수를 넘으면(예: 31일 규칙 + 2월) 그 달의 마지막 날로 맞춘다.
function resolveDate(yearMonth, dayOfMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const day = Math.min(dayOfMonth, lastDay);
  return `${yearMonth}-${pad2(day)}`;
}

function validateRuleBody(body) {
  const missing = missingFields(body, ['category_id', 'merchant', 'amount', 'day_of_month']);
  if (missing.length) return `${missing.join(', ')} required`;
  if (asInt(body.category_id) === null) return 'category_id must be an integer';
  if (asInt(body.amount) === null) return 'amount must be an integer';
  const day = asInt(body.day_of_month);
  if (day === null || day < 1 || day > 31) return 'day_of_month must be an integer between 1 and 31';
  if (body.payment_method_id !== undefined && body.payment_method_id !== null &&
      asInt(body.payment_method_id) === null) return 'payment_method_id must be an integer';
  if (body.payment_style !== undefined && body.payment_style !== null &&
      !PAYMENT_STYLES.includes(body.payment_style)) {
    return `payment_style must be one of ${PAYMENT_STYLES.join(', ')}`;
  }
  return null;
}

// GET /api/recurring-rules?include_inactive=1
router.get('/', (req, res) => {
  try {
    const includeInactive = req.query.include_inactive;
    let query = `
      SELECT r.*, c.name AS category_name, c.major_type, p.name AS payment_method_name
      FROM recurring_rules r
      LEFT JOIN categories c ON r.category_id = c.id
      LEFT JOIN payment_methods p ON r.payment_method_id = p.id
    `;
    if (!includeInactive) query += ' WHERE r.is_active = 1';
    query += ' ORDER BY r.day_of_month, r.merchant';
    res.json(db.prepare(query).all());
  } catch (e) {
    serverError(res, e, 'recurringRules');
  }
});

// GET /api/recurring-rules/due?month=YYYY-MM — 이번 달(기본값) 확인 대상 목록
router.get('/due', (req, res) => {
  try {
    const yearMonth = req.query.month || thisYearMonth();
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) return res.status(400).json({ error: '월 형식이 올바르지 않습니다. 2026-07 처럼 입력해 주세요.' });
    const rows = db.prepare(`
      SELECT r.*, c.name AS category_name, p.name AS payment_method_name
      FROM recurring_rules r
      LEFT JOIN categories c ON r.category_id = c.id
      LEFT JOIN payment_methods p ON r.payment_method_id = p.id
      WHERE r.is_active = 1
        AND NOT EXISTS (
          SELECT 1 FROM recurring_rule_months m WHERE m.rule_id = r.id AND m.year_month = ?
        )
      ORDER BY r.day_of_month, r.merchant
    `).all(yearMonth);
    res.json({ month: yearMonth, data: rows });
  } catch (e) {
    serverError(res, e, 'recurringRules');
  }
});

// POST /api/recurring-rules
router.post('/', (req, res) => {
  try {
    const err = validateRuleBody(req.body);
    if (err) return res.status(400).json({ error: err });
    const { category_id, merchant, amount, day_of_month, payment_method_id, payment_style = '일시불', memo } = req.body;
    const result = db.prepare(`
      INSERT INTO recurring_rules (category_id, merchant, amount, day_of_month, payment_method_id, payment_style, memo)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(asInt(category_id), merchant, asInt(amount), asInt(day_of_month),
           payment_method_id != null ? asInt(payment_method_id) : null, payment_style, memo || null);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    serverError(res, e, 'recurringRules');
  }
});

// PUT /api/recurring-rules/:id
router.put('/:id', (req, res) => {
  try {
    const err = validateRuleBody(req.body);
    if (err) return res.status(400).json({ error: err });
    const { category_id, merchant, amount, day_of_month, payment_method_id, payment_style, memo, is_active } = req.body;
    const result = db.prepare(`
      UPDATE recurring_rules SET category_id=?, merchant=?, amount=?, day_of_month=?,
        payment_method_id=?, payment_style=?, memo=?, is_active=?
      WHERE id=?
    `).run(asInt(category_id), merchant, asInt(amount), asInt(day_of_month),
           payment_method_id != null ? asInt(payment_method_id) : null, payment_style,
           memo || null, is_active ?? 1, req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: '찾는 반복 거래 규칙이 없습니다. 이미 삭제됐을 수 있어요.' });
    res.json({ ok: true });
  } catch (e) {
    serverError(res, e, 'recurringRules');
  }
});

// DELETE /api/recurring-rules/:id — 다른 관리 화면(카테고리/결제수단)과 동일하게 소프트 삭제
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('UPDATE recurring_rules SET is_active=0 WHERE id=?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: '찾는 반복 거래 규칙이 없습니다. 이미 삭제됐을 수 있어요.' });
    res.json({ ok: true });
  } catch (e) {
    serverError(res, e, 'recurringRules');
  }
});

// POST /api/recurring-rules/:id/confirm — body: { month? } — 실제 거래 생성 + 이번 달 처리 완료 기록
router.post('/:id/confirm', (req, res) => {
  try {
    const yearMonth = req.body.month || thisYearMonth();
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) return res.status(400).json({ error: '월 형식이 올바르지 않습니다. 2026-07 처럼 입력해 주세요.' });
    const rule = db.prepare('SELECT * FROM recurring_rules WHERE id=? AND is_active=1').get(req.params.id);
    if (!rule) return res.status(404).json({ error: '찾는 반복 거래 규칙이 없습니다. 이미 삭제됐을 수 있어요.' });

    const date = resolveDate(yearMonth, rule.day_of_month);
    const result = db.transaction(() => {
      const tx = db.prepare(`
        INSERT INTO transactions (date, category_id, amount, payment_method_id, payment_style, merchant, memo)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(date, rule.category_id, rule.amount, rule.payment_method_id, rule.payment_style, rule.merchant, rule.memo);
      db.prepare(`
        INSERT INTO recurring_rule_months (rule_id, year_month, status, transaction_id) VALUES (?, ?, 'created', ?)
      `).run(rule.id, yearMonth, tx.lastInsertRowid);
      return tx.lastInsertRowid;
    })();

    res.status(201).json({ ok: true, transaction_id: result });
  } catch (e) {
    if (errMsg(e).includes('UNIQUE')) {
      return res.status(409).json({ error: '이미 이번 달 처리(생성 또는 건너뛰기)된 규칙입니다.' });
    }
    serverError(res, e, 'recurringRules');
  }
});

// POST /api/recurring-rules/:id/skip — body: { month? } — 거래 생성 없이 이번 달 처리 완료로 기록
router.post('/:id/skip', (req, res) => {
  try {
    const yearMonth = req.body.month || thisYearMonth();
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) return res.status(400).json({ error: '월 형식이 올바르지 않습니다. 2026-07 처럼 입력해 주세요.' });
    const rule = db.prepare('SELECT id FROM recurring_rules WHERE id=? AND is_active=1').get(req.params.id);
    if (!rule) return res.status(404).json({ error: '찾는 반복 거래 규칙이 없습니다. 이미 삭제됐을 수 있어요.' });

    db.prepare(`
      INSERT INTO recurring_rule_months (rule_id, year_month, status) VALUES (?, ?, 'skipped')
    `).run(rule.id, yearMonth);
    res.json({ ok: true });
  } catch (e) {
    if (errMsg(e).includes('UNIQUE')) {
      return res.status(409).json({ error: '이미 이번 달 처리(생성 또는 건너뛰기)된 규칙입니다.' });
    }
    serverError(res, e, 'recurringRules');
  }
});

module.exports = router;
