'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers/testServer');

const PORT = 20699;
let server;
const ids = {};

async function json(pathname, options) {
  const r = await fetch(`${server.base}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return { status: r.status, body: await r.json() };
}
const post = (p, body) => json(p, { method: 'POST', body: JSON.stringify(body) });

before(async () => {
  server = await startTestServer({ port: PORT });

  // 결제수단과 카드. 실적 조건을 걸어 미달 상태를 만든다.
  ids.pm = (await post('/api/payment-methods', { name: '배선테스트카드', type: '신용' })).body.id;
  ids.card = (await post('/api/card-products', {
    payment_method_id: ids.pm,
    issuer: '예시카드사',
    product_name: '예시 배선 카드',
    card_type: '신용',
    prev_month_threshold: 300000,
  })).body.id;

  // 실적 조건이 붙는 줄
  ids.plain = (await post('/api/card-benefits', {
    card_product_id: ids.card,
    merchant_pattern: '예시조건가맹점',
    benefit_type: '적립',
    rate: 10,
  })).body.id;

  // 실적 조건이 붙지 **않는** 줄
  ids.exempt = (await post('/api/card-benefits', {
    card_product_id: ids.card,
    merchant_pattern: '예시무관가맹점',
    benefit_type: '적립',
    rate: 10,
    threshold_exempt: true,
  })).body.id;
});

// **`stop()` 이다.** `close()` 가 아니다 — 이름을 틀리면 자식 서버가 안 죽어
// 러너가 통째로 매달린다.
after(() => server && server.stop());

test('저장한 실적 무관 표시가 조회에 그대로 돌아온다', async () => {
  const { body } = await json(`/api/card-benefits?card_product_id=${ids.card}`);
  const rows = body.data || body;

  const exempt = rows.find((r) => r.id === ids.exempt);
  const plain = rows.find((r) => r.id === ids.plain);

  assert.equal(Number(exempt.threshold_exempt), 1);
  assert.equal(Number(plain.threshold_exempt), 0);
});

test('실적 미달이어도 실적 무관 혜택은 계산까지 살아 온다', async () => {
  const { body } = await json('/api/card-strategy/estimate?amount=20000&merchant=예시무관가맹점');
  const rows = body.data || body;
  const mine = rows.find((r) => r.cardProductId === ids.card);

  assert.ok(mine, '카드가 결과에 있어야 한다');
  assert.equal(mine.benefit, 2000);
});

test('실적 조건이 붙는 혜택은 같은 상황에서 0 이다', async () => {
  const { body } = await json('/api/card-strategy/estimate?amount=20000&merchant=예시조건가맹점');
  const rows = body.data || body;
  const mine = rows.find((r) => r.cardProductId === ids.card);

  assert.ok(mine, '카드가 결과에 있어야 한다');
  assert.equal(mine.benefit, 0);
});

test('표시를 끄면 계산도 따라 바뀐다', async () => {
  await json(`/api/card-benefits/${ids.exempt}`, {
    method: 'PUT',
    body: JSON.stringify({ threshold_exempt: false }),
  });

  const { body } = await json('/api/card-strategy/estimate?amount=20000&merchant=예시무관가맹점');
  const rows = body.data || body;
  const mine = rows.find((r) => r.cardProductId === ids.card);
  assert.equal(mine.benefit, 0);

  // 되돌린다 — 다른 테스트가 이 상태에 기대지 않게
  await json(`/api/card-benefits/${ids.exempt}`, {
    method: 'PUT',
    body: JSON.stringify({ threshold_exempt: true }),
  });
});
