const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

// FND-20(감사): installments.js가 SQL의 strftime(...,'now')(UTC)로 현재 연/월을
// 구해 remaining_months/billed_months를 계산했다. 이제는 JS(localYearMonth,
// 로컬 타임존 기준)에서 계산한 값을 SQL에 바인딩한다. 그 경계 자체는
// test/date.test.js의 localYearMonth 유닛테스트가 확인하고, 여기서는 리팩터링
// 후에도 실제 HTTP+DB 경로에서 경과월 산술이 여전히 정확한지 확인한다.

const PORT = 34587; // 다른 테스트와 충돌 안 나게 임의 포트 사용
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
  // 기존 before 안에 있던 나머지 준비 작업은 이 아래에 그대로 남긴다
});

after(() => {
  if (server) server.stop();
});

test('FND-20: remaining_months/billed_months가 bind 파라미터 방식으로 바뀐 뒤에도 정확함', async () => {
  const now = new Date();
  const ym = (y, m) => `${y}-${String(m).padStart(2, '0')}`;

  // 이번 달에 시작한 할부: 첫 청구월이므로 1개월 청구, 5개월 남음
  const thisMonthStart = ym(now.getFullYear(), now.getMonth() + 1);
  const r1 = await fetch(`${BASE}/api/installments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      purchase_date: `${thisMonthStart}-01`, merchant: '이번달시작',
      total_amount: 600000, months: 6, monthly_amount: 100000,
      start_billing_month: thisMonthStart,
    }),
  });
  assert.strictEqual(r1.status, 201);

  // 3개월 전에 시작한 할부: 이번 달까지 4개월째 청구, 2개월 남음
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const threeMonthsAgoStart = ym(threeMonthsAgo.getFullYear(), threeMonthsAgo.getMonth() + 1);
  const r2 = await fetch(`${BASE}/api/installments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      purchase_date: `${threeMonthsAgoStart}-01`, merchant: '3개월전시작',
      total_amount: 600000, months: 6, monthly_amount: 100000,
      start_billing_month: threeMonthsAgoStart,
    }),
  });
  assert.strictEqual(r2.status, 201);

  const listResp = await fetch(`${BASE}/api/installments`);
  assert.strictEqual(listResp.status, 200);
  const { data } = await listResp.json();

  const thisMonthRow = data.find(i => i.merchant === '이번달시작');
  assert.strictEqual(thisMonthRow.billed_months, 1);
  assert.strictEqual(thisMonthRow.remaining_months, 5);

  const threeMonthsAgoRow = data.find(i => i.merchant === '3개월전시작');
  assert.strictEqual(threeMonthsAgoRow.billed_months, 4);
  assert.strictEqual(threeMonthsAgoRow.remaining_months, 2);
});

test('#121: 청구 기간이 끝난 진행중 할부는 GET 시점에 자동으로 완료 처리됨', async () => {
  // 2년 전에 시작해서 3개월짜리라 이미 한참 끝났어야 하는 할부
  const createResp = await fetch(`${BASE}/api/installments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      purchase_date: '2024-01-01', merchant: '오래전종료된할부',
      total_amount: 300000, months: 3, monthly_amount: 100000,
      start_billing_month: '2024-01',
    }),
  });
  assert.strictEqual(createResp.status, 201);
  const { id } = await createResp.json();

  // GET 핸들러가 응답을 만들기 전에 매번 자가교정하므로, 최초 GET 호출만으로도
  // 이미 완료 처리돼 있어야 한다.
  const afterList = await (await fetch(`${BASE}/api/installments`)).json();
  const updated = afterList.data.find(i => i.id === id);
  assert.strictEqual(updated.status, '완료', '청구 기간이 끝난 진행중 할부는 자동으로 완료 처리돼야 함');

  // status=진행중 필터에는 더 이상 나타나지 않아야 함
  const stillActiveList = await (await fetch(`${BASE}/api/installments?status=진행중`)).json();
  assert.ok(!stillActiveList.data.some(i => i.id === id), '완료 처리된 할부는 진행중 필터에서 빠져야 함');
});
