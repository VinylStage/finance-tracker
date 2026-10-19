'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { numericBody } = require('../utils/validate');
const { usageOf } = require('../services/activeRefs');
const { MAJOR_TYPES } = require('../constants');

router.get('/', (req, res) => {
  const includeInactive = req.query.include_inactive;
  let query = 'SELECT * FROM categories';
  const params = [];
  
  if (!includeInactive) {
    query += ' WHERE is_active=1';
  }
  
  query += ' ORDER BY major_type, name';
  
  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

router.post('/', numericBody(['monthly_budget']), (req, res) => {
  try {
    const { major_type, name, monthly_budget = 0 } = req.body;
    if (!MAJOR_TYPES.includes(major_type)) {
      return res.status(400).json({ error: `major_type must be one of ${MAJOR_TYPES.join(', ')}` });
    }
    const result = db.prepare(
      'INSERT INTO categories (major_type, name, monthly_budget) VALUES (?,?,?)'
    ).run(major_type, name, monthly_budget);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    serverError(res, e, 'categories');
  }
});

router.put('/:id', numericBody(['monthly_budget', 'is_active']), (req, res) => {
  try {
    const { major_type, name, monthly_budget, is_active } = req.body;
    if (!MAJOR_TYPES.includes(major_type)) {
      return res.status(400).json({ error: `major_type must be one of ${MAJOR_TYPES.join(', ')}` });
    }
    db.prepare('UPDATE categories SET major_type=?, name=?, monthly_budget=?, is_active=? WHERE id=?')
      .run(major_type, name, monthly_budget ?? 0, is_active ?? 1, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    serverError(res, e, 'categories');
  }
});

// GET /:id/delete-preview — 끄기 전에 이 분류를 쓰는 활성 반복규칙·거래 수를 준다(#677).
// 화면이 「규칙도 함께 끌까요」 를 묻는 근거다(ADR 0008 프리뷰 → 확인).
router.get('/:id/delete-preview', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM categories WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: '찾는 분류가 없습니다. 이미 삭제됐을 수 있어요.' });
    res.json({ id: existing.id, ...usageOf(db, 'category', existing.id) });
  } catch (e) {
    serverError(res, e, 'categories');
  }
});

// DELETE /:id?stopRules=1 — 지우지 않고 끈다. stopRules 면 이 분류를 쓰는 활성 반복규칙도
// 함께 끈다(#677). 안 끄면 그 규칙은 지금처럼 계속 거래를 만든다 — 고르는 건 사용자다.
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM categories WHERE id=?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: '찾는 분류가 없습니다. 이미 삭제됐을 수 있어요.' });
    }
    const stopRules = req.query.stopRules === '1' || req.query.stopRules === 'true';
    const stopped = db.transaction(() => {
      db.prepare('UPDATE categories SET is_active=0 WHERE id=?').run(existing.id);
      if (!stopRules) return 0;
      return db.prepare('UPDATE recurring_rules SET is_active=0 WHERE category_id=? AND is_active=1').run(existing.id).changes;
    })();
    res.json({ ok: true, stopped_rules: stopped });
  } catch (e) {
    serverError(res, e, 'categories');
  }
});

module.exports = router;
