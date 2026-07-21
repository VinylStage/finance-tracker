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
app.use('/api/settings',     require('./routes/settings'));

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Serve React build (Phase 1+)
const PUBLIC = path.join(__dirname, '../public');
app.use(express.static(PUBLIC));
app.get('*', (_req, res) => {
  const index = path.join(PUBLIC, 'index.html');
  const fs = require('fs');
  if (fs.existsSync(index)) {
    res.sendFile(index);
  } else {
    res.json({ message: 'finance-tracker API running. Frontend not built yet.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[server] http://localhost:${PORT}`));
