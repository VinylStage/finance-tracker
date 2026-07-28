'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { numericBody } = require('../utils/validate');
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

router.delete('/:id', (req, res) => {
  db.prepare('UPDATE categories SET is_active=0 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
