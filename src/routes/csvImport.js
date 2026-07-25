'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { parseCardCsv } = require('../services/csvImport');

// CSV 경로는 엑셀 내보내기가 없는 카드사만 남긴다(#88) — 라벨은 카드사 판별용, 결제수단 조회에도 재사용.
const CARD_COMPANY_LABELS = { shinhan: '신한카드' };

// CSV/엑셀 임포트 공통 규칙: 중복은 (date, merchant, amount) 조합으로 판단한다.
// (CSV 파싱 결과에는 카드사 승인번호가 없어 cardImport.js의 approval_number 우선 체크는 적용할 수 없다.)
function findExisting(row) {
  return db.prepare(
    'SELECT id FROM transactions WHERE date = ? AND merchant = ? AND amount = ?'
  ).get(row.date, row.merchant, row.amount);
}

function getOrCreateUncategorized() {
  const existing = db.prepare(
    "SELECT id FROM categories WHERE major_type = '미분류' AND name = '미분류'"
  ).get();
  if (existing) return existing.id;
  return db.prepare(
    "INSERT INTO categories (major_type, name) VALUES ('미분류', '미분류')"
  ).run().lastInsertRowid;
}

function importCsvTransactions(cardCompany, csvText, isPreview) {
  const parsed = parseCardCsv(cardCompany, csvText);
  const valid = parsed.filter(r => !r.error);
  const invalid = parsed.length - valid.length;

  if (isPreview) {
    let count = 0, skipped = 0;
    for (const row of valid) {
      if (findExisting(row)) skipped++; else count++;
    }
    return { cardCompany, cardCompanyLabel: CARD_COMPANY_LABELS[cardCompany], count, skipped, invalid };
  }

  const paymentMethodRow = db.prepare(
    'SELECT id FROM payment_methods WHERE name = ?'
  ).get(CARD_COMPANY_LABELS[cardCompany]);
  const payment_method_id = paymentMethodRow ? paymentMethodRow.id : null;
  const category_id = getOrCreateUncategorized();

  let imported = 0, skipped = 0;
  const errors = [];
  db.transaction(() => {
    for (const row of valid) {
      try {
        if (findExisting(row)) { skipped++; continue; }
        db.prepare(`
          INSERT INTO transactions (date, category_id, amount, payment_method_id, payment_style, merchant, memo)
          VALUES (?, ?, ?, ?, '일시불', ?, ?)
        `).run(row.date, category_id, row.amount, payment_method_id, row.merchant, row.memo || null);
        imported++;
      } catch (err) {
        errors.push(`${row.date} ${row.merchant}: ${err.message}`);
      }
    }
  })();

  return { imported, skipped, invalid, errors };
}

/**
 * CSV 파일을 파싱해서 거래 내역 미리보기 제공, ?preview=true 가 아니면 실제 저장까지 수행한다.
 */
router.post('/', async (req, res) => {
  try {
    const { cardCompany, csvText } = req.body;

    if (!cardCompany || !csvText) {
      return res.status(400).json({ error: 'cardCompany and csvText are required' });
    }

    const isPreview = req.query.preview === 'true';
    const result = importCsvTransactions(cardCompany, csvText, isPreview);
    res.json(result);
  } catch (error) {
    if (/^Unsupported card company|^Required columns|^Invalid CSV data/.test(error.message)) {
      return res.status(400).json({ error: error.message });
    }
    serverError(res, error, 'csvImport');
  }
});

module.exports = router;
