'use strict';
const express = require('express');
const path = require('path');
const { csrfGuard } = require('./utils/csrfGuard');
const { securityHeaders } = require('./utils/securityHeaders');
const { serverError } = require('./utils/errors');
const app = express();

app.disable('x-powered-by');
app.use(securityHeaders);

// 백업 복원(import)은 큰 JSON 본문을 받는다. 전역 파서가 먼저 실행되므로
// 라우트별 limit 설정은 무효가 된다. 전역에서 한도를 올려 통일한다.
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(csrfGuard);

// API routes
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/categories',   require('./routes/categories'));
app.use('/api/payment-methods', require('./routes/paymentMethods'));
app.use('/api/installments', require('./routes/installments'));
app.use('/api/revolving',    require('./routes/revolving'));
app.use('/api/debts',        require('./routes/debts'));
app.use('/api/cashflow',     require('./routes/cashflow'));
app.use('/api/savings',      require('./routes/savings'));
app.use('/api/recurring-rules', require('./routes/recurringRules'));
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

// 전역 에러 미들웨어(FND-04/15) — 반드시 마지막에 등록한다.
// Express 5는 라우트 핸들러의 동기 throw와 async 핸들러의 reject를 자동으로
// 여기까지 전달하므로, 개별 핸들러의 try/catch 누락 여부와 무관하게
// 이 지점이 항상 최종 방어선이 된다. NODE_ENV와 무관하게 항상 내부 정보를
// 감춘 응답만 내려보내(serverError와 동일 정책) Express 기본 에러 핸들러의
// 스택트레이스 노출로 새지 않도록 한다.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  serverError(res, err, 'unhandled');
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
