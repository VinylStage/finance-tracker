'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { localYMD } = require('../utils/date');

const SCHEMA_VERSION = 1;

// FND-19(감사): from/to가 검증 없이 Content-Disposition 헤더와 SQL 바인딩에 쓰였다.
// CRLF는 Node가 헤더 값에서 자체적으로 거부하지만(ERR_INVALID_CHAR), 따옴표로
// 파일명을 조작하거나 제어문자로 500을 유발할 수 있었다. 날짜 형식만 허용한다.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isInvalidDateParam(value) {
  return value !== undefined && value !== null && value !== '' && !DATE_RE.test(value);
}

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(rows, columns) {
  const header = columns.join(',');
  const lines = rows.map(r => columns.map(c => csvEscape(r[c])).join(','));
  return [header, ...lines].join('\n');
}

function getTransactionsForRange(from, to) {
  let txSql = `
    SELECT t.id, t.date, c.major_type, c.name AS category, t.amount, p.name AS payment_method,
           t.payment_style, t.merchant, t.memo
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN payment_methods p ON t.payment_method_id = p.id
    WHERE 1=1
  `;
  const params = [];
  if (from) { txSql += ' AND t.date >= ?'; params.push(from); }
  if (to) { txSql += ' AND t.date <= ?'; params.push(to); }
  txSql += ' ORDER BY t.date DESC, t.id DESC';
  return db.prepare(txSql).all(...params);
}

function getFullBackup(from, to) {
  let rawTxSql = `SELECT t.* FROM transactions t WHERE 1=1`;
  const params = [];
  if (from) { rawTxSql += ' AND t.date >= ?'; params.push(from); }
  if (to) { rawTxSql += ' AND t.date <= ?'; params.push(to); }
  rawTxSql += ' ORDER BY t.date DESC, t.id DESC';

  return {
    schema_version: SCHEMA_VERSION,
    exported_at: new Date().toISOString(), // 의도적 UTC 타임스탬프(내보내기 메타데이터, 로컬 날짜 아님) — 변경하지 않음
    range: { from: from || null, to: to || null },
    transactions: db.prepare(rawTxSql).all(...params),
    categories: db.prepare('SELECT * FROM categories').all(),
    payment_methods: db.prepare('SELECT * FROM payment_methods').all(),
    installments: db.prepare('SELECT * FROM installments').all(),
    revolving_history: db.prepare('SELECT * FROM revolving_history').all(),
    debts: db.prepare('SELECT * FROM debts').all(),
    debt_interest_log: db.prepare('SELECT * FROM debt_interest_log').all(),
    savings_products: db.prepare('SELECT * FROM savings_products').all(),
    app_settings: db.prepare('SELECT * FROM app_settings').all(),
  };
}

function sendCsv(res, from, to) {
  if (isInvalidDateParam(from) || isInvalidDateParam(to)) {
    return res.status(400).json({ error: 'from/to must be in YYYY-MM-DD format' });
  }
  const transactions = getTransactionsForRange(from, to);
  const csv = toCsv(transactions, ['id', 'date', 'major_type', 'category', 'amount', 'payment_method', 'payment_style', 'merchant', 'memo']);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="transactions_${from || 'all'}_${to || 'all'}.csv"`);
  res.send('﻿' + csv);
}

function sendJson(res, from, to) {
  if (isInvalidDateParam(from) || isInvalidDateParam(to)) {
    return res.status(400).json({ error: 'from/to must be in YYYY-MM-DD format' });
  }
  const data = getFullBackup(from, to);
  res.setHeader('Content-Disposition', `attachment; filename="finance-tracker-export_${from || 'all'}_${to || 'all'}.json"`);
  res.json(data);
}

// GET /api/export/csv?from=YYYY-MM-DD&to=YYYY-MM-DD — 거래내역 CSV (카테고리/결제수단 join)
router.get('/csv', (req, res) => {
  try {
    sendCsv(res, req.query.from, req.query.to);
  } catch (e) {
    serverError(res, e, 'export');
  }
});

// GET /api/export/json?from=YYYY-MM-DD&to=YYYY-MM-DD — 전체 스키마 백업 (schema_version 포함, 재import 가능)
router.get('/json', (req, res) => {
  try {
    sendJson(res, req.query.from, req.query.to);
  } catch (e) {
    serverError(res, e, 'export');
  }
});

// GET /api/export?format=csv|json&from=&to= — 구버전 호환용 (내부적으로 위 두 라우트에 위임)
router.get('/', (req, res) => {
  try {
    const { format = 'json', from, to } = req.query;
    if (format === 'csv') return sendCsv(res, from, to);
    return sendJson(res, from, to);
  } catch (e) {
    serverError(res, e, 'export');
  }
});

function getSettingsBackup() {
  return {
    schema_version: SCHEMA_VERSION,
    exported_at: new Date().toISOString(), // 의도적 UTC 타임스탬프(내보내기 메타데이터, 로컬 날짜 아님) — 변경하지 않음
    type: 'settings',
    categories: db.prepare('SELECT * FROM categories').all(),
    payment_methods: db.prepare('SELECT * FROM payment_methods').all(),
    app_settings: db.prepare('SELECT * FROM app_settings').all(),
  };
}

// FND-03(감사): DELETE 후 INSERT 방식은 거래가 1건이라도 있으면 categories의
// DELETE가 FK 제약 위반으로 실패해 복원이 항상 실패했다. 근본 문제는 기술적
// 제약만이 아니다 — 이 백업은 설정(카테고리/결제수단/앱설정)만 담고 거래는
// 담지 않으므로, "백업에 없는 카테고리를 지운다"는 판단 자체를 이 함수가 안전하게
// 내릴 수 없다(그 카테고리를 참조하는 거래가 지금 DB에 있는지 알 방법이 없다).
// 그래서 삭제 없이 UPSERT만 한다 — 백업에 있는 항목은 갱신/추가되고, 백업에
// 없는 기존 항목은 그대로 남는다.
function restoreSettings(payload) {
  const restore = db.transaction(() => {
    if (payload.categories) {
      const ins = db.prepare(`
        INSERT INTO categories (id, major_type, name, monthly_budget, is_active)
        VALUES (@id, @major_type, @name, @monthly_budget, @is_active)
        ON CONFLICT(id) DO UPDATE SET
          major_type = excluded.major_type, name = excluded.name,
          monthly_budget = excluded.monthly_budget, is_active = excluded.is_active
      `);
      payload.categories.forEach(r => ins.run(r));
    }
    if (payload.payment_methods) {
      const ins = db.prepare(`
        INSERT INTO payment_methods (id, name, type, is_active, created_at)
        VALUES (@id, @name, @type, @is_active, @created_at)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name, type = excluded.type,
          is_active = excluded.is_active, created_at = excluded.created_at
      `);
      payload.payment_methods.forEach(r => ins.run(r));
    }
    if (payload.app_settings) {
      const ins = db.prepare(`
        INSERT INTO app_settings (key, value) VALUES (@key, @value)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `);
      payload.app_settings.forEach(r => ins.run(r));
    }
  });
  restore();
}

// GET /api/export/settings — 설정 전용 백업
router.get('/settings', (req, res) => {
  try {
    const data = getSettingsBackup();
    res.setHeader('Content-Disposition', `attachment; filename=\"finance-tracker-settings_${localYMD()}.json\"`);
    res.json(data);
  } catch (e) {
    serverError(res, e, 'export');
  }
});

// POST /api/export/settings/restore — 설정 전용 복원
// FND-03: 기존 카테고리/결제수단/설정을 덮어쓰는 파괴적 동작인데 확인 절차가
// 없었다. data.js의 DELETE_ALL 정책과 동일한 원칙을 적용하되, 이 라우트는
// 삭제가 아니라 덮어쓰기라 문구를 다르게 둔다.
// (라우트 단위 express.json() 재마운트는 죽은 코드였다 — server.js의 전역
// 파서가 먼저 실행되므로 여기서 다시 걸어도 적용되지 않는다. 제거했다.)
router.post('/settings/restore', (req, res) => {
  try {
    const { confirm, ...payload } = req.body || {};
    if (confirm !== 'OVERWRITE_SETTINGS') {
      return res.status(400).json({ error: 'confirm: "OVERWRITE_SETTINGS" required' });
    }
    if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'invalid payload' });
    if (!payload.categories && !payload.payment_methods && !payload.app_settings) {
      return res.status(400).json({ error: 'payload must contain at least one of categories, payment_methods, app_settings' });
    }
    restoreSettings(payload);
    res.json({ ok: true });
  } catch (e) {
    serverError(res, e, 'export');
  }
});

module.exports = router;
