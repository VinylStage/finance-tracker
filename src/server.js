'use strict';
const express = require('express');
const path = require('path');
const { csrfGuard } = require('./utils/csrfGuard');
const { securityHeaders } = require('./utils/securityHeaders');
const { auditContext, bindAuditDb } = require('./utils/auditContext');
const db = require('./db/init');
const { runCatchup, setLastCatchupSummary } = require('./services/recurringCatchup');
const { purgeAuditLog, setLastPurgeSummary } = require('./services/auditRetention');
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
app.use('/api/audit',        require('./routes/audit'));
app.use('/api/card-products', require('./routes/cardProducts'));
app.use('/api/card-benefits', require('./routes/cardBenefits'));
app.use('/api/card-strategy', require('./routes/cardStrategy'));
app.use('/api/data-integrity', require('./routes/dataIntegrity'));

// 감사로그 정리(#367). 기동 시 1회, **catch-up 보다 먼저** 돈다.
//
// 순서가 중요하다. 정리는 보존 기간이 지난 행만 지우므로 catch-up 이 방금 만든
// 로그는 어차피 대상이 아니지만, 순서를 뒤집으면 "같은 기동에서 만든 것을
// 지울 수도 있다" 는 걱정을 코드로 배제할 수 없다. 먼저 돌려 그 여지를 없앤다.
//
// 사전 확인 없이 돌리되 결과를 알린다 — ADR 0008 의 #279 경계 사례와 같은
// 형태다. 실패해도 서버는 떠야 한다.
try {
  const purge = purgeAuditLog(db);
  setLastPurgeSummary(purge);
  if (purge.deleted > 0) {
    console.log(`[audit-retention] ${purge.days}일 지난 감사로그 ${purge.deleted}건 정리 (기준 ${purge.cutoff})`);
  }
} catch (e) {
  setLastPurgeSummary({ deleted: 0, cutoff: null, days: 0, ran: false, error: '감사로그 정리에 실패했습니다.' });
  console.error('[audit-retention] 실패:', e.message);
}

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
const server = app.listen(PORT, HOST);

// 기동 로그는 `listening` 이벤트에서 찍는다(#583).
//
// `app.listen(port, host, cb)` 의 콜백은 **바인딩에 실패해도 불린다.** 그래서
// 포트가 물린 상태에서도 «기동 성공» 이 찍혔다. `listening` 은 실제로 붙었을 때만
// 나므로 거짓 성공이 안 남는다.
server.on('listening', () => {
  if (HOST === '0.0.0.0' || HOST === '::') {
    console.log(`[server] http://${HOST}:${PORT} (모든 인터페이스에 노출됨)`);
  } else {
    console.log(`[server] http://${HOST}:${PORT}`);
  }
});

// 리스닝 실패를 실패로 알린다(#583).
//
// **express 는 이걸 안 해 주면 조용히 넘어간다.** 이미 쓰이는 포트로 띄우면
// 바인딩에 실패했는데도 위 콜백이 불려 «기동 성공» 이 찍히고, stderr 는 비고,
// 종료코드는 0 이다. 실측으로 갈랐다 — 같은 상황에서 `node:http` 를 직접 쓰면
// `error` 이벤트에 리스너가 없어 던지고 프로세스가 1 로 죽는다.
//
// 종료코드를 1 로 두는 것이 핵심이다. 0 이면 지금과 똑같이 «스스로 정상 종료» 로
// 보이고, 테스트 하네스가 `code=0 signal=null` 만 받아 원인을 못 가린다(#379).
//
// SIGTERM 핸들러의 `process.exit(0)`(#157, 커버리지 때문)과는 다른 경로다.
server.on('error', (e) => {
  console.error(`[server] 리스닝 실패: ${e.code || e.message} (${HOST}:${PORT})`);
  process.exit(1);
});

// #157(FND-12 후속): HTTP 테스트가 서버를 자식 프로세스로 띄우고 SIGTERM으로
// 죽이는데, 핸들러 없는 기본 SIGTERM은 process.exit()을 거치지 않고 즉시
// 종료돼 NODE_V8_COVERAGE가 커버리지를 디스크에 못 쓴다(src/routes/** 커버리지가
// 항상 0%로 보이던 원인). process.exit()을 명시적으로 호출해 정상 종료
// 경로를 타게 한다 — 프로덕션에서도 즉시 종료라는 동작 자체는 동일하다.
//
// 다만 `process.exit(0)` 은 **왜 죽었는지를 지운다.** 부모가 보는 것은
// `code=0 signal=null` 뿐이라, 밖에서 SIGTERM 을 맞은 것과 스스로 정상 종료한
// 것이 구분되지 않는다(#379). 실제로 CI 실패 하나를 «서버가 자발적으로 나갔다»
// 로 읽을 뻔했다.
//
// 그래서 나가기 직전에 원인을 stderr 로 남긴다. 테스트 하네스가 자식의 stdout·
// stderr 를 모아 실패 메시지에 싣고 있으므로, 이 한 줄이 그대로 조사 근거가 된다.
// 종료 경로 자체는 안 바꾼다 — 바꾸면 위 커버리지 문제가 되돌아온다.
function exitOnSignal(signal) {
  console.error(`[server] ${signal} 을 받아 종료합니다. 이 프로세스는 스스로 끝난 것이 아닙니다.`);
  process.exit(0);
}

process.on('SIGTERM', () => exitOnSignal('SIGTERM'));
process.on('SIGINT', () => exitOnSignal('SIGINT'));
