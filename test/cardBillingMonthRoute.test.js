'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const PORT = 21647;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

async function api(method, url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* JSON 이 아닐 수 있다 */ }
  return { status: res.status, body: json, text };
}

let pmId;      // 숫자. 결제수단 id
let seq = 0;

// 카드 상품을 만든다. cycle·close 는 숫자 또는 null.
async function makeCard(cycle, close, over = {}) {
  seq += 1;
  const res = await api('POST', '/api/card-products', {
    payment_method_id: pmId,
    issuer: '테스트카드사',
    product_name: `상품${seq}`,
    card_type: '신용',
    billing_cycle_day: cycle,
    statement_close_day: close,
    ...over,
  });
  assert.equal(res.status, 201, res.text);
  return res.body.id;   // 숫자
}

// 그 엔드포인트를 부른다. pmId 를 안 주면 payment_method_id 를 안 싣는다.
async function ask(purchaseDate, paymentMethodId) {
  const qs = new URLSearchParams({ purchase_date: purchaseDate });
  if (paymentMethodId !== undefined) qs.set('payment_method_id', String(paymentMethodId));
  return api('GET', `/api/card-products/billing-month?${qs}`);
}

before(async () => {
  server = await startTestServer({ port: PORT });
  const pms = await api('GET', '/api/payment-methods');
  const rows = Array.isArray(pms.body) ? pms.body : pms.body.data;
  pmId = rows[0].id;
});

after(() => {
  // 단언이 던져도 자식을 죽인다. 살아남으면 러너가 상한까지 붙잡힌다.
  if (server) server.stop();
});

// 아래 둘은 **상태코드가 같다.** 그래서 무엇을 말하는지까지 본다.
//
// 돌연변이로 드러났다 — 「구매일이 없다」 가드를 통째로 지워도 9건이 전부
// 통과했다. `undefined` 가 형식 검사에 걸려 **어차피 400** 이 나오기 때문이다.
// 상태코드만 보면 두 가드가 구분되지 않고, 그러면 사용자가 「지정해 주세요」
// 대신 「형식이어야 합니다」 를 듣게 되는 회귀를 아무도 못 잡는다.

test('구매일을 안 주면 400 이고, 형식이 아니라 **없다**고 말한다.', async () => {
  const res = await api('GET', '/api/card-products/billing-month');
  assert.equal(res.status, 400);
  assert.match(res.body.error, /지정해 주세요/);
  assert.doesNotMatch(res.body.error, /형식/,
    '없는 것과 형식이 틀린 것은 사용자가 할 일이 다르다');
});

test('구매일 형식이 틀리면 400 이고, **형식**을 말한다.', async () => {
  const res1 = await ask('2026-7-1');
  assert.equal(res1.status, 400);
  assert.match(res1.body.error, /YYYY-MM-DD/);

  const res2 = await ask('20260701');
  assert.equal(res2.status, 400);
  assert.match(res2.body.error, /YYYY-MM-DD/);
});

test('결제수단을 안 주면 구매일의 달로 폴백하고 resolved 가 false 다.', async () => {
  const res = await ask('2026-07-28');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.billing_month, '2026-07');
  assert.equal(res.body.data.resolved, false);
  assert.equal(res.body.data.card_product, null);
});

test('주기를 아는 카드 한 장이면 청구월을 계산하고 resolved 가 true 다.', async () => {
  await makeCard(14, 25);
  const res = await ask('2026-07-28', pmId);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.billing_month, '2026-09');
  assert.equal(res.body.data.resolved, true);
  assert.equal(res.body.data.ambiguous, false);
  assert.ok(res.body.data.card_product.product_name);
});

test('마감일을 안 넘기면 한 달 앞이다.', async () => {
  const res = await ask('2026-07-20', pmId);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.billing_month, '2026-08');
  assert.equal(res.body.data.resolved, true);
});

test('연말을 넘어가면 해가 바뀐다.', async () => {
  const res = await ask('2026-12-28', pmId);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.billing_month, '2027-02');
});

test('주기가 같은 카드가 둘이면 애매하지 않다.', async () => {
  await makeCard(14, 25);
  const res = await ask('2026-07-28', pmId);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.ambiguous, false);
  assert.equal(res.body.data.billing_month, '2026-09');
  assert.equal(res.body.data.resolved, true);
});

test('주기가 다른 카드가 섞이면 ambiguous 가 true 이고 추측하지 않는다.', async () => {
  await makeCard(27, 25);
  const res = await ask('2026-07-28', pmId);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.ambiguous, true);
  assert.equal(res.body.data.resolved, false);
  assert.equal(res.body.data.card_product, null);
  assert.equal(res.body.data.billing_month, '2026-07');
});

test('주기를 안 적은 카드는 후보에서 빠진다.', async () => {
  const res = await api('POST', '/api/payment-methods', { name: '주기없는카드사', type: '신용' });
  const newPmId = res.body.id;
  await makeCard(null, null, { payment_method_id: newPmId });
  const res2 = await ask('2026-07-28', newPmId);
  assert.equal(res2.status, 200);
  assert.equal(res2.body.data.resolved, false);
  assert.equal(res2.body.data.card_product, null);
  assert.equal(res2.body.data.ambiguous, false);
});
