'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError, errMsg } = require('../utils/errors');
const { asInt } = require('../utils/validate');
const { syncRevolvingDerived, deleteDerivedFor, derivedRowsFor } = require('../services/derivedTransactions');

// FND-06(감사): 숫자 필드를 검증 없이 산술에 그대로 썼다. JSON 문자열이
// 들어오면 `+`가 문자열 연결로 동작해(예: "100"+"200" → "100200") 그 결과가
// 그대로 잔액에 저장됐다. asInt()는 이미 transactions.js/recurringRules.js가
// 쓰던 유틸이라 여기서도 동일하게 적용한다.
// present=true(값이 있음)인 필드만 검사한다 — PUT은 부분 갱신이라 없는 필드는
// 기존 DB 값을 그대로 쓰므로 검증 대상이 아니다.
function validateRevolvingNumericFields(body) {
  for (const f of ['payment_method_id', 'carried_balance', 'new_charge', 'paid_amount', 'interest']) {
    if (body[f] !== undefined && asInt(body[f]) === null) return `${f} must be an integer`;
  }
  return null;
}

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
    serverError(res, e, 'revolving');
  }
});

// POST /api/revolving
router.post('/', (req, res) => {
  try {
    const { month, payment_method_id, paid_amount } = req.body;
    if (!month || !payment_method_id || paid_amount === undefined) {
      return res.status(400).json({ error: '해당 월, 결제수단, 결제 금액은 필수입니다.' });
    }
    const numErr = validateRevolvingNumericFields(req.body);
    if (numErr) return res.status(400).json({ error: numErr });

    const paymentMethodId = asInt(payment_method_id);
    const carried_balance = req.body.carried_balance !== undefined ? asInt(req.body.carried_balance) : 0;
    const new_charge = req.body.new_charge !== undefined ? asInt(req.body.new_charge) : 0;
    const paidAmount = asInt(paid_amount);
    const interest = req.body.interest !== undefined ? asInt(req.body.interest) : 0;
    const next_carried_balance = carried_balance + new_charge - paidAmount + interest;

    // 이력 등록과 수수료 거래 생성이 한 덩어리다(#269). 수수료만 남거나
    // 이력만 남는 중간 상태가 없어야 한다.
    let newId;
    let derived = { created: 0 };
    db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO revolving_history (month, payment_method_id, carried_balance, new_charge, paid_amount, interest, next_carried_balance)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(month, paymentMethodId, carried_balance, new_charge, paidAmount, interest, next_carried_balance);
      newId = Number(result.lastInsertRowid);
      derived = syncRevolvingDerived(db, newId);
    })();

    res.status(201).json({ id: newId, ok: true, derived });
  } catch (e) {
    if (errMsg(e).includes('UNIQUE')) {
      return res.status(409).json({ error: '해당 월/카드 조합이 이미 등록되어 있습니다.' });
    }
    serverError(res, e, 'revolving');
  }
});

// PUT /api/revolving/:id
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM revolving_history WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: '찾는 리볼빙 내역이 없습니다. 이미 삭제됐을 수 있어요.' });
    const numErr = validateRevolvingNumericFields(req.body);
    if (numErr) return res.status(400).json({ error: numErr });

    const merged = { ...existing, ...req.body };
    const payment_method_id = asInt(merged.payment_method_id);
    const carried_balance = asInt(merged.carried_balance);
    const new_charge = asInt(merged.new_charge);
    const paid_amount = asInt(merged.paid_amount);
    const interest = asInt(merged.interest);
    const next_carried_balance = carried_balance + new_charge - paid_amount + interest;
    // 수수료가 바뀌면 파생 거래도 따라가야 한다. 영향 범위가 한 달치 한 건이라
    // 프리뷰를 요구하지 않는다(ADR 0008 이 제외한 한 건짜리 CRUD).
    let derived = { created: 0, deleted: 0 };
    db.transaction(() => {
      db.prepare(`
        UPDATE revolving_history SET month=?, payment_method_id=?, carried_balance=?, new_charge=?, paid_amount=?, interest=?, next_carried_balance=?
        WHERE id=?
      `).run(
        merged.month, payment_method_id, carried_balance, new_charge,
        paid_amount, interest, next_carried_balance, req.params.id
      );
      derived = syncRevolvingDerived(db, Number(req.params.id));
    })();

    res.json({ ok: true, derived });
  } catch (e) {
    if (errMsg(e).includes('UNIQUE')) {
      return res.status(409).json({ error: '해당 월/카드 조합이 이미 등록되어 있습니다.' });
    }
    serverError(res, e, 'revolving');
  }
});

// GET /api/revolving/:id/derived — 이 이력이 만든 거래(#270).
router.get('/:id/derived', (req, res) => {
  try {
    res.json({ data: derivedRowsFor(db, 'revolving_history', Number(req.params.id)) });
  } catch (e) {
    serverError(res, e, 'revolving');
  }
});

// DELETE /api/revolving/:id
// 파생 수수료 거래를 같은 트랜잭션에서 지운다 — 고아 행 방지.
router.delete('/:id', (req, res) => {
  try {
    let deleted = 0;
    db.transaction(() => {
      deleted = deleteDerivedFor(db, 'revolving_history', Number(req.params.id));
      db.prepare('DELETE FROM revolving_history WHERE id=?').run(req.params.id);
    })();
    res.json({ ok: true, derived: { deleted } });
  } catch (e) {
    serverError(res, e, 'revolving');
  }
});

module.exports = router;
