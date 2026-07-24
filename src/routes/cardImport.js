'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../db/init');
const { parseCardExcel, detectCardCompany } = require('../services/cardExcelImport');

const upload = multer({ storage: multer.memoryStorage() });

// Function to process transactions (shared logic between preview and real import)
function processTransactions(cardCompany, originalname, fileBuffer, isPreview = false) {
  // multer/busboy decode multipart filenames as latin1 by default, which mangles
  // non-ASCII (Korean) filenames — re-decode the raw bytes as utf8.
  const decodedOriginalname = Buffer.from(originalname, 'latin1').toString('utf8');
  const detectedCardCompany = detectCardCompany(decodedOriginalname);
  const transactions = parseCardExcel(detectedCardCompany, fileBuffer);

  // Filter out cancelled transactions
  const filteredTransactions = transactions.filter(t => !t.cancelled);

  const CARD_COMPANY_LABELS = {
    nonghyup: '농협카드',
    lotte: '롯데카드',
    samsung: '삼성카드',
    hana: '하나카드',
    hyundai: '현대카드',
  };

  if (isPreview) {
    // In preview mode, count new vs existing transactions without inserting
    let count = 0;
    let skipped = 0;

    for (const row of filteredTransactions) {
      // Check for duplicates
      const existing = row.approval_number
        ? db.prepare('SELECT id FROM transactions WHERE approval_number = ?').get(row.approval_number)
        : db.prepare('SELECT id FROM transactions WHERE date = ? AND merchant = ? AND amount = ?').get(row.date, row.merchant, row.amount);
      
      if (existing) {
        skipped++;
      } else {
        count++;
      }
    }

    return {
      cardCompany: detectedCardCompany,
      cardCompanyLabel: CARD_COMPANY_LABELS[detectedCardCompany],
      count,
      skipped
    };
  } else {
    // Real import mode - get or create payment_method_id and category_id
    const paymentMethodRow = db.prepare(
      'SELECT id FROM payment_methods WHERE name = ?'
    ).get(CARD_COMPANY_LABELS[detectedCardCompany]);
    const payment_method_id = paymentMethodRow ? paymentMethodRow.id : null;

    // Get or create "미분류" category
    const uncategorizedRow = db.prepare(
      "SELECT id FROM categories WHERE major_type = '미분류' AND name = '미분류'"
    ).get();
    let category_id;
    if (uncategorizedRow) {
      category_id = uncategorizedRow.id;
    } else {
      const result = db.prepare(
        "INSERT INTO categories (major_type, name) VALUES ('미분류', '미분류')"
      ).run();
      category_id = result.lastInsertRowid;
    }

    let imported = 0;
    let skipped = 0;
    const errors = [];

    db.transaction(() => {
      for (const row of filteredTransactions) {
        try {
          // Check for duplicates
          const existing = row.approval_number
            ? db.prepare('SELECT id FROM transactions WHERE approval_number = ?').get(row.approval_number)
            : db.prepare('SELECT id FROM transactions WHERE date = ? AND merchant = ? AND amount = ?').get(row.date, row.merchant, row.amount);
          
          if (existing) {
            skipped++;
            continue;
          }

          // Insert transaction
          db.prepare(`
            INSERT INTO transactions 
              (date, category_id, amount, payment_method_id, payment_style, merchant, approval_number)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            row.date,
            category_id,
            row.amount,
            payment_method_id,
            row.is_installment ? '할부' : '일시불',
            row.merchant,
            row.approval_number
          );
          
          imported++;
        } catch (err) {
          errors.push(`${row.date} ${row.merchant}: ${err.message}`);
        }
      }
    })(); // Immediately invoke the transaction

    return { imported, skipped, errors };
  }
}

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'file is required' });
    }

    // 카드사 판별은 processTransactions 내부에서 파일명을 UTF-8로 디코딩한 뒤 수행한다.
    // (라우트에서 원본 파일명으로 detect하면 multer latin1 인코딩 때문에 한글 파일명이 항상 실패했다)
    const isPreview = req.query.preview === 'true';
    const result = processTransactions(null, req.file.originalname, req.file.buffer, isPreview);
    res.json(result);
  } catch (e) {
    // 잘못된 입력(미지원 카드사, 시트 부재, 파싱 실패)은 400. 그 외는 500.
    if (/^(UNSUPPORTED_CARD|SHEET_NOT_FOUND):/.test(e.message)) {
      return res.status(400).json({ error: e.message });
    }
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;