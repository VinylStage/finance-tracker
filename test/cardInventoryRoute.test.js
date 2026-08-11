'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

// GET /api/card-products/inventory (#520).
//
// 이 엔드포인트의 값어치는 **세는 것** 하나다. 카드 목록은 이미 GET / 가 준다.
// 여기서만 나오는 건 혜택 건수 · 붙은 거래 건수 · 카드사별 미지정 건수 셋이고,
// 그 셋이 틀리면 "무엇이 비었나" 가 통째로 거짓말이 된다. 그래서 세 값이
// 각각 **다른 카드를 가리키는** 자료를 깔고 본다 — 한 카드에 다 몰아 넣으면
// 카드를 잘못 짚어도 숫자가 맞아 통과한다.

const PORT = 34997;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

async function json(pathname, options) {
  const r = await fetch(`${BASE}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return { status: r.status, body: await r.json() };
}

// 카드사 두 곳을 쓴다. 미지정 건수가 카드사별로 갈리는지 보려면 최소 둘이다.
let methodA; let methodB;
let cardWithBenefit; let cardBare; let cardOnB;

before(async () => {
  server = await startTestServer({ port: PORT });

  const pm = await json('/api/payment-methods');
  const methods = (pm.body.data || pm.body).filter((m) => m.type === '신용' || m.type === '체크');
  methodA = methods[0].id;
  methodB = methods[1].id;

  const mk = async (payment_method_id, product_name, over = {}) => {
    const res = await json('/api/card-products', {
      method: 'POST',
      body: JSON.stringify({
        payment_method_id, issuer: '테스트카드', product_name,
        card_type: '신용', annual_fee: 10000, ...over,
      }),
    });
    return (res.body.data || res.body).id;
  };

  // 혜택 2건 + 청구주기 채움 + 실적 있음 — 아무것도 안 비어야 한다
  cardWithBenefit = await mk(methodA, '혜택있는카드', {
    prev_month_threshold: 300000, statement_close_day: 25, billing_cycle_day: 15,
  });
  // 혜택 0건 + 청구주기 비움 + 실적 없음 — 셋 다 비어야 한다
  cardBare = await mk(methodA, '맨카드');
  // 다른 카드사. 거래가 붙는 쪽이다
  cardOnB = await mk(methodB, '비카드사카드');

  for (const rate of [1, 2]) {
    await json('/api/card-benefits', {
      method: 'POST',
      body: JSON.stringify({ card_product_id: cardWithBenefit, benefit_type: '적립', rate }),
    });
  }

  const cat = await json('/api/categories');
  const categoryId = (cat.body.data || cat.body)[0].id;

  const tx = async (payment_method_id, over = {}) => json('/api/transactions', {
    method: 'POST',
    body: JSON.stringify({
      date: '2026-03-02', amount: 10000, category_id: categoryId,
      payment_method_id, merchant: '테스트', ...over,
    }),
  });

  // cardOnB 에 붙은 거래 1건 — transaction_count 가 이 카드에서만 1 이어야 한다
  await tx(methodB, { card_product_id: cardOnB });
  // 카드 미지정 거래: A 카드사 2건, B 카드사 1건 — 카드사별로 갈리는지 본다
  await tx(methodA);
  await tx(methodA);
  await tx(methodB);
});

after(() => {
  if (server) server.stop();
});

function find(cards, id) {
  return cards.find((c) => c.id === id);
}

describe('A. 카드별 집계', () => {
  test('A-1. 혜택 건수가 그 카드에만 붙는다', async () => {
    const { status, body } = await json('/api/card-products/inventory');
    assert.equal(status, 200);
    const cards = body.data.cards;
    assert.equal(find(cards, cardWithBenefit).benefit_count, 2);
    assert.equal(find(cards, cardBare).benefit_count, 0);
    assert.equal(find(cards, cardOnB).benefit_count, 0);
  });

  test('A-2. 거래 건수가 그 카드에만 붙는다', async () => {
    const { body } = await json('/api/card-products/inventory');
    const cards = body.data.cards;
    assert.equal(find(cards, cardOnB).transaction_count, 1);
    assert.equal(find(cards, cardWithBenefit).transaction_count, 0);
    assert.equal(find(cards, cardBare).transaction_count, 0);
  });

  test('A-3. 비어 있는 값은 비운 채로 온다 — 0 으로 채우지 않는다', async () => {
    const { body } = await json('/api/card-products/inventory');
    const bare = find(body.data.cards, cardBare);
    // 실적 0 원과 "실적 조건 없음" 은 다른 뜻이다. 여기서 0 이 오면 화면이
    // 무실적 카드를 "0원 실적 카드" 로 잘못 말하게 된다.
    assert.equal(bare.prev_month_threshold, null);
    assert.equal(bare.statement_close_day, null);
    assert.equal(bare.billing_cycle_day, null);
  });

  test('A-4. 카드사 이름을 함께 준다', async () => {
    const { body } = await json('/api/card-products/inventory');
    const c = find(body.data.cards, cardWithBenefit);
    assert.ok(c.payment_method_name, '카드사 이름이 있어야 화면이 카드사로 묶는다');
  });
});

describe('B. 카드사별 미지정 건수', () => {
  test('B-1. 카드사별로 나뉘어 온다', async () => {
    const { body } = await json('/api/card-products/inventory');
    const un = body.data.unassigned;
    const a = un.find((u) => u.payment_method_id === methodA);
    const b = un.find((u) => u.payment_method_id === methodB);
    assert.equal(a.count, 2);
    assert.equal(b.count, 1);
  });

  test('B-2. 카드가 붙은 거래는 세지 않는다', async () => {
    const { body } = await json('/api/card-products/inventory');
    const total = body.data.unassigned.reduce((s, u) => s + u.count, 0);
    // 거래 4건 중 1건은 카드가 붙어 있다
    assert.equal(total, 3);
  });

  test('B-3. 많은 카드사가 먼저 온다', async () => {
    const { body } = await json('/api/card-products/inventory');
    const counts = body.data.unassigned.map((u) => u.count);
    const sorted = [...counts].sort((x, y) => y - x);
    assert.deepEqual(counts, sorted);
  });

  test('B-4. 현금·이체 결제수단은 세지 않는다 — 카드가 아니다', async () => {
    const cat = await json('/api/categories');
    const categoryId = (cat.body.data || cat.body)[0].id;
    const pm = await json('/api/payment-methods');
    const nonCard = (pm.body.data || pm.body).find((m) => m.type !== '신용' && m.type !== '체크');
    assert.ok(nonCard, '현금성/이체 결제수단이 기본 자료에 있어야 이 테스트가 성립한다');

    await json('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        date: '2026-03-03', amount: 5000, category_id: categoryId,
        payment_method_id: nonCard.id, merchant: '현금거래',
      }),
    });

    const { body } = await json('/api/card-products/inventory');
    const hit = body.data.unassigned.find((u) => u.payment_method_id === nonCard.id);
    assert.equal(hit, undefined);
  });
});

describe('C. 비활성 카드', () => {
  test('C-1. 비활성 카드도 목록에 남는다 — 안 보이면 사라진 이유를 알 수 없다', async () => {
    await json(`/api/card-products/${cardBare}`, { method: 'DELETE' });
    const { body } = await json('/api/card-products/inventory');
    const bare = find(body.data.cards, cardBare);
    assert.ok(bare, '비활성 카드가 목록에서 빠지면 안 된다');
    assert.equal(bare.is_active, 0);
  });

  test('C-2. 활성 카드가 비활성보다 앞에 온다', async () => {
    const { body } = await json('/api/card-products/inventory');
    const flags = body.data.cards.map((c) => (c.is_active ? 1 : 0));
    const sorted = [...flags].sort((x, y) => y - x);
    assert.deepEqual(flags, sorted);
  });
});
