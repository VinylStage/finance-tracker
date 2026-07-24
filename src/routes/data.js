'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');

// GET /api/data/export - Export all transactions with category names
router.get('/export', (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const fileName = `finance-backup-${today}.json`;
    
    // Join transactions with categories to get category names
    const txSql = `
      SELECT t.date, t.merchant, t.amount, t.category_id, c.name AS category_name, t.memo,
        t.payment_method_id, t.payment_style, t.approval_number, t.installment_id, t.created_at
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      ORDER BY t.date DESC, t.id DESC
    `;
    
    const transactions = db.prepare(txSql).all();
    
    const data = {
      exported_at: new Date().toISOString(),
      schema_version: 2,
      transactions: transactions.map(t => ({
        date: t.date,
        merchant: t.merchant,
        amount: t.amount,
        category_id: t.category_id,
        category_name: t.category_name,
        memo: t.memo,
        payment_method_id: t.payment_method_id,
        payment_style: t.payment_style,
        approval_number: t.approval_number,
        installment_id: t.installment_id,
        created_at: t.created_at,
        source: 'manual'
      }))
    };
    
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/data/import - Import transactions
router.post('/import', express.json({ limit: '10mb' }), (req, res) => {
  try {
    const { mode, transactions } = req.body;
    
    // Validate input
    if (mode !== 'append' && mode !== 'overwrite') {
      return res.status(400).json({ error: 'Invalid mode. Must be "append" or "overwrite"' });
    }
    
    if (!Array.isArray(transactions)) {
      return res.status(400).json({ error: 'Transactions must be an array' });
    }
    
    let imported = 0;
    let skipped = 0;
    let legacy_fields_defaulted = false;
    let fk_fallback = false;

    // Get all current categories for lookups
    const allCategories = db.prepare('SELECT id, name FROM categories').all();
    const categoryMap = new Map(allCategories.map(c => [c.name, c.id]));
    // 백업의 FK 값이 현재 DB에 존재하지 않을 수 있다(다른 기기 복원, 결제수단/할부 초기화 등).
    // foreign_keys=ON 이므로 없는 FK를 그대로 넣으면 트랜잭션 전체가 롤백된다. 존재하는 값만 넣고 나머지는 NULL로 폴백한다.
    const paymentMethodIds = new Set(db.prepare('SELECT id FROM payment_methods').all().map(r => r.id));
    const installmentIds = new Set(db.prepare('SELECT id FROM installments').all().map(r => r.id));
    
    const restore = db.transaction(() => {
      // If overwrite mode, delete existing transactions
      if (mode === 'overwrite') {
        db.prepare('DELETE FROM transactions').run();
      }
      
      // Process and insert transactions
      const insertTx = db.prepare(`
        INSERT INTO transactions (date, merchant, amount, category_id, memo, payment_method_id, payment_style, approval_number, installment_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      for (const tx of transactions) {
        // Skip if required fields are missing
        if (!tx.date || tx.amount === undefined || tx.amount === null) {
          skipped++;
          continue;
        }
        
        let categoryId = tx.category_id;
        
        // If category_id doesn't exist, try to find by category_name
        if (!categoryId || !allCategories.some(c => c.id === categoryId)) {
          const foundCategory = allCategories.find(c => c.name === tx.category_name);
          if (foundCategory) {
            categoryId = foundCategory.id;
          } else {
            skipped++;
            continue;
          }
        }
        
        // Handle legacy fields
        let payment_method_id = tx.payment_method_id !== undefined ? tx.payment_method_id : null;
        let payment_style = '일시불';
        if (tx.payment_style !== undefined) {
          payment_style = tx.payment_style;
        } else {
          legacy_fields_defaulted = true;
        }

        const approval_number = tx.approval_number !== undefined ? tx.approval_number : null;
        let installment_id = tx.installment_id !== undefined ? tx.installment_id : null;

        // 현재 DB에 존재하지 않는 FK 값은 NULL로 폴백(전체 롤백 방지)
        if (payment_method_id !== null && !paymentMethodIds.has(payment_method_id)) {
          payment_method_id = null;
          fk_fallback = true;
        }
        if (installment_id !== null && !installmentIds.has(installment_id)) {
          installment_id = null;
          fk_fallback = true;
        }

        // Insert transaction
        insertTx.run(tx.date, tx.merchant, tx.amount, categoryId, tx.memo, payment_method_id, payment_style, approval_number, installment_id);
        imported++;
      }
    });
    
    restore();
    
    const response = { ok: true, imported, skipped, total: transactions.length };
    if (legacy_fields_defaulted) {
      response.legacy_fields_defaulted = true;
    }
    if (fk_fallback) {
      response.fk_fallback = true;
    }

    res.json(response);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;