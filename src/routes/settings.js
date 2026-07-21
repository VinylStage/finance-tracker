'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');

const DEFAULTS = { initial_balance: '0', monthly_income: '0' };

// GET /api/settings
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM app_settings').all();
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json({
    initial_balance: Number(map.initial_balance ?? DEFAULTS.initial_balance),
    monthly_income: Number(map.monthly_income ?? DEFAULTS.monthly_income),
  });
});

// PUT /api/settings
router.put('/', (req, res) => {
  try {
    const { initial_balance, monthly_income } = req.body;
    const upsert = db.prepare(`
      INSERT INTO app_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    const tx = db.transaction(() => {
      if (initial_balance !== undefined) upsert.run('initial_balance', String(initial_balance));
      if (monthly_income !== undefined) upsert.run('monthly_income', String(monthly_income));
    });
    tx();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
