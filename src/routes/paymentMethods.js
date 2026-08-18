'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { numericBody } = require('../utils/validate');

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

router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM payment_methods WHERE id=?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: '찾는 결제수단이 없습니다. 이미 삭제됐을 수 있어요.' });
    }
    db.prepare('UPDATE payment_methods SET is_active=0 WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    serverError(res, e, 'paymentMethods');
  }
});

module.exports = router;
