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

    const cardCompany = req.query.preview === 'true' ? null : detectCardCompany(req.file.originalname);

    if (req.query.preview === 'true') {
      // In preview mode, don't write to DB - just count new vs existing transactions
      const result = processTransactions(cardCompany, req.file.originalname, req.file.buffer, true);
      res.json(result);
    } else {
      // Real import mode
      const result = processTransactions(cardCompany, req.file.originalname, req.file.buffer);
      res.json(result);
    }
  } catch (e) {
    if (e.message.includes('Unknown card company')) {
      return res.status(400).json({ error: e.message });
    }
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;