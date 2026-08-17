'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const PORT = 20717;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

async function api(method, url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* JSON 이 아닐 수 있다 */ }
  return { status: res.status, body: json, text };
}

let pmId;
let seq = 0;

async function makeCardId(over = {}) {
  seq += 1;
  const res = await api('POST', '/api/card-products', {
    payment_method_id: pmId, issuer: '테스트카드사',
    product_name: `상품${seq}`, card_type: '신용', ...over,
  });
  assert.equal(res.status, 201, `카드 생성 실패: ${res.text}`);
  return res.body.id;
}

// 정액구간형 규칙. 전월 30만 이상이면 3,000원, 60만 이상이면 7,000원.
const FLAT = {
  kind: 'flat_monthly',
  tiers: [
    { min_spend: 300000, amount: 3000, label: null },
    { min_spend: 600000, amount: 7000, label: '상위 구간' },
  ],
};


// 전월 날짜 하나. 실적 판정이 지난달 지출을 본다.
function prevMonthDate() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  d.setDate(15);
  return d.toISOString().slice(0, 10);
}

// 지출 카테고리 id. **번호를 찍어 쓰지 않는다** — 1번이 수입이면 실적에 안 잡혀
// 테스트가 «규칙이 안 걸린다» 로 보인다. 실제 목록에서 지출인 것을 고른다.
let expenseCatId;
async function expenseCategory() {
  if (expenseCatId) return expenseCatId;
  const res = await api('GET', '/api/categories');
  const rows = Array.isArray(res.body) ? res.body : res.body.data;
  const cat = rows.find((c) => c.major_type !== '수입');
  assert.ok(cat, '지출 카테고리가 없다');
  expenseCatId = cat.id;
  return expenseCatId;
}

// 그 카드로 전월에 amount 만큼 쓴 것으로 만든다.
async function spendPrevMonth(cardId, amount) {
  const res = await api('POST', '/api/transactions', {
    date: prevMonthDate(),
    amount,
    merchant: '테스트상점',
    payment_method_id: pmId,
    card_product_id: cardId,
    payment_style: '일시불',
    category_id: await expenseCategory(),
  });
  assert.equal(res.status, 201, `거래 생성 실패: ${res.text}`);
}

// 그 카드의 전략 응답 한 장.
async function cardOf(cardId) {
  // **경로가 `/detail` 이다.** `/api/card-strategy` 루트에는 라우트가 없어 404 가 온다.
  const res = await api('GET', '/api/card-strategy/detail');
  assert.equal(res.status, 200, res.text);
  const found = (res.body.data || []).find((c) => c.cardProductId === cardId);
  assert.ok(found, `카드 ${cardId} 가 응답에 없다`);
  return found;
}

before(async () => {
  server = await startTestServer({ port: PORT });
  const pms = await api('GET', '/api/payment-methods');
  const rows = Array.isArray(pms.body) ? pms.body : pms.body.data;
  pmId = rows[0].id;
});

after(() => {
  if (server) server.stop();
});

test('1. 혜택이 없으면 두 칸이 비어 있다', async () => {
  const cardId = await makeCardId();
  const c = await cardOf(cardId);
  assert.deepEqual(c.monthlyLines, []);
  assert.equal(c.monthlyTotal, 0);
});

test('2. 요율형만 있으면 두 칸이 비어 있다', async () => {
  const cardId = await makeCardId();
  const res = await api('POST', '/api/card-benefits', {
    card_product_id: cardId,
    benefit_type: '할인',
    rate: 1.5,
  });
  assert.equal(res.status, 201);
  
  const c = await cardOf(cardId);
  assert.deepEqual(c.monthlyLines, []);
  assert.equal(c.monthlyTotal, 0);
});

test('3. 정액구간형이 있으면 줄이 잡힌다', async () => {
  const cardId = await makeCardId();
  const res = await api('POST', '/api/card-benefits', {
    card_product_id: cardId,
    benefit_type: '할인',
    rate: 0,
    rule_json: JSON.stringify(FLAT),
  });
  assert.equal(res.status, 201);
  const benefitId = res.body.id;
  
  // 실적이 있어야 구간에 든다. 없으면 0 원이라 줄이 안 잡힌다(4번이 그 경우다).
  await spendPrevMonth(cardId, 350000);

  const c = await cardOf(cardId);
  assert.equal(c.monthlyLines.length, 1);
  assert.equal(c.monthlyLines[0].benefitId, benefitId);
});

test('4. 실적이 없으면 0 이라 줄이 안 잡힌다', async () => {
  const cardId = await makeCardId();
  const res = await api('POST', '/api/card-benefits', {
    card_product_id: cardId,
    benefit_type: '할인',
    rate: 0,
    rule_json: JSON.stringify(FLAT),
  });
  assert.equal(res.status, 201);
  
  const c = await cardOf(cardId);
  assert.deepEqual(c.monthlyLines, []);
  assert.equal(c.monthlyTotal, 0);
});

test('5. 구간이 오르면 금액이 오른다', async () => {
  const cardId = await makeCardId();
  const res = await api('POST', '/api/card-benefits', {
    card_product_id: cardId,
    benefit_type: '할인',
    rate: 0,
    rule_json: JSON.stringify(FLAT),
  });
  assert.equal(res.status, 201);
  const benefitId = res.body.id;
  
  await spendPrevMonth(cardId, 700000);
  
  const c = await cardOf(cardId);
  assert.equal(c.monthlyTotal, 7000);
});

test('6. 여러 줄이면 합이 맞는다', async () => {
  const cardId = await makeCardId();
  const res1 = await api('POST', '/api/card-benefits', {
    card_product_id: cardId,
    benefit_type: '할인',
    rate: 0,
    rule_json: JSON.stringify(FLAT),
  });
  assert.equal(res1.status, 201);
  const benefitId1 = res1.body.id;
  
  const res2 = await api('POST', '/api/card-benefits', {
    card_product_id: cardId,
    benefit_type: '할인',
    rate: 0,
    rule_json: JSON.stringify(FLAT),
  });
  assert.equal(res2.status, 201);
  const benefitId2 = res2.body.id;
  
  await spendPrevMonth(cardId, 400000);
  
  const c = await cardOf(cardId);
  assert.equal(c.monthlyLines.length, 2);
  assert.equal(c.monthlyTotal, 6000);
});

test('7. 거래별 계산에는 안 섞인다', async () => {
  const cardId = await makeCardId();
  const res = await api('POST', '/api/card-benefits', {
    card_product_id: cardId,
    benefit_type: '할인',
    rate: 0,
    rule_json: JSON.stringify(FLAT),
  });
  assert.equal(res.status, 201);
  const benefitId = res.body.id;
  
  await spendPrevMonth(cardId, 400000);
  
  const c = await cardOf(cardId);
  const b = c.benefits.find((x) => x.id === benefitId);
  assert.equal(b.rate, 0);
});

// 실적을 못 채우면 정액도 안 붙는다.
//
// 구간 조건(30만)은 넘겼는데 카드 자체의 전월 실적 조건(100만)을 못 채운 상태다.
// 이 둘은 다른 판정이라, 구간만 보고 주면 «실적을 못 채웠는데 정액은 들어온다» 가
// 된다. 요율형이 실적 미달에서 죽는 것과 같은 규칙을 쓴다.
test('8. 카드 실적을 못 채우면 정액이 안 붙는다', async () => {
  const cardId = await makeCardId({ prev_month_threshold: 1000000 });
  const res = await api('POST', '/api/card-benefits', {
    card_product_id: cardId,
    benefit_type: '할인',
    rate: 0,
    rule_json: JSON.stringify(FLAT),
  });
  assert.equal(res.status, 201, res.text);

  // 구간(30만)은 넘지만 카드 실적(100만)에는 한참 모자란 금액이다.
  await spendPrevMonth(cardId, 350000);

  const c = await cardOf(cardId);
  assert.equal(c.threshold.met, false, '이 카드는 실적 미달이어야 한다');
  assert.deepEqual(c.monthlyLines, []);
  assert.equal(c.monthlyTotal, 0);
});
