const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// FND-02(감사): 화면(Transactions.jsx)이 최대 5000건을 요청해도 서버가
// 500건으로 잘라(total은 정확했지만 화면이 안 씀) 검색·월별합계·연도탭이
// 최신 500건 범위 안에서만 맞았다. 검색·집계를 서버 파라미터로 전부 넘기는
// 근본 해결(감사 A안) 후, 새 엔드포인트/파라미터가 정확한지 확인한다.

const PORT = 34585; // 다른 테스트와 충돌 안 나게 임의 포트 사용
const BASE = `http://127.0.0.1:${PORT}`;
let server;
let dbPath;

let serverOutput = '';

before(async () => {
  server = await startTestServer({ port: PORT });
  dbPath = server.dbPath;
});

after(() => {
  if (server) server.stop();
});

test('FND-02: 감사 PoC — 501건 중 가장 오래된 1건도 연도목록/검색/월별합계에서 정상 반영됨', async () => {
  const categoriesResp = await fetch(`${BASE}/api/categories`);
  const categories = await categoriesResp.json();
  const expCat = categories.find(c => c.major_type !== '수입').id;

  // 최근 500건(필러) + 아주 오래된 식별 가능한 1건 = 총 501건
  const fillerRequests = [];
  for (let i = 0; i < 500; i++) {
    const day = (i % 27) + 1;
    const month = (Math.floor(i / 27) % 12) + 1;
    const date = `2025-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    fillerRequests.push(fetch(`${BASE}/api/transactions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, category_id: expCat, amount: 1000, merchant: '필러' }),
    }));
  }
  await Promise.all(fillerRequests);

  const markerResp = await fetch(`${BASE}/api/transactions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: '2020-01-15', category_id: expCat, amount: 55555, merchant: '감사마커' }),
  });
  assert.strictEqual(markerResp.status, 201);

  // 전제조건 확인: 감사가 지적한 구버전 방식(최신순 상위 500건만 봄)으로는
  // 마커가 전혀 안 보인다 — 즉 이 테스트가 실제로 501건짜리 상황을 만들었다.
  const oldStyleResp = await fetch(`${BASE}/api/transactions?limit=500`);
  const oldStyle = await oldStyleResp.json();
  assert.strictEqual(oldStyle.total, 501);
  assert.ok(!oldStyle.data.some(t => t.merchant === '감사마커'), '전제조건: 마커가 최신 500건 밖에 있어야 함');

  // 연도 목록 — 501번째로 오래된 거래의 연도(2020)도 빠지면 안 됨
  const yearsResp = await fetch(`${BASE}/api/transactions/years`);
  const years = (await yearsResp.json()).data;
  assert.ok(years.includes('2020'), '연도 목록에 오래된 연도가 빠짐');

  // 검색 — merchant 필터가 서버 파라미터로 전달되면 500건 제한과 무관하게 찾아야 함
  const searchResp = await fetch(`${BASE}/api/transactions?merchant=${encodeURIComponent('감사마커')}`);
  const search = await searchResp.json();
  assert.strictEqual(search.total, 1);
  assert.strictEqual(search.data[0].merchant, '감사마커');

  // 월별 합계 — 2020년 1월 요약에 마커 거래가 정상 반영돼야 함(500건 제한과 무관)
  const byMonthResp = await fetch(`${BASE}/api/transactions/summary/by-month?year=2020`);
  const byMonth = (await byMonthResp.json()).data;
  const jan2020 = byMonth.find(m => m.month === '2020-01');
  assert.ok(jan2020, '2020년 1월 요약이 존재해야 함');
  assert.strictEqual(jan2020.expense, 55555);
  assert.strictEqual(jan2020.count, 1);
});

test('FND-02: GET /api/transactions — merchant/memo/min_amount/max_amount/payment_method_id 필터', async () => {
  const categoriesResp = await fetch(`${BASE}/api/categories`);
  const categories = await categoriesResp.json();
  const expCat = categories.find(c => c.major_type !== '수입').id;

  const pmResp = await fetch(`${BASE}/api/payment-methods`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'FND02테스트카드', type: '신용카드' }),
  });
  const pm = await pmResp.json();

  await fetch(`${BASE}/api/transactions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date: '2021-06-01', category_id: expCat, amount: 99000,
      merchant: '필터검증상점', memo: '특이메모', payment_method_id: pm.id,
    }),
  });

  const byMerchant = await (await fetch(`${BASE}/api/transactions?merchant=${encodeURIComponent('필터검증')}`)).json();
  assert.strictEqual(byMerchant.total, 1);

  const byMemo = await (await fetch(`${BASE}/api/transactions?memo=${encodeURIComponent('특이메모')}`)).json();
  assert.strictEqual(byMemo.total, 1);

  const byMinAmount = await (await fetch(`${BASE}/api/transactions?min_amount=99000`)).json();
  assert.ok(byMinAmount.data.some(t => t.merchant === '필터검증상점'));

  const byMaxAmountTooLow = await (await fetch(`${BASE}/api/transactions?merchant=${encodeURIComponent('필터검증')}&max_amount=1000`)).json();
  assert.strictEqual(byMaxAmountTooLow.total, 0);

  const byPaymentMethod = await (await fetch(`${BASE}/api/transactions?payment_method_id=${pm.id}`)).json();
  assert.strictEqual(byPaymentMethod.total, 1);
  assert.strictEqual(byPaymentMethod.data[0].merchant, '필터검증상점');
});

test('FND-02: GET /api/transactions?category_id=a,b — 다중 카테고리 필터', async () => {
  const categories = await (await fetch(`${BASE}/api/categories`)).json();
  const [c1, c2] = categories.filter(c => c.major_type !== '수입');

  await fetch(`${BASE}/api/transactions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: '2021-07-01', category_id: c1.id, amount: 1234, merchant: '다중카테고리A' }),
  });
  await fetch(`${BASE}/api/transactions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: '2021-07-02', category_id: c2.id, amount: 5678, merchant: '다중카테고리B' }),
  });

  const resp = await fetch(`${BASE}/api/transactions?category_id=${c1.id},${c2.id}&merchant=${encodeURIComponent('다중카테고리')}`);
  const body = await resp.json();
  assert.strictEqual(body.total, 2);
});

test('FND-02: GET /api/transactions/summary/by-month — year 형식 아니면 400', async () => {
  const resp = await fetch(`${BASE}/api/transactions/summary/by-month?year=notayear`);
  assert.strictEqual(resp.status, 400);
});
