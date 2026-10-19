'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { numericBody } = require('../utils/validate');
const { usageOf } = require('../services/activeRefs');

router.get('/', (req, res) => {
  const includeInactive = req.query.include_inactive;
  let query = 'SELECT * FROM payment_methods';
  const params = [];
  
  if (!includeInactive) {
    query += ' WHERE is_active=1';
  }
  
  query += ' ORDER BY name';
  
  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

router.post('/', (req, res) => {
  try {
    const { name, type } = req.body;
    const result = db.prepare(
      'INSERT INTO payment_methods (name, type) VALUES (?,?)'
    ).run(name, type);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    serverError(res, e, 'paymentMethods');
  }
});

router.put('/:id', numericBody(['is_active']), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM payment_methods WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: '찾는 결제수단이 없습니다. 이미 삭제됐을 수 있어요.' });

    const { name, type, is_active } = req.body;
    db.prepare('UPDATE payment_methods SET name=?, type=?, is_active=? WHERE id=?')
      .run(name, type, is_active ?? 1, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    serverError(res, e, 'paymentMethods');
  }
});

// GET /:id/delete-preview — 끄기 전에 이 결제수단를 쓰는 활성 반복규칙·거래 수를 준다(#677).
// 화면이 「규칙도 함께 끌까요」 를 묻는 근거다(ADR 0008 프리뷰 → 확인).
router.get('/:id/delete-preview', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM payment_methods WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: '찾는 결제수단이 없습니다. 이미 삭제됐을 수 있어요.' });
    res.json({ id: existing.id, ...usageOf(db, 'payment_method', existing.id) });
  } catch (e) {
    serverError(res, e, 'paymentMethods');
  }
});

// DELETE /:id?stopRules=1 — 지우지 않고 끈다. stopRules 면 이 결제수단를 쓰는 활성 반복규칙도
// 함께 끈다(#677). 안 끄면 그 규칙은 지금처럼 계속 거래를 만든다 — 고르는 건 사용자다.
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM payment_methods WHERE id=?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: '찾는 결제수단이 없습니다. 이미 삭제됐을 수 있어요.' });
    }
    const stopRules = req.query.stopRules === '1' || req.query.stopRules === 'true';
    const stopped = db.transaction(() => {
      db.prepare('UPDATE payment_methods SET is_active=0 WHERE id=?').run(existing.id);
      if (!stopRules) return 0;
      return db.prepare('UPDATE recurring_rules SET is_active=0 WHERE payment_method_id=? AND is_active=1').run(existing.id).changes;
    })();
    res.json({ ok: true, stopped_rules: stopped });
  } catch (e) {
    serverError(res, e, 'paymentMethods');
  }
});

module.exports = router;
