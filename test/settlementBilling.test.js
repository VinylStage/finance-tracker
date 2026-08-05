'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const { resolveBillingMonth } = require('../src/services/settlementBilling');

// 신용카드 거래를 청구월로 묶는다(#289 A안).
//
// `deferred` 는 통장을 즉시 줄이지 않는다. 나중에 카드대금이 한 번에 빠지고
// 그때가 `settlement` 다. **둘을 이어야** "이번 25일에 얼마 빠지나" 를 알 수 있다.
//
// 021 이 billing_month 컬럼을 만들었지만 **아무도 쓰지 않아 늘 NULL 이었다.**
// 여기서 그걸 잇는다.

// KB국민카드 25일 결제 / 12일 마감. #284 §5 의 매핑을 따른다.
const CARD = { billing_cycle_day: 25, statement_close_day: 12 };

describe('A. 언제 적고 언제 안 적는가', () => {
  test('A-1. deferred 이고 주기를 알면 청구월을 적는다', () => {
    const m = resolveBillingMonth({ settlement: 'deferred', date: '2026-07-10', cardProduct: CARD });
    assert.match(m, /^\d{4}-\d{2}$/);
  });

  test('A-2. 즉시 결제와 카드대금 인출에는 청구월이 없다', () => {
    // 청구월은 "무엇이 언제 청구되는가" 다. 인출 자체에 붙이면 뜻이 겹친다.
    for (const s of ['immediate', 'settlement']) {
      assert.equal(
        resolveBillingMonth({ settlement: s, date: '2026-07-10', cardProduct: CARD }),
        null,
        `${s} 에 청구월이 붙었다`,
      );
    }
  });

  test('A-3. 카드 주기를 모르면 안 적는다', () => {
    // 추측한 청구월로 묶으면 25일에 빠질 금액이 그럴듯하게 틀린다.
    // NULL 이면 적어도 "아직 모른다" 가 된다.
    for (const card of [null, undefined, {}, { billing_cycle_day: 25 }, { statement_close_day: 12 }]) {
      assert.equal(
        resolveBillingMonth({ settlement: 'deferred', date: '2026-07-10', cardProduct: card }),
        null,
        `${JSON.stringify(card)} 로 청구월을 지어냈다`,
      );
    }
  });

  test('A-4. 사용자가 적은 값이 계산을 이긴다', () => {
    // 명세서를 보고 직접 넣는 경우가 있다. 계산이 덮으면 고쳐도 되돌아간다.
    const m = resolveBillingMonth({
      settlement: 'deferred', date: '2026-07-10', billingMonth: '2026-09', cardProduct: CARD,
    });
    assert.equal(m, '2026-09');
  });

  test('A-5. 명시한 값은 settlement 종류와 무관하게 남는다', () => {
    assert.equal(
      resolveBillingMonth({ settlement: 'immediate', date: '2026-07-10', billingMonth: '2026-08' }),
      '2026-08',
    );
  });

  test('A-6. 날짜가 이상해도 던지지 않는다', () => {
    // 라우트가 이미 막지만, 여기서 던지면 거래 저장이 통째로 실패한다.
    for (const d of ['2026-7-10', '', null, undefined]) {
      assert.equal(resolveBillingMonth({ settlement: 'deferred', date: d, cardProduct: CARD }), null);
    }
  });

  test('A-7. 인자가 통째로 없어도 던지지 않는다', () => {
    assert.equal(resolveBillingMonth(), null);
    assert.equal(resolveBillingMonth({}), null);
  });
});

describe('B. 마감일을 넘으면 다음 청구월이다', () => {
  test('B-1. 마감 전후로 청구월이 갈린다', () => {
    // 12일 마감이면 7/12 까지가 그 마감분, 7/13 부터는 다음 마감분이다.
    const before = resolveBillingMonth({ settlement: 'deferred', date: '2026-07-12', cardProduct: CARD });
    const after = resolveBillingMonth({ settlement: 'deferred', date: '2026-07-13', cardProduct: CARD });

    assert.notEqual(before, after, '마감일을 넘었는데 같은 청구월에 묶였다');
  });

  test('B-2. 같은 마감 구간 안에서는 같은 청구월이다', () => {
    const a = resolveBillingMonth({ settlement: 'deferred', date: '2026-07-01', cardProduct: CARD });
    const b = resolveBillingMonth({ settlement: 'deferred', date: '2026-07-12', cardProduct: CARD });
    assert.equal(a, b);
  });
});

// ─────────────────────────────────────────────────────────────────────────
const PORT = 34643;
let server;
const ids = {};

async function json(pathname, options) {
  const r = await fetch(`${server.base}${pathname}`, {
    headers: { 'Content-Type': 'application/json' }, ...options,
  });
  return { status: r.status, body: await r.json() };
}
const post = (p, b) => json(p, { method: 'POST', body: JSON.stringify(b) });
const put = (p, b) => json(p, { method: 'PUT', body: JSON.stringify(b) });

const rowOf = (id) => json(`/api/transactions?limit=200`).then(({ body }) =>
  (body.data || body.items || []).find((t) => t.id === id));

before(async () => {
  server = await startTestServer({ port: PORT });

  const { body: pms } = await json('/api/payment-methods');
  ids.pm = (pms.data || pms).find((p) => p.type === '신용').id;
  const { body: cats } = await json('/api/categories');
  ids.cat = (cats.data || cats).find((c) => c.major_type === '선택지출').id;

  await post('/api/card-products', {
    payment_method_id: ids.pm, issuer: '테스트', product_name: '25일결제카드',
    card_type: '신용', billing_cycle_day: 25, statement_close_day: 12,
  });
  const { body: cps } = await json('/api/card-products');
  ids.card = (cps.data || cps).find((c) => c.product_name === '25일결제카드').id;

  // 주기를 안 넣은 카드. 청구월을 못 정해야 한다.
  await post('/api/card-products', {
    payment_method_id: ids.pm, issuer: '테스트', product_name: '주기미설정카드', card_type: '신용',
  });
  const { body: cps2 } = await json('/api/card-products');
  ids.noCycle = (cps2.data || cps2).find((c) => c.product_name === '주기미설정카드').id;
});

after(() => server && server.stop());

describe('C. 저장 경로에 실제로 붙는다', () => {
  const tx = (over = {}) => ({
    date: '2026-07-10', amount: 50000, category_id: ids.cat, payment_method_id: ids.pm,
    merchant: '테스트', settlement: 'deferred', card_product_id: ids.card, ...over,
  });

  test('C-1. 신용카드 거래를 넣으면 청구월이 채워진다', async () => {
    // 021 이 컬럼을 만든 뒤로 아무도 안 써서 늘 NULL 이었다.
    const { body } = await post('/api/transactions', tx());
    const row = await rowOf(body.id);

    assert.ok(row, '거래를 못 찾았다');
    assert.match(String(row.billing_month), /^\d{4}-\d{2}$/, `청구월이 안 붙었다: ${row.billing_month}`);
  });

  test('C-2. 현금 결제에는 안 붙는다', async () => {
    const { body } = await post('/api/transactions', tx({ settlement: 'immediate', card_product_id: null }));
    const row = await rowOf(body.id);
    assert.equal(row.billing_month, null);
  });

  test('C-3. 주기를 모르는 카드면 비워 둔다', async () => {
    const { body } = await post('/api/transactions', tx({ card_product_id: ids.noCycle }));
    const row = await rowOf(body.id);
    assert.equal(row.billing_month, null, '주기를 모르는데 청구월을 지어냈다');
  });

  test('C-4. 구매일을 고치면 청구월이 따라 바뀐다', async () => {
    // 파생값이라 입력이 바뀌면 따라가야 한다. 옛 값이 남으면 엉뚱한 청구월에
    // 묶인 채로 남고 사용자는 25일에 빠질 금액을 잘못 본다.
    const { body } = await post('/api/transactions', tx({ date: '2026-07-01' }));
    const first = (await rowOf(body.id)).billing_month;

    await put(`/api/transactions/${body.id}`, tx({ date: '2026-07-20' }));
    const second = (await rowOf(body.id)).billing_month;

    assert.notEqual(second, first, '구매일을 마감 이후로 옮겼는데 청구월이 그대로다');
  });

  test('C-5. 카드를 바꾸면 청구월을 다시 정한다', async () => {
    const { body } = await post('/api/transactions', tx());
    assert.ok((await rowOf(body.id)).billing_month);

    await put(`/api/transactions/${body.id}`, tx({ card_product_id: ids.noCycle }));
    assert.equal((await rowOf(body.id)).billing_month, null, '주기 모르는 카드로 바꿨는데 옛 청구월이 남았다');
  });

  test('C-6. 명시해서 보낸 청구월은 그대로 저장된다', async () => {
    const { body } = await post('/api/transactions', tx({ billing_month: '2026-11' }));
    assert.equal((await rowOf(body.id)).billing_month, '2026-11');
  });

  test('C-7. 형식이 틀린 청구월은 400 이다', async () => {
    const { status } = await post('/api/transactions', tx({ billing_month: '2026/11' }));
    assert.equal(status, 400);
  });
});

// D-4(settlementBackupRoundtrip)와 C-4·C-5 가 정면으로 부딪혔던 자리다.
//
//   "메모만 고쳤는데 청구월이 지워지면 안 된다"  ← 사용자가 손으로 넣은 값
//   "구매일을 고쳤는데 옛 청구월이 남으면 안 된다"  ← 엉뚱한 달에 묶인다
//
// 둘 다 맞다. 그래서 **입력이 실제로 바뀐 경우에만** 다시 계산한다.
describe('D. 입력이 안 바뀌면 건드리지 않는다', () => {
  const tx = (over = {}) => ({
    date: '2026-07-10', amount: 50000, category_id: ids.cat, payment_method_id: ids.pm,
    merchant: '보존확인', settlement: 'deferred', card_product_id: ids.card, ...over,
  });

  test('D-1. 메모만 고치면 청구월이 그대로다', async () => {
    const { body } = await post('/api/transactions', tx({ billing_month: '2026-04' }));
    await put(`/api/transactions/${body.id}`, tx({ memo: '메모추가' }));

    assert.equal((await rowOf(body.id)).billing_month, '2026-04', '메모만 고쳤는데 청구월이 바뀌었다');
  });

  test('D-2. 금액만 고쳐도 그대로다', async () => {
    const { body } = await post('/api/transactions', tx({ billing_month: '2026-04' }));
    await put(`/api/transactions/${body.id}`, tx({ amount: 99000 }));

    assert.equal((await rowOf(body.id)).billing_month, '2026-04');
  });

  test('D-3. 계산으로 붙은 값도 입력이 그대로면 유지된다', async () => {
    const { body } = await post('/api/transactions', tx());
    const first = (await rowOf(body.id)).billing_month;
    assert.ok(first, '전제가 깨졌다 — 청구월이 안 붙었다');

    await put(`/api/transactions/${body.id}`, tx({ merchant: '이름만변경' }));
    assert.equal((await rowOf(body.id)).billing_month, first);
  });

  test('D-4. settlement 를 바꾸면 다시 계산한다', async () => {
    // deferred → immediate 면 청구월이 없어야 한다. 남으면 카드대금에 잡힌다.
    const { body } = await post('/api/transactions', tx());
    assert.ok((await rowOf(body.id)).billing_month);

    await put(`/api/transactions/${body.id}`, tx({ settlement: 'immediate' }));
    assert.equal((await rowOf(body.id)).billing_month, null, 'immediate 로 바꿨는데 청구월이 남았다');
  });
});
