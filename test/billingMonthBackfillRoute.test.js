'use strict';
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const { startTestServer } = require('./helpers/testServer');

// 청구월 소급(#289).
//
// 청구월은 카드의 결제일·마감일에서 나오는데, 사용자는 **카드를 등록한 뒤에**
// 그 값을 채워 넣는다(명세서를 찾아봐야 알 수 있다). 그 사이에 쌓인 거래는
// 청구월이 빈 채로 남고 스스로 되살아나지 않는다.
//
// 비어 있으면 `cardUnpaid` 가 `unassigned` 로 빼고 `projectBalance` 는 추이에서
// 통째로 뺀다 — 앞으로 빠질 카드값이 없는 것처럼 보인다.
//
// 여기서 잠그는 것.
//   1. 프리뷰가 DB 를 안 바꾸는가 (ADR 0008)
//   2. 프리뷰를 건너뛸 수 없는가
//   3. `fill` 이 손으로 적은 값을 지키는가 — 되돌릴 수 없는 쪽이 더 비싸다
//   4. `recompute` 가 틀린 마감일로 나온 값을 고치는가
//   5. 프리뷰 뒤 **입력**이 바뀌면 막는가 (#419 C-3b 와 같은 구멍)

const PORT = 34719; // 다른 테스트와 겹치지 않는 포트
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
const preview = (body = {}) => post('/api/billing-month/backfill/preview', body);
const backfill = (body = {}) => post('/api/billing-month/backfill', body);

let categoryId;
let cardMethodId;
let cycleCard;   // 결제일 25 · 마감 12
let bareCard;    // 주기 없음

// 서버가 쓰는 것과 같은 파일을 직접 연다. 라우트를 거치지 않고 확인해야
// "프리뷰가 DB 를 바꿨는가" 를 라우트의 주장이 아니라 파일로 판정할 수 있다.
function openDb() {
  return new Database(server.dbPath, { readonly: true });
}

function snapshot() {
  const db = openDb();
  try {
    return db.prepare('SELECT id, settlement, billing_month FROM transactions ORDER BY id').all();
  } finally {
    db.close();
  }
}

async function addTx(over = {}) {
  const created = await post('/api/transactions', {
    date: '2026-05-15', category_id: categoryId, amount: 10000,
    payment_method_id: cardMethodId, merchant: '가맹점', ...over,
  });
  assert.strictEqual(created.status, 201, JSON.stringify(created.body));
  return created.body.id;
}

// 카드 주기를 나중에 넣는 실제 흐름을 재현한다. 카드를 주기 없이 만들어 거래를
// 쌓은 뒤 주기를 채우면, 그 거래들의 청구월은 빈 채로 남는다.
async function setCycle(cardId, cycle) {
  const r = await json(`/api/card-products/${cardId}`, {
    method: 'PUT', body: JSON.stringify(cycle),
  });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
}

before(async () => {
  server = await startTestServer({ port: PORT });

  const cats = await json('/api/categories');
  categoryId = (cats.body.data || cats.body)[0].id;

  const pms = await json('/api/payment-methods');
  const methods = pms.body.data || pms.body;
  cardMethodId = methods.find((m) => m.type === '신용').id;

  const mk = async (name, extra = {}) => {
    const r = await post('/api/card-products', {
      payment_method_id: cardMethodId, issuer: '테스트발급사',
      product_name: name, card_type: '신용', ...extra,
    });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body.id;
  };
  cycleCard = await mk('주기 있는 카드', { billing_cycle_day: 25, statement_close_day: 12 });
  bareCard = await mk('주기 없는 카드');
});

after(() => {
  if (server) server.stop();
});

// 각 케이스가 자기 거래만 보게 매번 비운다. 소급은 조건에 걸린 것을 전부
// 고치므로 앞 케이스가 남긴 거래가 건수에 섞이면 단언이 무의미해진다.
beforeEach(async () => {
  const list = await json('/api/transactions?limit=500');
  for (const t of list.body.data) {
    await json(`/api/transactions/${t.id}`, { method: 'DELETE' });
  }
});

describe('A. 프리뷰는 DB 를 바꾸지 않는다', () => {
  test('A-1. 프리뷰를 불러도 청구월이 그대로다', async () => {
    await addTx({ settlement: 'deferred', card_product_id: cycleCard });
    // 새 거래는 라우트가 이미 청구월을 계산한다. 소급 대상을 만들려면 주기가
    // 없던 시절의 거래를 흉내내야 한다 — 주기 없는 카드로 넣는다.
    await addTx({ settlement: 'deferred', card_product_id: bareCard });
    const before = snapshot();

    const r = await preview();
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));

    assert.deepStrictEqual(snapshot(), before);
  });

  test('A-2. 모드를 바꿔 가며 여러 번 불러도 그대로다', async () => {
    await addTx({ settlement: 'deferred', card_product_id: cycleCard });
    const before = snapshot();

    await preview({ mode: 'fill' });
    await preview({ mode: 'recompute' });
    await preview({ mode: 'fill', card_product_id: cycleCard });

    assert.deepStrictEqual(snapshot(), before);
  });
});

describe('B. 프리뷰를 건너뛸 수 없다', () => {
  test('B-1. 지문이 없으면 428 이다', async () => {
    await addTx({ settlement: 'deferred', card_product_id: bareCard });
    await setCycle(bareCard, { billing_cycle_day: 25, statement_close_day: 12 });

    const r = await backfill();
    assert.strictEqual(r.status, 428, JSON.stringify(r.body));
    assert.strictEqual(r.body.preview_required, true);

    await setCycle(bareCard, { billing_cycle_day: null, statement_close_day: null });
  });

  test('B-2. 틀린 지문은 409 다', async () => {
    await addTx({ settlement: 'deferred', card_product_id: bareCard });

    const r = await backfill({ preview_token: '엉뚱한지문' });
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.preview_stale, true);
  });
});

describe('C. 카드 주기를 나중에 넣은 경우 — 이 도구의 이유', () => {
  test('C-1. 주기를 채워도 옛 거래는 스스로 안 살아난다', async () => {
    const id = await addTx({ settlement: 'deferred', card_product_id: bareCard });
    assert.strictEqual(snapshot()[0].billing_month, null);

    await setCycle(bareCard, { billing_cycle_day: 25, statement_close_day: 12 });

    // 카드 상품을 고쳐도 거래는 그대로다. 이것이 소급이 필요한 이유다.
    assert.strictEqual(snapshot()[0].billing_month, null, '카드만 고치면 거래는 안 바뀐다');

    const p = await preview();
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    assert.strictEqual(p.body.count, 1);
    assert.strictEqual(p.body.filled, 1);

    const r = await backfill({ preview_token: p.body.preview_token });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.updated, 1);

    const after = snapshot()[0];
    assert.strictEqual(after.id, id);
    assert.strictEqual(after.billing_month, '2026-06');

    await setCycle(bareCard, { billing_cycle_day: null, statement_close_day: null });
  });

  test('C-2. 남은 건수를 화면 열기 전에 알 수 있다', async () => {
    await addTx({ settlement: 'deferred', card_product_id: bareCard });
    await addTx({ settlement: 'deferred', card_product_id: bareCard });
    await addTx({ settlement: 'immediate', card_product_id: cycleCard });

    const r = await json('/api/billing-month/missing-count');
    assert.strictEqual(r.status, 200);
    // 즉시 결제는 청구월이 없어야 정상이라 "빠진 것" 이 아니다.
    assert.strictEqual(r.body.missing, 2);
  });

  test('C-3. 즉시 결제 거래에는 청구월을 붙이지 않는다', async () => {
    await addTx({ settlement: 'immediate', card_product_id: cycleCard });

    const p = await preview();
    assert.strictEqual(p.body.count, 0);
  });
});

describe('D. fill 은 손으로 적은 값을 지킨다', () => {
  test('D-1. 이미 적힌 청구월은 건드리지 않는다', async () => {
    // 사용자가 명세서를 보고 직접 넣은 값. 계산값과 구분할 컬럼이 없으므로
    // 기본 모드는 그것을 지킨다 — 지워지면 무엇이었는지 알 방법이 없다.
    await addTx({ settlement: 'deferred', card_product_id: cycleCard, billing_month: '2026-09' });

    const p = await preview({ mode: 'fill' });
    assert.strictEqual(p.body.count, 0);
    assert.strictEqual(p.body.skipped_written, 1, '지나친 건수를 세어 알린다');

    assert.strictEqual(snapshot()[0].billing_month, '2026-09');
  });

  test('D-2. 모드를 안 주면 fill 이다', async () => {
    await addTx({ settlement: 'deferred', card_product_id: cycleCard, billing_month: '2026-09' });

    const p = await preview();
    assert.strictEqual(p.body.mode, 'fill');
    assert.strictEqual(p.body.count, 0);
  });

  test('D-3. 빈 것과 적힌 것이 섞여 있으면 빈 것만 센다', async () => {
    await addTx({ settlement: 'deferred', card_product_id: bareCard });
    await addTx({ settlement: 'deferred', card_product_id: cycleCard, billing_month: '2026-09' });
    await setCycle(bareCard, { billing_cycle_day: 25, statement_close_day: 12 });

    const p = await preview({ mode: 'fill' });
    assert.strictEqual(p.body.count, 1);
    assert.strictEqual(p.body.filled, 1);
    assert.strictEqual(p.body.skipped_written, 1);

    await setCycle(bareCard, { billing_cycle_day: null, statement_close_day: null });
  });
});

describe('E. recompute 는 틀린 값을 고친다', () => {
  test('E-1. 마감일을 고치면 옛 청구월이 다시 계산된다', async () => {
    // 마감일을 20 으로 잘못 적었다가 12 로 고치는 흐름. 5/15 구매는
    // 마감 20 이면 5월 마감(15 <= 20) → 결제일 25 > 20 이라 같은 달 = 2026-05.
    // 마감 12 로 고치면 6월 마감(15 > 12) → 25 > 12 라 같은 달 = 2026-06.
    await setCycle(cycleCard, { billing_cycle_day: 25, statement_close_day: 20 });
    await addTx({ settlement: 'deferred', card_product_id: cycleCard });
    assert.strictEqual(snapshot()[0].billing_month, '2026-05');

    await setCycle(cycleCard, { billing_cycle_day: 25, statement_close_day: 12 });
    assert.strictEqual(snapshot()[0].billing_month, '2026-05', '카드만 고치면 거래는 안 바뀐다');

    const p = await preview({ mode: 'recompute' });
    assert.strictEqual(p.body.count, 1);
    assert.strictEqual(p.body.rewritten, 1);
    assert.strictEqual(p.body.filled, 0);
    assert.strictEqual(p.body.samples[0].before, '2026-05');
    assert.strictEqual(p.body.samples[0].after, '2026-06');

    const r = await backfill({ mode: 'recompute', preview_token: p.body.preview_token });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(snapshot()[0].billing_month, '2026-06');
  });

  test('E-2. 주기를 지운 카드의 청구월은 지워진다', async () => {
    // 근거 없는 달에 묶인 채 남는 것보다 "아직 모른다" 가 낫다(#290).
    await addTx({ settlement: 'deferred', card_product_id: cycleCard });
    assert.strictEqual(snapshot()[0].billing_month, '2026-06');

    await setCycle(cycleCard, { billing_cycle_day: null, statement_close_day: null });

    const p = await preview({ mode: 'recompute' });
    assert.strictEqual(p.body.count, 1);
    assert.strictEqual(p.body.cleared, 1);

    const r = await backfill({ mode: 'recompute', preview_token: p.body.preview_token });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(snapshot()[0].billing_month, null);

    await setCycle(cycleCard, { billing_cycle_day: 25, statement_close_day: 12 });
  });

  test('E-3. 없는 모드는 400 이다', async () => {
    const r = await preview({ mode: '전부지워' });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
  });

  test('E-4. 즉시 결제인데 청구월이 남아 있으면 지운다', async () => {
    // 재분류로 `deferred` 를 벗은 거래에 옛 청구월이 남을 수 있다. 즉시 결제에
    // 청구월이 붙어 있으면 뜻이 겹치고(#289), 나중에 다시 `deferred` 가 되면
    // 근거 없는 달에 묶인 채 되살아난다.
    //
    // 그래서 후보를 `deferred` 로만 좁히면 안 된다 — **청구월이 적힌 행 전부**를
    // 본다. 좁히면 이 찌꺼기를 치울 방법이 없어진다.
    await addTx({ settlement: 'immediate', card_product_id: cycleCard, billing_month: '2026-09' });
    assert.strictEqual(snapshot()[0].billing_month, '2026-09');

    const p = await preview({ mode: 'recompute' });
    assert.strictEqual(p.body.count, 1, '즉시 결제도 청구월이 적혀 있으면 대상이다');
    assert.strictEqual(p.body.cleared, 1);
    assert.strictEqual(p.body.samples[0].after, null);

    const r = await backfill({ mode: 'recompute', preview_token: p.body.preview_token });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(snapshot()[0].billing_month, null);
  });
});

describe('F. 카드로 범위를 좁힌다', () => {
  test('F-1. 고른 카드의 거래만 센다', async () => {
    await addTx({ settlement: 'deferred', card_product_id: bareCard });
    const other = await post('/api/card-products', {
      payment_method_id: cardMethodId, issuer: '테스트발급사',
      product_name: '다른 카드 F1', card_type: '신용',
    });
    assert.strictEqual(other.status, 201, JSON.stringify(other.body));
    await addTx({ settlement: 'deferred', card_product_id: other.body.id });
    await setCycle(bareCard, { billing_cycle_day: 25, statement_close_day: 12 });
    await setCycle(other.body.id, { billing_cycle_day: 25, statement_close_day: 12 });

    const all = await preview();
    assert.strictEqual(all.body.count, 2);

    const one = await preview({ card_product_id: bareCard });
    assert.strictEqual(one.body.count, 1);
    assert.strictEqual(one.body.card.id, bareCard);

    await setCycle(bareCard, { billing_cycle_day: null, statement_close_day: null });
  });

  test('F-2. 없는 카드는 400 이다', async () => {
    const r = await preview({ card_product_id: 999999 });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
  });
});

describe('G. 프리뷰 뒤 입력이 바뀌면 막는다', () => {
  test('G-1. 구매일이 바뀌면 지문이 달라진다', async () => {
    // #419 의 C-3b 와 같은 계열이다. 지문에 **바뀔 값만** 담으면 부족하다 —
    // 청구월은 구매일에서 나오므로, 구매일이 바뀌면 사용자가 본 적 없는
    // 전 → 후가 적용된다. 건수도 id 목록도 그대로라 그냥은 안 걸린다.
    const id = await addTx({ settlement: 'deferred', card_product_id: bareCard });
    await setCycle(bareCard, { billing_cycle_day: 25, statement_close_day: 12 });

    const p = await preview();
    assert.strictEqual(p.body.count, 1);

    const edited = await json(`/api/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        date: '2026-05-01', category_id: categoryId, amount: 10000,
        payment_method_id: cardMethodId, card_product_id: bareCard,
        merchant: '가맹점', settlement: 'deferred',
      }),
    });
    assert.strictEqual(edited.status, 200, JSON.stringify(edited.body));

    const r = await backfill({ preview_token: p.body.preview_token });
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.preview_stale, true);

    await setCycle(bareCard, { billing_cycle_day: null, statement_close_day: null });
  });

  test('G-1b. 청구월은 그대로인데 구매일만 바뀌어도 막는다', async () => {
    // G-1 은 구매일을 고치면 라우트가 청구월도 다시 계산해 주므로, **청구월이
    // 달라진 덕에** 걸린다. 그건 구매일을 지문에 넣은 것에 대한 증명이 아니다.
    //
    // 여기서는 청구월을 손으로 고정한 채 구매일만 옮긴다. 저장된 청구월·결제
    // 방식·카드가 전부 그대로라 **구매일이 지문에 없으면 통과한다** — 그리고
    // 사용자가 본 적 없는 계산 결과가 적힌다.
    const id = await addTx({
      settlement: 'deferred', card_product_id: cycleCard, billing_month: '2026-09',
    });

    const p = await preview({ mode: 'recompute' });
    assert.strictEqual(p.body.count, 1);
    assert.strictEqual(p.body.samples[0].after, '2026-06');

    const edited = await json(`/api/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        date: '2026-04-05', category_id: categoryId, amount: 10000,
        payment_method_id: cardMethodId, card_product_id: cycleCard,
        merchant: '가맹점', settlement: 'deferred',
        billing_month: '2026-09', // 손으로 고정 — 저장된 값은 안 바뀐다
      }),
    });
    assert.strictEqual(edited.status, 200, JSON.stringify(edited.body));
    assert.strictEqual(snapshot()[0].billing_month, '2026-09', '저장된 청구월은 그대로다');

    const r = await backfill({ mode: 'recompute', preview_token: p.body.preview_token });
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(snapshot()[0].billing_month, '2026-09', '막혔으면 그대로여야 한다');
  });

  test('G-1c. 프리뷰 뒤 청구월만 손으로 바뀌어도 막는다', async () => {
    // #419 의 `C-3b` 와 같은 구멍이다. 건수도 id 목록도 그대로라 지문에 저장된
    // 청구월이 없으면 통과하고, **사용자가 방금 손으로 넣은 값**이 계산값으로
    // 덮인다.
    const id = await addTx({ settlement: 'deferred', card_product_id: bareCard });
    await setCycle(bareCard, { billing_cycle_day: 25, statement_close_day: 12 });

    const p = await preview();
    assert.strictEqual(p.body.count, 1);
    assert.strictEqual(p.body.filled, 1);

    const edited = await json(`/api/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        date: '2026-05-15', category_id: categoryId, amount: 10000,
        payment_method_id: cardMethodId, card_product_id: bareCard,
        merchant: '가맹점', settlement: 'deferred', billing_month: '2026-11',
      }),
    });
    assert.strictEqual(edited.status, 200, JSON.stringify(edited.body));

    const r = await backfill({ preview_token: p.body.preview_token });
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(snapshot()[0].billing_month, '2026-11', '손으로 넣은 값이 살아 있어야 한다');

    await setCycle(bareCard, { billing_cycle_day: null, statement_close_day: null });
  });

  // G-1b·G-1c 와 같은 방법으로 나머지 두 입력을 각각 고립시킨다. 청구월을 손으로
  // 고정해 두면 저장된 값이 안 움직이므로, 지문이 그 입력을 담고 있는지가
  // **단독으로** 드러난다. 담지 않으면 통과하고, 사용자가 본 적 없는 값이 적힌다.
  test('G-1d. 카드만 바뀌어도 막는다', async () => {
    const id = await addTx({
      settlement: 'deferred', card_product_id: cycleCard, billing_month: '2026-09',
    });
    const p = await preview({ mode: 'recompute' });
    assert.strictEqual(p.body.samples[0].after, '2026-06');

    // 주기 없는 카드로 옮기면 계산 결과가 null 이 된다 — 프리뷰가 예고한 것과 다르다.
    const edited = await json(`/api/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        date: '2026-05-15', category_id: categoryId, amount: 10000,
        payment_method_id: cardMethodId, card_product_id: bareCard,
        merchant: '가맹점', settlement: 'deferred', billing_month: '2026-09',
      }),
    });
    assert.strictEqual(edited.status, 200, JSON.stringify(edited.body));
    assert.strictEqual(snapshot()[0].billing_month, '2026-09');

    const r = await backfill({ mode: 'recompute', preview_token: p.body.preview_token });
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
  });

  test('G-1e. 결제 방식만 바뀌어도 막는다', async () => {
    const id = await addTx({
      settlement: 'deferred', card_product_id: cycleCard, billing_month: '2026-09',
    });
    const p = await preview({ mode: 'recompute' });
    assert.strictEqual(p.body.samples[0].after, '2026-06');

    // 즉시 결제가 되면 청구월이 없어야 맞다 — 프리뷰가 예고한 '2026-06' 이 아니다.
    const edited = await json(`/api/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        date: '2026-05-15', category_id: categoryId, amount: 10000,
        payment_method_id: cardMethodId, card_product_id: cycleCard,
        merchant: '가맹점', settlement: 'immediate', billing_month: '2026-09',
      }),
    });
    assert.strictEqual(edited.status, 200, JSON.stringify(edited.body));
    assert.strictEqual(snapshot()[0].billing_month, '2026-09');

    const r = await backfill({ mode: 'recompute', preview_token: p.body.preview_token });
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
  });

  test('G-2. 대상이 늘면 지문이 달라진다', async () => {
    await addTx({ settlement: 'deferred', card_product_id: bareCard });
    await setCycle(bareCard, { billing_cycle_day: 25, statement_close_day: 12 });

    const p = await preview();
    await addTx({ settlement: 'deferred', card_product_id: bareCard, date: '2026-07-03' });

    const r = await backfill({ preview_token: p.body.preview_token });
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));

    await setCycle(bareCard, { billing_cycle_day: null, statement_close_day: null });
  });
});

describe('H. 실행취소', () => {
  test('H-1. 소급 전체가 한 작업으로 묶여 되돌아간다', async () => {
    await addTx({ settlement: 'deferred', card_product_id: bareCard });
    await addTx({ settlement: 'deferred', card_product_id: bareCard, date: '2026-06-03' });
    await setCycle(bareCard, { billing_cycle_day: 25, statement_close_day: 12 });

    const p = await preview();
    assert.strictEqual(p.body.count, 2);
    assert.strictEqual(p.body.undoable, true);
    await backfill({ preview_token: p.body.preview_token });
    assert.ok(snapshot().every((t) => t.billing_month !== null));

    const undoable = await json('/api/audit/undoable');
    assert.strictEqual(undoable.body.undoable.affected, 2);
    assert.match(undoable.body.undoable.label, /청구월 소급/);

    const undone = await post('/api/audit/undo', { action_id: undoable.body.undoable.action_id });
    assert.strictEqual(undone.status, 200, JSON.stringify(undone.body));

    assert.ok(snapshot().every((t) => t.billing_month === null),
      '되돌린 뒤에는 전부 비어 있어야 한다');

    await setCycle(bareCard, { billing_cycle_day: null, statement_close_day: null });
  });
});
