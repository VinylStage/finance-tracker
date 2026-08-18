'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');

const DEFAULTS = { initial_balance: '0', monthly_income: '0' };

// 숫자로 강제. 유한한 숫자가 아니면 null (NaN 저장·반환 방지).
// **`Number(null)` 은 0 이다.** null 을 그냥 넘기면 「유효한 숫자 0」 으로 판정돼
// 기존 설정이 조용히 0 으로 덮어써진다(#683). 값이 없는 것과 0 은 다르다.
function asNumber(v) {
  if (v === null || v === undefined || v === '') return null;
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
    serverError(res, e, 'settings');
  }
});

// PUT /api/settings
router.put('/', (req, res) => {
  try {
    const { initial_balance, monthly_income } = req.body;
    if (initial_balance !== undefined && initial_balance !== '' && asNumber(initial_balance) === null) {
      return res.status(400).json({ error: '초기 잔액은 숫자로 입력해 주세요.' });
    }
    if (monthly_income !== undefined && monthly_income !== '' && asNumber(monthly_income) === null) {
      return res.status(400).json({ error: '월 수입 기준값은 숫자로 입력해 주세요.' });
    }
    // 초기 잔액은 음수가 정상이다(빚). 수입 기준값은 아니다.
    if (monthly_income !== undefined && monthly_income !== '' && asNumber(monthly_income) < 0) {
      return res.status(400).json({ error: '월 수입 기준값은 0 이상으로 입력해 주세요.' });
    }
    const upsert = db.prepare(`
      INSERT INTO app_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    const tx = db.transaction(() => {
      if (initial_balance !== undefined && initial_balance !== '') upsert.run('initial_balance', String(asNumber(initial_balance)));
      if (monthly_income !== undefined && monthly_income !== '') upsert.run('monthly_income', String(asNumber(monthly_income)));
    });
    tx();
    res.json({ ok: true });
  } catch (e) {
    serverError(res, e, 'settings');
  }
});

module.exports = router;
