'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// #364 — 구매일이 실리는 청구월을 돌려준다.
//
// 할부 등록 폼의 「청구 시작월」이 이번 달로 박혀 있어서, 7/28 구매인데 마감이
// 7/25 인 카드면 **두 달 어긋난 채로 회차 전체가 생성된다.** #269 의 파생 거래가
// 이 값을 그대로 쓰기 때문에 잘못된 달에 지출이 쌓인다.
//
// 계산 자체는 #290 의 billingMonthInfo 가 한다. 여기서 잠그는 것은
//   1. 결제수단 → 카드 상품을 어떻게 고르는가 (여러 개일 때 추측하지 않는가)
//   2. 모를 때 그 사실을 돌려주는가 (resolved / ambiguous)

let pmSingle;
let pmMulti;
let pmNoCycle;

const PORT = 34615;
const BASE = `http://127.0.0.1:${PORT}`;
let server;
let dbPath;

async function json(pathname, options) {
  const r = await fetch(`${BASE}${pathname}`, {
    headers: { 'Content-Type': 'application/json' }, ...options,
  });
  return { status: r.status, body: await r.json() };
}
const post = (p, body) => json(p, { method: 'POST', body: JSON.stringify(body) });

before(async () => {
  server = await startTestServer({ port: PORT });
  dbPath = server.dbPath;

  // 픽스처는 같은 훅 안에서. node:test 는 같은 레벨 before 를 여러 개 두면 덮인다.
  const mk = async (name) => (await post('/api/payment-methods', { name, type: '신용' })).body.id;
  pmSingle = await mk('단일상품카드');
  pmMulti = await mk('복수상품카드');
  pmNoCycle = await mk('주기미설정카드');

  // 마감 25일 / 결제 15일 → 마감 다음 달에 청구
  await post('/api/card-products', {
    payment_method_id: pmSingle, issuer: '테스트', product_name: '단일',
    card_type: '신용', statement_close_day: 25, billing_cycle_day: 15,
  });
  // 주기가 서로 다른 상품 두 개
  await post('/api/card-products', {
    payment_method_id: pmMulti, issuer: '테스트', product_name: 'A',
    card_type: '신용', statement_close_day: 25, billing_cycle_day: 15,
  });
  await post('/api/card-products', {
    payment_method_id: pmMulti, issuer: '테스트', product_name: 'B',
    card_type: '신용', statement_close_day: 10, billing_cycle_day: 27,
  });
  // 주기가 비어 있는 상품
  await post('/api/card-products', {
    payment_method_id: pmNoCycle, issuer: '테스트', product_name: '주기없음',
    card_type: '신용',
  });
});

after(() => {
  if (server) server.stop();
});

const url = (pm, date) => `/api/card-products/billing-month?purchase_date=${date}${pm ? `&payment_method_id=${pm}` : ''}`;

describe('A. 주기를 아는 카드', () => {
  test('A-1. 마감 전 구매는 그 달 마감에 걸린다', async () => {
    // 7/10 구매, 마감 25일 → 7월 마감 → 결제 15일은 마감보다 앞이라 다음 달 청구
    const r = await json(url(pmSingle, '2026-07-10'));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.data.billing_month, '2026-08');
    assert.strictEqual(r.body.data.resolved, true);
  });

  test('A-2. 마감 후 구매는 다음 달 마감으로 밀린다', async () => {
    // 7/28 구매, 마감 25일 → 8월 마감 → 9월 청구.
    // 이 케이스가 이 이슈의 이유다 — 기본값이 '이번 달' 이면 두 달 어긋난다.
    const r = await json(url(pmSingle, '2026-07-28'));
    assert.strictEqual(r.body.data.billing_month, '2026-09');
    assert.strictEqual(r.body.data.resolved, true);
  });

  test('A-3. 어느 상품으로 계산했는지 알려준다', async () => {
    const r = await json(url(pmSingle, '2026-07-10'));
    assert.strictEqual(r.body.data.card_product.product_name, '단일');
  });
});

describe('B. 모를 때는 추측하지 않는다', () => {
  test('B-1. 카드를 안 고르면 구매일의 달로 폴백하고 밝힌다', async () => {
    const r = await json(url(null, '2026-07-28'));
    assert.strictEqual(r.body.data.billing_month, '2026-07');
    assert.strictEqual(r.body.data.resolved, false);
  });

  test('B-2. 주기가 비어 있으면 폴백한다', async () => {
    const r = await json(url(pmNoCycle, '2026-07-28'));
    assert.strictEqual(r.body.data.billing_month, '2026-07');
    assert.strictEqual(r.body.data.resolved, false);
  });

  test('B-3. 주기가 다른 상품이 여럿이면 고르지 않는다', async () => {
    // 어느 것을 쓸지 알 수 없다. 하나를 골라 쓰면 사용자가 보기에 지출이
    // 이유 없이 다른 달에 가 있다.
    const r = await json(url(pmMulti, '2026-07-28'));
    assert.strictEqual(r.body.data.resolved, false);
    assert.strictEqual(r.body.data.ambiguous, true);
    assert.strictEqual(r.body.data.card_product, null);
    assert.strictEqual(r.body.data.billing_month, '2026-07');
  });

  test('B-4. 상품이 여럿이어도 주기가 같으면 계산한다', async () => {
    const pm = (await post('/api/payment-methods', { name: '같은주기카드', type: '신용' })).body.id;
    for (const name of ['X', 'Y']) {
      await post('/api/card-products', {
        payment_method_id: pm, issuer: '테스트', product_name: name,
        card_type: '신용', statement_close_day: 25, billing_cycle_day: 15,
      });
    }
    const r = await json(url(pm, '2026-07-28'));
    assert.strictEqual(r.body.data.resolved, true);
    assert.strictEqual(r.body.data.ambiguous, false);
    assert.strictEqual(r.body.data.billing_month, '2026-09');
  });
});

describe('C. 입력 검증', () => {
  test('C-1. 구매일이 없으면 400', async () => {
    const r = await json('/api/card-products/billing-month');
    assert.strictEqual(r.status, 400);
  });

  test('C-2. 날짜 형식이 아니면 400', async () => {
    const r = await json('/api/card-products/billing-month?purchase_date=2026-7-1');
    assert.strictEqual(r.status, 400);
  });

  test('C-3. billing-month 가 :id 로 잡히지 않는다', async () => {
    // '/:id' 보다 먼저 선언돼야 한다.
    const r = await json(url(pmSingle, '2026-07-10'));
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.data.billing_month);
  });
});
