'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');

router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM payment_methods WHERE is_active=1 ORDER BY name').all();
  res.json(rows);
});

router.post('/', (req, res) => {
  try {
    const { name, type } = req.body;
    const result = db.prepare('INSERT INTO payment_methods (name, type) VALUES (?,?)').run(name, type);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  const { name, type, is_active } = req.body;
  db.prepare('UPDATE payment_methods SET name=?, type=?, is_active=? WHERE id=?')
    .run(name, type, is_active ?? 1, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('UPDATE payment_methods SET is_active=0 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
