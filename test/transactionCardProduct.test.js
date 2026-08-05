'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

// 거래가 어느 카드로 결제됐는지 기록하는 경로(#302 2단계).
//
// 016 이 transactions.card_product_id 를 만들었지만 쓰는 곳이 없어 실사용 DB 에서
// 이 값이 채워진 거래가 0건이었다 — #276 의 카드 전략 계산이 먹을 데이터가
// 없다는 뜻이다. 여기서 확인하는 것은 세 가지다.
//
//   1. 상품을 지정한 거래가 저장되고 조회에서 되돌아온다
//   2. 카드사와 카드가 어긋난 짝은 저장되지 않는다
//   3. 카드 아닌 결제수단(현금·이체)의 동작이 그대로다

const PORT = 34712; // 다른 테스트와 겹치지 않는 포트
const BASE = `http://127.0.0.1:${PORT}`;
let server;

async function json(pathname, options) {
  const r = await fetch(`${BASE}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return { status: r.status, body: await r.json() };
}

const post = (pathname, body) => json(pathname, { method: 'POST', body: JSON.stringify(body) });
const put = (pathname, body) => json(pathname, { method: 'PUT', body: JSON.stringify(body) });

let categoryId;
let cardIssuerId;   // 신용 결제수단(카드사)
let otherIssuerId;  // 다른 카드사
let cashMethodId;   // 카드 아닌 결제수단
let productId;      // cardIssuerId 아래 카드상품

before(async () => {
  server = await startTestServer({ port: PORT });

  const cats = await json('/api/categories');
  categoryId = (cats.body.data || cats.body)[0].id;

  const pms = await json('/api/payment-methods');
  const methods = pms.body.data || pms.body;
  const cards = methods.filter((m) => m.type === '신용' || m.type === '체크');
  cardIssuerId = cards[0].id;
  otherIssuerId = cards[1].id;
  cashMethodId = methods.find((m) => m.type !== '신용' && m.type !== '체크').id;

  const created = await post('/api/card-products', {
    payment_method_id: cardIssuerId,
    issuer: '테스트카드사',
    product_name: '테스트 A카드',
    card_type: '신용',
  });
  assert.strictEqual(created.status, 201, JSON.stringify(created.body));
  productId = created.body.id;
});

after(() => {
  if (server) server.stop();
});

const tx = (over = {}) => ({
  date: '2026-08-01', category_id: categoryId, amount: 10000, merchant: '테스트가맹점', ...over,
});

async function readTx(id) {
  const { body } = await json(`/api/transactions?limit=500`);
  return body.data.find((t) => t.id === id);
}

describe('A. 카드상품을 지정한 거래', () => {
  test('A-1. POST 가 card_product_id 를 저장한다', async () => {
    const created = await post('/api/transactions',
      tx({ payment_method_id: cardIssuerId, card_product_id: productId }));
    assert.strictEqual(created.status, 201);

    const saved = await readTx(created.body.id);
    assert.strictEqual(saved.card_product_id, productId);
    assert.strictEqual(saved.payment_method_id, cardIssuerId);
  });

  test('A-2. 상품을 안 보내면 미상(NULL)으로 남는다', async () => {
    const created = await post('/api/transactions', tx({ payment_method_id: cardIssuerId }));
    assert.strictEqual(created.status, 201);

    const saved = await readTx(created.body.id);
    assert.strictEqual(saved.card_product_id, null);
    assert.strictEqual(saved.payment_method_id, cardIssuerId);
  });

  test('A-3. null 을 명시해도 미상이다', async () => {
    const created = await post('/api/transactions',
      tx({ payment_method_id: cardIssuerId, card_product_id: null }));
    assert.strictEqual(created.status, 201);

    const saved = await readTx(created.body.id);
    assert.strictEqual(saved.card_product_id, null);
  });

  test('A-4. PUT 이 미상 거래에 카드를 지정한다 — 재매핑이 딛는 경로다', async () => {
    const created = await post('/api/transactions', tx({ payment_method_id: cardIssuerId }));
    const updated = await put(`/api/transactions/${created.body.id}`,
      tx({ payment_method_id: cardIssuerId, card_product_id: productId }));
    assert.strictEqual(updated.status, 200);

    const saved = await readTx(created.body.id);
    assert.strictEqual(saved.card_product_id, productId);
  });

  test('A-5. PUT 이 지정된 카드를 다시 미상으로 되돌린다', async () => {
    // 기억나지 않아 못 고르는 거래는 미상으로 두고 끝낼 수 있어야 한다(#306).
    // COALESCE 로 막아 두면 한 번 지정한 뒤에는 되돌릴 길이 없다.
    const created = await post('/api/transactions',
      tx({ payment_method_id: cardIssuerId, card_product_id: productId }));
    const updated = await put(`/api/transactions/${created.body.id}`,
      tx({ payment_method_id: cardIssuerId, card_product_id: null }));
    assert.strictEqual(updated.status, 200);

    const saved = await readTx(created.body.id);
    assert.strictEqual(saved.card_product_id, null);
  });
});

describe('B. 카드사와 카드가 어긋난 짝', () => {
  test('B-1. 다른 카드사를 함께 보내면 400 이다', async () => {
    const created = await post('/api/transactions',
      tx({ payment_method_id: otherIssuerId, card_product_id: productId }));
    assert.strictEqual(created.status, 400);
    assert.match(created.body.error, /카드사/);
  });

  test('B-2. 카드사 없이 카드만 보내면 400 이다', async () => {
    const created = await post('/api/transactions', tx({ card_product_id: productId }));
    assert.strictEqual(created.status, 400);
  });

  test('B-3. 없는 카드 id 는 400 이다', async () => {
    const created = await post('/api/transactions',
      tx({ payment_method_id: cardIssuerId, card_product_id: 99999 }));
    assert.strictEqual(created.status, 400);
    assert.match(created.body.error, /카드를 찾을 수 없습니다/);
  });

  test('B-4. 숫자가 아닌 card_product_id 는 400 이다', async () => {
    const created = await post('/api/transactions',
      tx({ payment_method_id: cardIssuerId, card_product_id: 'abc' }));
    assert.strictEqual(created.status, 400);
    assert.strictEqual(created.body.error, 'card_product_id must be an integer');
  });

  test('B-5. 어긋난 짝은 PUT 에서도 막힌다', async () => {
    const created = await post('/api/transactions', tx({ payment_method_id: cardIssuerId }));
    const updated = await put(`/api/transactions/${created.body.id}`,
      tx({ payment_method_id: otherIssuerId, card_product_id: productId }));
    assert.strictEqual(updated.status, 400);

    // 거절된 요청이 아무것도 바꾸지 않았는지 확인한다.
    const saved = await readTx(created.body.id);
    assert.strictEqual(saved.payment_method_id, cardIssuerId);
    assert.strictEqual(saved.card_product_id, null);
  });
});

describe('C. 카드 아닌 결제수단은 그대로다', () => {
  test('C-1. 현금 거래가 지금과 똑같이 저장된다', async () => {
    const created = await post('/api/transactions', tx({ payment_method_id: cashMethodId }));
    assert.strictEqual(created.status, 201);

    const saved = await readTx(created.body.id);
    assert.strictEqual(saved.payment_method_id, cashMethodId);
    assert.strictEqual(saved.card_product_id, null);
  });

  test('C-2. 결제수단이 없는 거래도 그대로 저장된다', async () => {
    const created = await post('/api/transactions', tx());
    assert.strictEqual(created.status, 201);

    const saved = await readTx(created.body.id);
    assert.strictEqual(saved.payment_method_id, null);
    assert.strictEqual(saved.card_product_id, null);
  });

  test('C-3. card_product_id 를 아예 모르는 예전 클라이언트의 PUT 도 통한다', async () => {
    const created = await post('/api/transactions', tx({ payment_method_id: cashMethodId }));
    const updated = await put(`/api/transactions/${created.body.id}`,
      tx({ payment_method_id: cashMethodId, memo: '메모만 고침' }));
    assert.strictEqual(updated.status, 200);

    const saved = await readTx(created.body.id);
    assert.strictEqual(saved.memo, '메모만 고침');
  });
});

describe('D. 카드사 참조는 깨지지 않는다', () => {
  // 전에는 카드를 지우면 card_product_id 가 NULL 로 돌아갔다. 그래서 NULL 이
  // "한 번도 지정 안 됨" 과 "지운 카드" 둘을 뜻했고, 전략 계산의 되짚기가 후자를
  // 전자로 오해해 지운 카드의 지출을 남은 카드로 넘겼다(#410).
  //
  // 이제 지우기는 비활성화다. **지정은 그대로 남는다** — 그래야 NULL 이 다시
  // 한 가지 뜻만 갖는다.
  test('D-1. 카드를 지워도 거래의 카드 지정이 그대로 남는다', async () => {
    const product = await post('/api/card-products', {
      payment_method_id: cardIssuerId,
      issuer: '테스트카드사',
      product_name: '지울 카드',
      card_type: '신용',
    });
    const created = await post('/api/transactions',
      tx({ payment_method_id: cardIssuerId, card_product_id: product.body.id }));

    const deleted = await json(`/api/card-products/${product.body.id}`, { method: 'DELETE' });
    assert.strictEqual(deleted.status, 200);
    assert.strictEqual(deleted.body.kept, 1, '그 카드에 남은 거래 수를 알려야 한다');

    const saved = await readTx(created.body.id);
    assert.ok(saved, '카드를 지웠다고 거래가 사라지면 안 된다');
    assert.strictEqual(saved.card_product_id, product.body.id, '지정이 유지돼야 한다');
    assert.strictEqual(saved.payment_method_id, cardIssuerId);
  });

  test('D-2. 비활성 카드는 미상 건수에 포함되지 않는다', async () => {
    // 미상은 이제 "한 번도 지정 안 됨" 하나만 뜻한다.
    const before = (await json('/api/card-products/unassigned-count')).body.unassigned;

    const product = await post('/api/card-products', {
      payment_method_id: cardIssuerId,
      issuer: '테스트카드사',
      product_name: '미상집계 확인용',
      card_type: '신용',
    });
    await post('/api/transactions', tx({ payment_method_id: cardIssuerId, card_product_id: product.body.id }));
    await json(`/api/card-products/${product.body.id}`, { method: 'DELETE' });

    const after = (await json('/api/card-products/unassigned-count')).body.unassigned;
    assert.strictEqual(after, before, '비활성화가 미상 건수를 늘리면 안 된다');
  });
});
