'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { PAYMENT_STYLES, MAJOR_TYPES } = require('../constants');
const { localYMD } = require('../utils/date');

// GET /api/data-integrity
router.get('/', (req, res) => {
  try {
    const checks = [];

    // 1. 비ISO 날짜 형식
    const invalidDates = db.prepare(`
      SELECT id, date FROM transactions
      WHERE length(date) != 10 OR substr(date, 5, 1) != '-' OR substr(date, 8, 1) != '-'
      LIMIT 20
    `).all();
    checks.push({
      name: '비ISO 날짜 형식',
      count: db.prepare(`SELECT count(*) as count FROM transactions WHERE length(date) != 10 OR substr(date, 5, 1) != '-' OR substr(date, 8, 1) != '-'`).get().count,
      samples: invalidDates
    });

    // 2. payment_style/major_type 이상값
    const invalidPaymentStyles = db.prepare(`
      SELECT t.id, t.payment_style FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.payment_style NOT IN (${PAYMENT_STYLES.map(() => '?').join(',')})
      LIMIT 20
    `).all(...PAYMENT_STYLES);
    checks.push({
      name: 'payment_style 이상값',
      count: db.prepare(`SELECT count(*) as count FROM transactions t LEFT JOIN categories c ON t.category_id = c.id WHERE t.payment_style NOT IN (${PAYMENT_STYLES.map(() => '?').join(',')})`).get(...PAYMENT_STYLES).count,
      samples: invalidPaymentStyles
    });

    const invalidMajorTypes = db.prepare(`
      SELECT c.id, c.major_type FROM categories c
      WHERE c.major_type NOT IN (${MAJOR_TYPES.map(() => '?').join(',')})
      LIMIT 20
    `).all(...MAJOR_TYPES);
    checks.push({
      name: 'major_type 이상값',
      count: db.prepare(`SELECT count(*) as count FROM categories c WHERE c.major_type NOT IN (${MAJOR_TYPES.map(() => '?').join(',')})`).get(...MAJOR_TYPES).count,
      samples: invalidMajorTypes
    });

    // 3. 금액이 비정상적으로 작은 임포트 건
    const smallAmounts = db.prepare(`
      SELECT id, amount FROM transactions
      WHERE amount > 0 AND amount < 100
      LIMIT 20
    `).all();
    checks.push({
      name: '금액이 비정상적으로 작은 임포트 건',
      count: db.prepare(`SELECT count(*) as count FROM transactions WHERE amount > 0 AND amount < 100`).get().count,
      samples: smallAmounts
    });

    // 4. 종료됐어야 하는데 진행중으로 남은 할부
    const today = localYMD();
    const overdueInstallments = db.prepare(`
      SELECT id FROM installments
      WHERE status = '진행중'
        AND ? >= strftime('%Y-%m-%d', date(start_billing_month || '-01', '+' || months || ' months'))
      LIMIT 20
    `).all(today);
    checks.push({
      name: '종료됐어야 하는데 진행중으로 남은 할부',
      count: db.prepare(`
        SELECT count(*) as count FROM installments
        WHERE status = '진행중'
          AND ? >= strftime('%Y-%m-%d', date(start_billing_month || '-01', '+' || months || ' months'))
      `).get(today).count,
      samples: overdueInstallments
    });

    // 5. 카테고리 없는 거래(orphan category_id) 및 중복 승인번호
    const orphanTransactions = db.prepare(`
      SELECT id, category_id FROM transactions t
      WHERE t.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = t.category_id)
      LIMIT 20
    `).all();
    checks.push({
      name: '카테고리 없는 거래',
      count: db.prepare(`
        SELECT count(*) as count FROM transactions t
        WHERE t.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = t.category_id)
      `).get().count,
      samples: orphanTransactions
    });

    const duplicateApprovalNumbers = db.prepare(`
      SELECT approval_number, count(*) as cnt FROM transactions
      WHERE approval_number IS NOT NULL
      GROUP BY approval_number
      HAVING count(*) > 1
      LIMIT 20
    `).all();
    checks.push({
      name: '중복 승인번호',
      count: db.prepare(`
        SELECT count(*) as count FROM (
          SELECT approval_number FROM transactions
          WHERE approval_number IS NOT NULL
          GROUP BY approval_number
          HAVING count(*) > 1
        )
      `).get().count,
      samples: duplicateApprovalNumbers.map(row => ({ approval_number: row.approval_number, count: row.cnt }))
    });

    res.json({ checks });
  } catch (e) {
    serverError(res, e, 'data-integrity');
  }
});

module.exports = router;
