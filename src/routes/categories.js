'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');

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

router.post('/', (req, res) => {
  try {
    const { major_type, name, monthly_budget = 0 } = req.body;
    const result = db.prepare(
      'INSERT INTO categories (major_type, name, monthly_budget) VALUES (?,?,?)'
    ).run(major_type, name, monthly_budget);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  const { major_type, name, monthly_budget, is_active } = req.body;
  db.prepare('UPDATE categories SET major_type=?, name=?, monthly_budget=?, is_active=? WHERE id=?')
    .run(major_type, name, monthly_budget ?? 0, is_active ?? 1, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('UPDATE categories SET is_active=0 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
