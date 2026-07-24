'use strict';
const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// API routes
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/categories',   require('./routes/categories'));
app.use('/api/payment-methods', require('./routes/paymentMethods'));
app.use('/api/installments', require('./routes/installments'));
app.use('/api/revolving',    require('./routes/revolving'));
app.use('/api/debts',        require('./routes/debts'));
app.use('/api/cashflow',     require('./routes/cashflow'));
app.use('/api/savings',      require('./routes/savings'));
app.use('/api/export',       require('./routes/export'));
app.use('/api/data',         require('./routes/data'));
app.use('/api/settings',     require('./routes/settings'));
app.use('/api/exchange',     require('./routes/exchange'));
app.use('/api/stocks',       require('./routes/stocks'));
app.use('/api/csv-import',   require('./routes/csvImport'));
app.use('/api/card-import',  require('./routes/cardImport'));
app.use('/api/guide',        require('./routes/guide'));

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Serve React build (Phase 1+)
const PUBLIC = path.join(__dirname, '../public');
app.use(express.static(PUBLIC));
app.use((_req, res) => {
  const index = path.join(PUBLIC, 'index.html');
  const fs = require('fs');
  if (fs.existsSync(index)) {
    res.sendFile(index);
  } else {
    res.json({ message: 'finance-tracker API running. Frontend not built yet.' });
  }
});

const HOST = process.env.HOST || '127.0.0.1';
const PORT = process.env.PORT || 3000;
app.listen(PORT, HOST, () => {
  if (HOST === '0.0.0.0' || HOST === '::') {
    console.log(`[server] http://${HOST}:${PORT} (모든 인터페이스에 노출됨)`);
  } else {
    console.log(`[server] http://${HOST}:${PORT}`);
  }
});
