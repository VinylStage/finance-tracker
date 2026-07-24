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
      SELECT t.date, t.merchant, t.amount, t.category_id, c.name AS category_name, t.memo
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      ORDER BY t.date DESC, t.id DESC
    `;
    
    const transactions = db.prepare(txSql).all();
    
    const data = {
      exported_at: new Date().toISOString(),
      transactions: transactions.map(t => ({
        date: t.date,
        merchant: t.merchant,
        amount: t.amount,
        category_id: t.category_id,
        category_name: t.category_name,
        memo: t.memo,
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
    
    // Get all current categories for lookups
    const allCategories = db.prepare('SELECT id, name FROM categories').all();
    const categoryMap = new Map(allCategories.map(c => [c.name, c.id]));
    
    const restore = db.transaction(() => {
      // If overwrite mode, delete existing transactions
      if (mode === 'overwrite') {
        db.prepare('DELETE FROM transactions').run();
      }
      
      // Process and insert transactions
      const insertTx = db.prepare(`
        INSERT INTO transactions (date, merchant, amount, category_id, memo, payment_method_id, payment_style)
        VALUES (?, ?, ?, ?, ?, NULL, '일시불')
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
        
        // Insert transaction
        insertTx.run(tx.date, tx.merchant, tx.amount, categoryId, tx.memo);
        imported++;
      }
    });
    
    restore();
    
    res.json({ ok: true, imported, skipped, total: transactions.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;