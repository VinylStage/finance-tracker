const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const PORT = 34599; // 다른 테스트와 충돌 안 나게 임의 포트 사용
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
  // 기존 before 안에 있던 나머지 준비 작업은 이 아래에 그대로 남긴다
});

after(() => {
  if (server) server.stop();
});

test('backup roundtrip export/import 동등성', async () => {
  // 1. 카테고리 목록 가져오기
  const categoriesResp = await fetch(`${BASE}/api/categories`);
  assert.strictEqual(categoriesResp.status, 200);
  const categories = await categoriesResp.json();
  const categoryId = categories[0].id;

  // 2. 거래 생성
  const transaction = {
    date: '2026-01-15',
    category_id: categoryId,
    amount: 12345,
    merchant: '테스트가맹점',
    memo: '왕복테스트'
  };
  const createResp = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(transaction)
  });
  assert.strictEqual(createResp.status, 201);

  // 3. 첫 번째 export
  const exportOnceResp = await fetch(`${BASE}/api/data/export`);
  assert.strictEqual(exportOnceResp.status, 200);
  const exportedOnce = await exportOnceResp.json();
  assert.strictEqual(exportedOnce.transactions.length, 1);
  assert.strictEqual(exportedOnce.transactions[0].date, transaction.date);
  assert.strictEqual(exportedOnce.transactions[0].merchant, transaction.merchant);
  assert.strictEqual(exportedOnce.transactions[0].amount, transaction.amount);
  assert.strictEqual(exportedOnce.transactions[0].memo, transaction.memo);

  // 4. import
  const importResp = await fetch(`${BASE}/api/data/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'overwrite',
      confirm: 'DELETE_ALL',
      transactions: exportedOnce.transactions
    })
  });
  const importResult = await importResp.json();
  assert.deepStrictEqual(importResult, { ok: true, imported: 1, skipped: 0, deleted: 1, total: 1 });

  // 5. 두 번째 export
  const exportTwiceResp = await fetch(`${BASE}/api/data/export`);
  assert.strictEqual(exportTwiceResp.status, 200);
  const exportedTwice = await exportTwiceResp.json();

  // 6. 핵심 검증
  const t1 = exportedOnce.transactions[0];
  const t2 = exportedTwice.transactions[0];
  assert.strictEqual(t1.date, t2.date);
  assert.strictEqual(t1.merchant, t2.merchant);
  assert.strictEqual(t1.amount, t2.amount);
  assert.strictEqual(t1.category_id, t2.category_id);
  assert.strictEqual(t1.category_name, t2.category_name);
  assert.strictEqual(t1.memo, t2.memo);
  assert.strictEqual(t1.payment_style, t2.payment_style);
  // created_at은 복원되므로 같은 값이어야 함
  assert.strictEqual(t1.created_at, t2.created_at);
});
