const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const PORT = 34598; // 다른 테스트와 충돌 안 나게 임의 포트 사용
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
  // 기존 before 안에 있던 나머지 준비 작업은 이 아래에 그대로 남긴다
});

after(() => {
  if (server) server.stop();
});

test('dashboard aggregation - installmentsDue과 expense 이중 계산 방지 검증', async () => {
  // 1. 날짜 계산
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth()-2, 1);
  const twoMonthsAgoStr = `${twoMonthsAgo.getFullYear()}-${String(twoMonthsAgo.getMonth()+1).padStart(2,'0')}`;
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth()-12, 1);
  const twelveMonthsAgoStr = `${twelveMonthsAgo.getFullYear()}-${String(twelveMonthsAgo.getMonth()+1).padStart(2,'0')}`;

  // 2. 카테고리 확보
  const categoriesResp = await fetch(`${BASE}/api/categories`);
  assert.strictEqual(categoriesResp.status, 200);
  const categories = await categoriesResp.json();
  const expenseCategoryId = categories.find(c => c.major_type !== '수입').id;

  // 3. 활성 할부 생성
  const activeInstallment = {
    purchase_date: `${twoMonthsAgoStr}-01`,
    merchant: '활성할부',
    total_amount: 300000,
    months: 6,
    monthly_amount: 50000,
    start_billing_month: twoMonthsAgoStr
  };
  const createActiveResp = await fetch(`${BASE}/api/installments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(activeInstallment)
  });
  assert.strictEqual(createActiveResp.status, 201);

  // 4. 종료된 할부 생성 (이중 계산 방지 검증 핵심)
  const expiredInstallment = {
    purchase_date: `${twelveMonthsAgoStr}-01`,
    merchant: '종료된할부',
    total_amount: 300000,
    months: 3,
    monthly_amount: 99999,
    start_billing_month: twelveMonthsAgoStr
  };
  const createExpiredResp = await fetch(`${BASE}/api/installments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(expiredInstallment)
  });
  assert.strictEqual(createExpiredResp.status, 201);

  // 5. 할부 결제방식 거래 생성 (이중 계산 방지 검증)
  const installmentTransaction = {
    date: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`,
    category_id: expenseCategoryId,
    amount: 77777,
    merchant: '할부거래',
    payment_style: '할부'
  };
  const createInstallmentTxResp = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(installmentTransaction)
  });
  assert.strictEqual(createInstallmentTxResp.status, 201);

  // 6. 일반 거래 생성
  const normalTransaction = {
    date: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`,
    category_id: expenseCategoryId,
    amount: 10000,
    merchant: '일반거래'
  };
  const createNormalTxResp = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalTransaction)
  });
  assert.strictEqual(createNormalTxResp.status, 201);

  // 7. 집계 조회 및 검증
  const dashboardResp = await fetch(`${BASE}/api/transactions/summary/dashboard`);
  assert.strictEqual(dashboardResp.status, 200);
  const result = await dashboardResp.json();
  
  // installmentsDue는 활성 할부(50000)만 포함되어야 함. 종료된 할부(99999)는 제외.
  assert.strictEqual(result.installmentsDue, 50000);
  
  // expense는 일반 거래(10000)만 포함되어야 함. 할부 거래(77777)는 제외.
  assert.strictEqual(result.expense, 10000);
});
