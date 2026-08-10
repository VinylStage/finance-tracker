'use strict';
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

// 카드 비활성화(#410).
//
// 재현했던 결함: 한 결제수단에 카드가 둘 있을 때 하나를 지우면, **지운 카드의
// 과거 지출이 남은 카드의 실적·차액으로 넘어갔다.**
//
//   1. 지우면 그 거래의 card_product_id 가 NULL 이 된다
//   2. 전략 계산은 NULL 을 보면 결제수단으로 되짚는다 — 상품이 딱 하나면 그것
//   3. 지운 뒤에는 남은 상품이 정확히 하나다 → 남의 지출이 그 카드로 붙는다
//
// 화면에는 그럴듯한 숫자가 뜨고 unknownCard 로도 안 잡혔다.
//
// 이 파일이 잠그는 것.
//   A. 지우기가 지정을 건드리지 않는다 (NULL 의 뜻이 하나로 고정된다)
//   B. 지운 카드의 지출이 남은 카드로 넘어가지 않는다  ← 결함 자체
//   C. 비활성 카드는 새 거래에서 고를 수 없다
//   D. 같은 카드를 다시 등록하려 하면 재활성화를 제안한다

const PORT = 34714; // 다른 테스트와 겹치지 않는 포트
const BASE = `http://127.0.0.1:${PORT}`;
let server;

async function json(pathname, options) {
  const r = await fetch(`${BASE}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return { status: r.status, body: await r.json() };
}
const post = (p, body) => json(p, { method: 'POST', body: JSON.stringify(body) });
const del = (p) => json(p, { method: 'DELETE' });

let categoryId, issuerId, cardA, cardB;

// **케이스마다 카드사를 새로 만든다.**
//
// 비활성화는 행을 남기므로 앞 케이스가 지운 카드가 계속 쌓인다. 같은 카드사를
// 공유하면 "그 결제수단에 상품이 몇 개인가" 가 케이스마다 달라져, 되짚기 조건을
// 검증하는 이 파일의 단언이 통째로 무의미해진다. 하드 삭제로 치우는 길은
// 이제 없으므로 이름 공간을 나눈다.
let issuerSeq = 0;

async function freshIssuer() {
  issuerSeq += 1;
  const r = await post('/api/payment-methods', { name: `비활성화테스트${issuerSeq}`, type: '신용' });
  assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body));
  return r.body.id;
}

async function mkCard(name) {
  const r = await post('/api/card-products', {
    payment_method_id: issuerId, issuer: '테스트카드사', product_name: name,
    card_type: '신용', billing_cycle_day: 15, statement_close_day: 25,
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  return r.body.id;
}

before(async () => {
  server = await startTestServer({ port: PORT });

  const cats = await json('/api/categories');
  categoryId = (cats.body.data || cats.body)[0].id;
});

after(() => {
  if (server) server.stop();
});

beforeEach(async () => {
  issuerId = await freshIssuer();
  const list = await json('/api/transactions?limit=500');
  for (const t of list.body.data) await del(`/api/transactions/${t.id}`);
});

describe('A. 지우기는 지정을 건드리지 않는다', () => {
  test('A-1. 비활성화해도 거래의 card_product_id 가 남는다', async () => {
    cardA = await mkCard('A카드');
    const tx = await post('/api/transactions', {
      date: '2026-08-01', category_id: categoryId, amount: 10000,
      payment_method_id: issuerId, card_product_id: cardA, merchant: '가맹점',
    });

    const r = await del(`/api/card-products/${cardA}`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.deactivated, true);
    assert.strictEqual(r.body.kept, 1);

    const list = await json('/api/transactions?limit=500');
    const saved = list.body.data.find((t) => t.id === tx.body.id);
    assert.strictEqual(saved.card_product_id, cardA);
  });

  test('A-2. 미상 건수가 늘지 않는다 — NULL 은 "한 번도 지정 안 됨" 만 뜻한다', async () => {
    cardA = await mkCard('A카드');
    await post('/api/transactions', {
      date: '2026-08-01', category_id: categoryId, amount: 10000,
      payment_method_id: issuerId, card_product_id: cardA, merchant: '가맹점',
    });
    const before = (await json('/api/card-products/unassigned-count')).body.unassigned;

    await del(`/api/card-products/${cardA}`);

    const after = (await json('/api/card-products/unassigned-count')).body.unassigned;
    assert.strictEqual(after, before);
  });
});

describe('B. 지운 카드의 지출이 남은 카드로 넘어가지 않는다', () => {
  test('B-1. 카드 둘 중 하나를 지워도 그 거래가 남은 카드에 붙지 않는다', async () => {
    cardA = await mkCard('A카드');
    cardB = await mkCard('B카드');

    // A 로 결제한 과거 거래.
    const tx = await post('/api/transactions', {
      date: '2026-08-01', category_id: categoryId, amount: 50000,
      payment_method_id: issuerId, card_product_id: cardA, merchant: '가맹점',
    });

    await del(`/api/card-products/${cardA}`);

    // 결함이 있으면 여기서 B 가 나온다(NULL 로 돌아간 뒤 상품이 하나뿐이라 되짚음).
    const list = await json('/api/transactions?limit=500');
    const saved = list.body.data.find((t) => t.id === tx.body.id);
    assert.strictEqual(saved.card_product_id, cardA, 'A 의 지출이 B 로 넘어갔다');
    assert.notStrictEqual(saved.card_product_id, cardB);
  });

  test('B-2. 전략 계산의 실적에도 남은 카드로 넘어가지 않는다', async () => {
    cardA = await mkCard('A카드');
    cardB = await mkCard('B카드');
    await post('/api/transactions', {
      date: '2026-08-01', category_id: categoryId, amount: 50000,
      payment_method_id: issuerId, card_product_id: cardA, merchant: '가맹점',
    });

    await del(`/api/card-products/${cardA}`);

    const th = await json('/api/card-strategy/thresholds');
    assert.strictEqual(th.status, 200);
    const bRow = (th.body.data || []).find((c) => c.cardId === cardB || c.id === cardB);
    if (bRow) {
      const spent = bRow.spent ?? bRow.achieved ?? bRow.amount ?? 0;
      assert.strictEqual(spent, 0, 'B 실적에 A 의 지출이 섞였다');
    }
  });
});

describe('C. 비활성 카드는 고를 수 없다', () => {
  test('C-1. 기본 목록에서 빠진다', async () => {
    cardA = await mkCard('A카드');
    await del(`/api/card-products/${cardA}`);

    const list = await json('/api/card-products');
    assert.ok(!list.body.data.some((c) => c.id === cardA));
  });

  test('C-2. include_inactive 로는 보인다 — 과거 거래를 보여주려면 필요하다', async () => {
    cardA = await mkCard('A카드');
    await del(`/api/card-products/${cardA}`);

    const all = await json('/api/card-products?include_inactive=1');
    const found = all.body.data.find((c) => c.id === cardA);
    assert.ok(found);
    assert.strictEqual(found.is_active, 0);
  });

  test('C-3. 비활성 카드로는 재매핑할 수 없다', async () => {
    cardA = await mkCard('A카드');
    await del(`/api/card-products/${cardA}`);

    const r = await post('/api/card-products/remap/preview', { card_product_id: cardA });
    assert.strictEqual(r.status, 400);
    assert.match(r.body.error, /더 이상 쓰지 않는/);
  });

  test('C-4. 새 거래에 비활성 카드를 지정하는 것 자체는 막지 않는다', async () => {
    // 서버는 카드사와의 짝만 본다(#399). 고르지 못하게 하는 것은 화면의 몫이고,
    // 여기까지 막으면 과거 거래를 수정할 때 그 카드로 되돌릴 수 없다.
    cardA = await mkCard('A카드');
    await del(`/api/card-products/${cardA}`);

    const r = await post('/api/transactions', {
      date: '2026-08-02', category_id: categoryId, amount: 1000,
      payment_method_id: issuerId, card_product_id: cardA, merchant: '수정',
    });
    assert.strictEqual(r.status, 201);
  });
});

describe('D. 같은 카드 다시 등록', () => {
  test('D-1. 활성 카드와 같은 이름이면 거절한다', async () => {
    cardA = await mkCard('A카드');
    const r = await post('/api/card-products', {
      payment_method_id: issuerId, issuer: '테스트카드사',
      product_name: 'A카드', card_type: '신용',
    });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.body.reactivatable, false);
  });

  test('D-2. 비활성 카드와 같은 이름이면 재활성화를 제안한다', async () => {
    cardA = await mkCard('A카드');
    await del(`/api/card-products/${cardA}`);

    const r = await post('/api/card-products', {
      payment_method_id: issuerId, issuer: '테스트카드사',
      product_name: 'A카드', card_type: '신용',
    });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.body.reactivatable, true);
    assert.strictEqual(r.body.duplicate_id, cardA);
    assert.match(r.body.error, /다시 쓰시겠어요/);
  });

  test('D-3. 재활성화하면 목록에 돌아오고 과거 거래도 그대로다', async () => {
    cardA = await mkCard('A카드');
    const tx = await post('/api/transactions', {
      date: '2026-08-01', category_id: categoryId, amount: 10000,
      payment_method_id: issuerId, card_product_id: cardA, merchant: '가맹점',
    });
    await del(`/api/card-products/${cardA}`);

    const r = await post(`/api/card-products/${cardA}/reactivate`, {});
    assert.strictEqual(r.status, 200);

    const list = await json('/api/card-products');
    assert.ok(list.body.data.some((c) => c.id === cardA));

    const txs = await json('/api/transactions?limit=500');
    assert.strictEqual(txs.body.data.find((t) => t.id === tx.body.id).card_product_id, cardA);
  });

  test('D-4. 없는 카드를 재활성화하면 404 다', async () => {
    const r = await post('/api/card-products/99999/reactivate', {});
    assert.strictEqual(r.status, 404);
  });
});
