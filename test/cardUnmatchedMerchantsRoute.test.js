'use strict';

// `/api/card-strategy/detail` 의 「혜택이 모르는 가맹점」 칸(#688).
//
// 순수 계산은 `cardUnmatchedMerchants.test.js` 가 못박는다. 여기서 보는 것은
// **라우트가 그 계산에 무엇을 먹이는가** 다 — 어느 거래를 카드에 붙이고,
// 무엇을 애초에 빼고, 기간을 자르는가.
//
// 이 자리에서 조용히 틀리기 쉽다. 거래를 잘못 걸러도 목록은 그럴듯하게 나오고,
// 「혜택이 붙지 않은 가맹점 N곳」 이라는 숫자만 살짝 달라진다.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const PORT = 21639;
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
let expenseCatId;
let incomeCatId;
let seq = 0;

async function makeCardId() {
  seq += 1;
  const res = await api('POST', '/api/card-products', {
    payment_method_id: pmId, issuer: '테스트카드사',
    product_name: `상품${seq}`, card_type: '신용',
  });
  assert.equal(res.status, 201, `카드 생성 실패: ${res.text}`);
  return res.body.id;
}

async function addBenefit(cardId, over = {}) {
  const res = await api('POST', '/api/card-benefits', {
    card_product_id: cardId, benefit_type: '적립', rate: 10, ...over,
  });
  assert.equal(res.status, 201, `혜택 생성 실패: ${res.text}`);
  return res.body.id;
}

async function spend(cardId, merchant, amount, over = {}) {
  const res = await api('POST', '/api/transactions', {
    date: '2026-05-04', amount, merchant,
    payment_method_id: pmId, card_product_id: cardId,
    payment_style: '일시불', category_id: expenseCatId, ...over,
  });
  assert.equal(res.status, 201, `거래 생성 실패: ${res.text}`);
  return res.body.id;
}

async function unmatchedOf(cardId) {
  const res = await api('GET', '/api/card-strategy/detail');
  assert.equal(res.status, 200, res.text);
  const card = (res.body.data || []).find((c) => c.cardProductId === cardId);
  assert.ok(card, `카드 ${cardId} 가 응답에 없다`);
  return card.unmatched;
}

before(async () => {
  server = await startTestServer({ port: PORT });
  const pms = await api('GET', '/api/payment-methods');
  pmId = (Array.isArray(pms.body) ? pms.body : pms.body.data)[0].id;

  const cats = await api('GET', '/api/categories');
  const rows = Array.isArray(cats.body) ? cats.body : cats.body.data;
  // **번호를 찍어 쓰지 않는다.** 1번이 수입이면 진단이 «수입도 세는가» 를
  // 확인하는 것이 아니라 그냥 안 세게 되어 테스트가 통과한 척한다.
  expenseCatId = rows.find((c) => c.major_type !== '수입').id;
  incomeCatId = rows.find((c) => c.major_type === '수입').id;
  assert.ok(expenseCatId && incomeCatId, '지출·수입 분류가 둘 다 필요하다');
});

after(() => {
  // 단언이 던져도 자식을 죽인다. 살아남으면 러너가 상한까지 붙잡힌다(#602).
  if (server) server.stop();
});

test('영문 패턴만 등록된 카드에서 한글 표기 결제가 잡힌다', async () => {
  const cardId = await makeCardId();
  await addBenefit(cardId, { merchant_pattern: 'CU' });
  await spend(cardId, 'CU◯◯점', 2200);
  await spend(cardId, '씨유◯◯점', 8210);

  const u = await unmatchedOf(cardId);
  assert.equal(u.count, 1);
  assert.equal(u.amount, 8210);
  assert.deepEqual(u.merchants, [{ merchant: '씨유◯◯점', count: 1, amount: 8210 }]);
});

test('수입은 세지 않는다 — 카드 혜택 대상이 아니다', async () => {
  const cardId = await makeCardId();
  await addBenefit(cardId, { merchant_pattern: 'CU' });
  await spend(cardId, '월급', 3000000, { category_id: incomeCatId });

  const u = await unmatchedOf(cardId);
  assert.equal(u.count, 0, '수입이 「혜택이 붙지 않은 가맹점」 으로 세어지면 안 된다');
});

test('다른 카드의 결제가 섞이지 않는다', async () => {
  const mine = await makeCardId();
  const other = await makeCardId();
  await addBenefit(mine, { merchant_pattern: 'CU' });
  await addBenefit(other, { merchant_pattern: 'CU' });
  await spend(other, '남의카드가게', 5000);

  assert.equal((await unmatchedOf(mine)).count, 0);
  assert.equal((await unmatchedOf(other)).count, 1);
});

test('기간을 자르지 않는다 — 빈도로 읽는 값이라 오래된 결제도 센다', async () => {
  const cardId = await makeCardId();
  await addBenefit(cardId, { merchant_pattern: 'CU' });
  // 기본 비교 구간(최근 3개월) 밖이다. 그 구간으로 잘리면 0건이 된다.
  await spend(cardId, '오래된가게', 7000, { date: '2020-01-15' });

  const u = await unmatchedOf(cardId);
  assert.equal(u.count, 1, '오래된 결제가 빠지면 고칠 것이 목록에서 사라진다');
});

test('전 가맹점 혜택이 있는 카드는 빈다 — 그 줄이 모든 결제를 가리킨다', async () => {
  const cardId = await makeCardId();
  await addBenefit(cardId, { merchant_pattern: 'CU' });
  await addBenefit(cardId, { rate: 0.5 });
  await spend(cardId, '씨유◯◯점', 8210);

  assert.equal((await unmatchedOf(cardId)).count, 0);
});

test('혜택이 없는 카드는 빈다 — 「규칙이 없다」 이지 「못 찾았다」 가 아니다', async () => {
  const cardId = await makeCardId();
  await spend(cardId, '아무데나', 1000);

  assert.equal((await unmatchedOf(cardId)).count, 0);
});
