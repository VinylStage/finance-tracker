'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');

const DEFAULTS = { initial_balance: '0', monthly_income: '0' };

// 숫자로 강제. 유한한 숫자가 아니면 null (NaN 저장·반환 방지).
function asNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// GET /api/settings
router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM app_settings').all();
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    // 저장값이 손상돼 NaN 이 되면 기본값으로 폴백한다
    res.json({
      initial_balance: asNumber(map.initial_balance) ?? Number(DEFAULTS.initial_balance),
      monthly_income: asNumber(map.monthly_income) ?? Number(DEFAULTS.monthly_income),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/settings
router.put('/', (req, res) => {
  try {
    const { initial_balance, monthly_income } = req.body;
    if (initial_balance !== undefined && asNumber(initial_balance) === null) {
      return res.status(400).json({ error: 'initial_balance must be a number' });
    }
    if (monthly_income !== undefined && asNumber(monthly_income) === null) {
      return res.status(400).json({ error: 'monthly_income must be a number' });
    }
    const upsert = db.prepare(`
      INSERT INTO app_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    const tx = db.transaction(() => {
      if (initial_balance !== undefined) upsert.run('initial_balance', String(asNumber(initial_balance)));
      if (monthly_income !== undefined) upsert.run('monthly_income', String(asNumber(monthly_income)));
    });
    tx();
    res.json({ ok: true });
  } catch (e) {
    serverError(res, e, 'settings');
  }
});

module.exports = router;
