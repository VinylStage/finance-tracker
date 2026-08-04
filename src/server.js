'use strict';
const express = require('express');
const path = require('path');
const { csrfGuard } = require('./utils/csrfGuard');
const { securityHeaders } = require('./utils/securityHeaders');
const { auditContext, bindAuditDb } = require('./utils/auditContext');
const db = require('./db/init');
const { runCatchup, setLastCatchupSummary } = require('./services/recurringCatchup');
const { serverError } = require('./utils/errors');
const app = express();

app.disable('x-powered-by');
app.use(securityHeaders);

// 백업 복원(import)은 큰 JSON 본문을 받는다. 전역 파서가 먼저 실행되므로
// 라우트별 limit 설정은 무효가 된다. 전역에서 한도를 올려 통일한다.
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(csrfGuard);
// 감사 컨텍스트는 라우트 앞에 둔다. csrfGuard 에서 거부된 요청은 쓰기가 없으므로
// 그 뒤에 두어 action_id 를 낭비하지 않는다.
// 트리거가 읽을 컨텍스트 테이블에 연결한다(#299). 마이그레이션이 먼저 돌아야 하므로
// db 를 require 한 뒤에 건다.
bindAuditDb(db);
app.use(auditContext);

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
app.use('/api/card-policies', require('./routes/cardPolicies'));
app.use('/api/accounts',     require('./routes/accounts'));
app.use('/api/audit',        require('./routes/audit'));
app.use('/api/card-products', require('./routes/cardProducts'));
app.use('/api/data-integrity', require('./routes/dataIntegrity'));

// 반복거래 따라잡기(#279). 기동 시 1회, 라우트 등록 뒤에 돈다.
//
// 이 앱은 사용자가 열 때만 프로세스가 산다 — 상시 구동 전제의 스케줄러는 이
// 배포 형태에서 동작하지 않는다. 실패해도 서버는 떠야 하므로 여기서 삼킨다.
// 결과는 /api/recurring-rules/catchup 으로 화면이 가져간다.
try {
  const summary = runCatchup(db);
  setLastCatchupSummary(summary);
  if (summary.created > 0 || summary.skipped > 0) {
    console.log(`[catchup] 생성 ${summary.created}건, 건너뜀 ${summary.skipped}건`);
  }
} catch (e) {
  // 기동을 막지 않는다. 다음 기동에서 같은 구간을 다시 시도한다.
  setLastCatchupSummary({ created: 0, skipped: 0, rules: 0, details: [], error: '반복거래 자동 생성에 실패했습니다.' });
  console.error('[catchup] 실패:', e.message);
}

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// FND-10(감사): 아래 SPA 폴백이 /api/* 를 예외 처리하지 않아, 오타 난 API
// 경로가 404 JSON이 아니라 200 + index.html을 반환했다. client/src/lib/api.js는
// res.ok만 보고 성공으로 간주하므로 HTML을 그대로 성공 응답처럼 처리했다.
// 등록된 API 라우트를 전부 통과했는데도 /api로 시작하면 여기서 확실히 404를 낸다.
app.use('/api', (_req, res) => res.status(404).json({ error: '요청한 주소를 찾을 수 없습니다.' }));

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

// #157(FND-12 후속): HTTP 테스트가 서버를 자식 프로세스로 띄우고 SIGTERM으로
// 죽이는데, 핸들러 없는 기본 SIGTERM은 process.exit()을 거치지 않고 즉시
// 종료돼 NODE_V8_COVERAGE가 커버리지를 디스크에 못 쓴다(src/routes/** 커버리지가
// 항상 0%로 보이던 원인). process.exit()을 명시적으로 호출해 정상 종료
// 경로를 타게 한다 — 프로덕션에서도 즉시 종료라는 동작 자체는 동일하다.
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
