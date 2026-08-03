'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { asInt, numericBody } = require('../utils/validate');
const {
  createDebtInterestDerived, deleteDebtDerived, derivedRowsForDebt,
} = require('../services/derivedTransactions');

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
    serverError(res, e, 'debts');
  }
});

// POST /api/debts
router.post('/', numericBody(['balance', 'annual_rate']), (req, res) => {
  try {
    const { name, balance, annual_rate = 0, type = '일반', memo } = req.body;
    if (!name || balance === undefined) {
      return res.status(400).json({ error: '부채 이름과 잔액은 필수입니다.' });
    }
    const result = db.prepare(`
      INSERT INTO debts (name, balance, annual_rate, type, memo)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, balance, annual_rate, type, memo || null);
    res.status(201).json({ id: result.lastInsertRowid, ok: true });
  } catch (e) {
    serverError(res, e, 'debts');
  }
});

// PUT /api/debts/:id
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM debts WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: '찾는 부채가 없습니다. 이미 삭제됐을 수 있어요.' });
    const merged = { ...existing, ...req.body };
    db.prepare(`
      UPDATE debts SET name=?, balance=?, annual_rate=?, type=?, memo=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(merged.name, merged.balance, merged.annual_rate, merged.type || '일반', merged.memo || null, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    serverError(res, e, 'debts');
  }
});

// DELETE /api/debts/:id
router.delete('/:id', (req, res) => {
  // 파생 이자 거래 → 이자 이력 → 부채 순으로 지운다. 이력을 먼저 지우면
  // 어떤 거래가 이 부채 것이었는지 찾을 방법이 없어져 고아 행이 남는다(#269).
  let deleted = 0;
  const tx = db.transaction(() => {
    deleted = deleteDebtDerived(db, Number(req.params.id));
    db.prepare('DELETE FROM debt_interest_log WHERE debt_id=?').run(req.params.id);
    db.prepare('DELETE FROM debts WHERE id=?').run(req.params.id);
  });
  tx();
  res.json({ ok: true, derived: { deleted } });
});

// POST /api/debts/:id/interest — 이자 추가 (잔액 자동 반영)
router.post('/:id/interest', numericBody(['rate', 'interest_amount']), (req, res) => {
  try {
    const debt = db.prepare('SELECT * FROM debts WHERE id=?').get(req.params.id);
    if (!debt) return res.status(404).json({ error: '찾는 부채가 없습니다. 이미 삭제됐을 수 있어요.' });

    const { rate, interest_amount, log_date, memo } = req.body;
    if (rate === undefined || interest_amount === undefined || !log_date) {
      return res.status(400).json({ error: '이자율, 이자 금액, 기록일은 필수입니다.' });
    }
    // FND-06(감사): interest_amount가 문자열이면 balance_after 산술이 문자열
    // 연결로 동작해 부채 잔액이 오염될 수 있었다. INTEGER 컬럼이라 asInt로 강제한다.
    const interestAmount = asInt(interest_amount);
    if (interestAmount === null) return res.status(400).json({ error: '이자 금액은 정수로 입력해 주세요.' });

    const balance_before = debt.balance;
    const balance_after = balance_before + interestAmount;

    let derived = { created: 0 };
    const tx = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO debt_interest_log (debt_id, log_date, rate_at_time, interest_amount, balance_before, balance_after, memo)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(req.params.id, log_date, rate, interestAmount, balance_before, balance_after, memo || null);

      db.prepare(`
        UPDATE debts SET balance=?, annual_rate=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
      `).run(balance_after, rate, req.params.id);

      // 이자 기록이 거래 1건을 만든다(#269). 기록·잔액·거래가 한 트랜잭션이다.
      derived = createDebtInterestDerived(db, Number(info.lastInsertRowid));
    });
    tx();

    res.status(201).json({ ok: true, balance_after, derived });
  } catch (e) {
    serverError(res, e, 'debts');
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
    serverError(res, e, 'debts');
  }
});

// GET /api/debts/:id/derived — 이 부채가 만든 이자 거래 목록(#270).
router.get('/:id/derived', (req, res) => {
  try {
    res.json({ data: derivedRowsForDebt(db, Number(req.params.id)) });
  } catch (e) {
    serverError(res, e, 'debts');
  }
});

module.exports = router;
