'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { numericBody, missingFields } = require('../utils/validate');
const { validatePolicy, findOverlapping, policyAt } = require('../services/cardPolicy');

// 숫자 필드 선언(#211). 라우트 정의에 붙여 두면 어느 필드에 검증을 빠뜨렸는지
// 소스에서 기계적으로 셀 수 있다.
const NUMERIC = ['payment_method_id', 'months', 'free_months'];

// GET /api/card-policies?payment_method_id=&months=&on=YYYY-MM-DD
router.get('/', (req, res) => {
  try {
    const { payment_method_id, months, on } = req.query;
    let sql = `
      SELECT p.*, m.name AS payment_method_name
      FROM card_installment_policies p
      LEFT JOIN payment_methods m ON p.payment_method_id = m.id
      WHERE 1=1
    `;
    const params = [];
    if (payment_method_id) { sql += ' AND p.payment_method_id = ?'; params.push(payment_method_id); }
    if (months) { sql += ' AND p.months = ?'; params.push(months); }
    sql += ' ORDER BY p.payment_method_id, p.months, p.effective_from DESC';
    let rows = db.prepare(sql).all(...params);
    // on 이 주어지면 그 시점에 유효한 것만 남긴다.
    if (on) {
      rows = rows.filter((p) => on >= p.effective_from && (!p.effective_to || on <= p.effective_to));
    }
    res.json({ data: rows });
  } catch (e) {
    serverError(res, e, 'cardPolicies');
  }
});

// GET /api/card-policies/effective?payment_method_id=&months=&on=
// 특정 시점에 유효한 정책 1건. 이자 계산이 쓰는 조회다.
router.get('/effective', (req, res) => {
  try {
    const { payment_method_id, months, on } = req.query;
    const missing = missingFields(req.query, ['payment_method_id', 'months', 'on']);
    if (missing.length) {
      return res.status(400).json({ error: '결제수단, 개월수, 기준일을 모두 지정해 주세요.' });
    }
    const found = policyAt(db, Number(payment_method_id), Number(months), on);
    res.json({ data: found });
  } catch (e) {
    serverError(res, e, 'cardPolicies');
  }
});

// POST /api/card-policies
router.post('/', numericBody(NUMERIC), (req, res) => {
  try {
    const p = normalize(req.body);
    const missing = missingFields(req.body, ['payment_method_id', 'months', 'policy_type', 'effective_from']);
    if (missing.length) {
      return res.status(400).json({ error: '결제수단, 개월수, 정책 종류, 적용 시작일은 필수입니다.' });
    }
    const invalid = validatePolicy(p);
    if (invalid) return res.status(400).json({ error: invalid });

    const clash = findOverlapping(db, p);
    if (clash) {
      return res.status(409).json({
        error: '같은 결제수단·개월수에 적용 기간이 겹치는 정책이 이미 있습니다. 기간을 조정해 주세요.',
      });
    }

    const info = db.prepare(`
      INSERT INTO card_installment_policies
        (payment_method_id, months, policy_type, annual_rate, free_months, effective_from, effective_to, memo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(p.payment_method_id, p.months, p.policy_type, p.annual_rate,
           p.free_months, p.effective_from, p.effective_to, p.memo);
    res.status(201).json({ id: info.lastInsertRowid, ok: true });
  } catch (e) {
    serverError(res, e, 'cardPolicies');
  }
});

// PUT /api/card-policies/:id
router.put('/:id', numericBody(NUMERIC), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM card_installment_policies WHERE id=?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: '찾는 할부 정책이 없습니다. 이미 삭제됐을 수 있어요.' });
    }
    const p = normalize({ ...existing, ...req.body });
    const invalid = validatePolicy(p);
    if (invalid) return res.status(400).json({ error: invalid });

    const clash = findOverlapping(db, p, Number(req.params.id));
    if (clash) {
      return res.status(409).json({
        error: '같은 결제수단·개월수에 적용 기간이 겹치는 정책이 이미 있습니다. 기간을 조정해 주세요.',
      });
    }

    db.prepare(`
      UPDATE card_installment_policies
      SET payment_method_id=?, months=?, policy_type=?, annual_rate=?,
          free_months=?, effective_from=?, effective_to=?, memo=?
      WHERE id=?
    `).run(p.payment_method_id, p.months, p.policy_type, p.annual_rate,
           p.free_months, p.effective_from, p.effective_to, p.memo, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    serverError(res, e, 'cardPolicies');
  }
});

// DELETE /api/card-policies/:id
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM card_installment_policies WHERE id=?').run(req.params.id);
    if (!result.changes) {
      return res.status(404).json({ error: '찾는 할부 정책이 없습니다. 이미 삭제됐을 수 있어요.' });
    }
    res.json({ ok: true });
  } catch (e) {
    serverError(res, e, 'cardPolicies');
  }
});

// 입력값을 계산에 쓸 형태로 맞춘다. 문자열 숫자는 numericBody 가 이미 통과시켰으므로
// 여기서는 형만 맞춘다.
function normalize(body) {
  return {
    payment_method_id: Number(body.payment_method_id),
    months: Number(body.months),
    policy_type: body.policy_type,
    annual_rate: body.annual_rate === undefined || body.annual_rate === '' ? 0 : Number(body.annual_rate),
    free_months: body.free_months === undefined || body.free_months === '' ? 0 : Number(body.free_months),
    effective_from: body.effective_from,
    effective_to: body.effective_to || null,
    memo: body.memo || null,
  };
}

module.exports = router;
