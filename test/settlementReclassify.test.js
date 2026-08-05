'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const { startTestServer } = require('./helpers/testServer');

// 결제 방식 일괄 재분류(#289) — 프리뷰 → 확인 → 실행.
//
// **이 파일이 지키는 것은 ADR 0008 의 두 지점이다.**
//
//   1. 프리뷰가 조용히 쓰기를 하면 원칙이 무의미해진다
//      → "프리뷰만 실행하고 데이터가 그대로인지" 를 고정한다
//   2. 화면에서만 막고 엔드포인트가 열려 있으면 원칙이 반쪽이 된다
//      → 지문 없이 부르면 거부되는지 고정한다
//
// 021 이 기존 거래를 전부 immediate 로 남긴 것은 **자동 변환을 안 하기로 한
// 결정**이다. 이 도구가 그 결정의 반대편(사용자가 직접 지정하는 길)이다.

const PORT = 34645;
let server;
const ids = {};

async function json(pathname, options) {
  const r = await fetch(`${server.base}${pathname}`, {
    headers: { 'Content-Type': 'application/json' }, ...options,
  });
  return { status: r.status, body: await r.json() };
}
const post = (p, b) => json(p, { method: 'POST', body: JSON.stringify(b) });

const preview = (b) => post('/api/settlement/reclassify/preview', b);
const execute = (b) => post('/api/settlement/reclassify', b);

// DB 를 직접 열어 본다. 라우트를 거치면 "안 바뀌었다" 를 라우트가 보증하는
// 꼴이라 프리뷰 무해성 검사가 성립하지 않는다.
function settlementCounts() {
  const db = new Database(server.dbPath, { readonly: true });
  const rows = db.prepare(
    "SELECT COALESCE(settlement,'immediate') AS s, COUNT(*) AS c FROM transactions GROUP BY 1"
  ).all();
  db.close();
  return Object.fromEntries(rows.map((r) => [r.s, r.c]));
}

async function seed() {
  const db = new Database(server.dbPath);
  db.prepare('DELETE FROM transactions').run();
  db.close();

  for (const [date, amount, merchant] of [
    ['2026-07-05', 30000, '카드결제1'],
    ['2026-07-12', 50000, '카드결제2'],
    ['2026-08-01', 20000, '카드결제3'],
  ]) {
    await post('/api/transactions', {
      date, amount, category_id: ids.cat, payment_method_id: ids.cardPm, merchant,
    });
  }
  // 다른 결제수단 — 범위 밖이어야 한다.
  await post('/api/transactions', {
    date: '2026-07-20', amount: 90000, category_id: ids.cat,
    payment_method_id: ids.cashPm, merchant: '현금결제',
  });
}

before(async () => {
  server = await startTestServer({ port: PORT });

  const { body: pms } = await json('/api/payment-methods');
  const list = pms.data || pms;
  ids.cardPm = list.find((p) => p.type === '신용').id;
  ids.cashPm = list.find((p) => p.type === '현금성').id;

  const { body: cats } = await json('/api/categories');
  ids.cat = (cats.data || cats).find((c) => c.major_type === '선택지출').id;

  // 통장을 만들고 카드 결제수단을 붙인다. 잔액 영향을 보려면 계좌가 필요하다.
  const { body: acc } = await post('/api/accounts', {
    name: '주거래통장', type: '입출금', opening_date: '2026-01-01', opening_balance: 1000000,
  });
  ids.account = acc.id;
  await json(`/api/payment-methods/${ids.cardPm}`, {
    method: 'PUT',
    body: JSON.stringify({ name: '신용카드', type: '신용', account_id: ids.account }),
  });

  await seed();
});

after(() => server && server.stop());

describe('A. 프리뷰는 DB 를 바꾸지 않는다', () => {
  test('A-1. 프리뷰를 여러 번 불러도 데이터가 그대로다', async () => {
    // ADR 0008 의 "지켜지지 않을 수 있는 지점" 중 하나. 조건을 고칠 때마다
    // 화면이 다시 부르므로, 여기서 쓰기가 일어나면 보는 동안 데이터가 바뀐다.
    const before = settlementCounts();

    for (let i = 0; i < 3; i++) {
      const { status } = await preview({ payment_method_id: ids.cardPm, settlement: 'deferred' });
      assert.equal(status, 200);
    }

    assert.deepEqual(settlementCounts(), before, '프리뷰가 데이터를 바꿨다');
  });

  test('A-2. 무엇이 몇 건 바뀌는지 알린다', async () => {
    const { body } = await preview({ payment_method_id: ids.cardPm, settlement: 'deferred' });

    assert.equal(body.count, 3, '다른 결제수단 거래가 섞였거나 빠졌다');
    assert.equal(body.target.settlement, 'deferred');
    assert.ok(body.preview_token, '지문이 없다');
  });

  test('A-3. 전 → 후 대표 사례를 준다', async () => {
    // 숫자만으로는 판단이 안 된다(ADR 0008).
    const { body } = await preview({ payment_method_id: ids.cardPm, settlement: 'deferred' });
    const s = body.samples[0];

    assert.ok(s.merchant, '가맹점이 없다');
    assert.equal(s.before, 'immediate');
    assert.equal(s.after, 'deferred');
  });

  test('A-4. 되돌릴 수 있는지 알린다', async () => {
    const { body } = await preview({ payment_method_id: ids.cardPm, settlement: 'deferred' });
    assert.equal(body.undoable, true);
  });

  test('A-5. 이미 그 값인 거래는 세지 않는다', async () => {
    // "3건이 바뀐다" 가 사실이어야 한다. 안 바뀌는 것을 세면 거짓이다.
    const { body } = await preview({ payment_method_id: ids.cardPm, settlement: 'immediate' });
    assert.equal(body.count, 0);
  });

  test('A-6. 기간을 좁히면 건수가 준다', async () => {
    const { body } = await preview({
      payment_method_id: ids.cardPm, settlement: 'deferred', from: '2026-07-01', to: '2026-07-31',
    });
    assert.equal(body.count, 2, '8월 거래가 7월 범위에 들어왔다');
  });
});

describe('B. 잔액 영향을 먼저 보여준다', () => {
  test('B-1. 계좌별로 전 → 후 잔액을 준다', async () => {
    // #289 의 명시 요건. 합계만 주면 어느 통장인지 몰라 대조할 수 없다.
    const { body } = await preview({ payment_method_id: ids.cardPm, settlement: 'deferred' });
    const impact = body.impact.find((i) => i.accountId === ids.account);

    assert.ok(impact, '영향받는 계좌가 안 나왔다');
    assert.equal(typeof impact.balanceBefore, 'number');
    assert.equal(typeof impact.balanceAfter, 'number');
  });

  test('B-2. deferred 로 바꾸면 잔액이 늘어난다', async () => {
    // 신용카드로 긁은 돈은 아직 통장에 있다. 잔액에서 빠지지 않게 된다.
    const { body } = await preview({ payment_method_id: ids.cardPm, settlement: 'deferred' });
    const impact = body.impact.find((i) => i.accountId === ids.account);

    assert.ok(impact.balanceDelta > 0, `잔액이 안 늘었다: ${impact.balanceDelta}`);
    assert.equal(impact.balanceAfter - impact.balanceBefore, impact.balanceDelta);
  });

  test('B-3. 늘어난 잔액만큼 카드 미결제액이 는다', async () => {
    // 돈이 생긴 게 아니라 나갈 돈이 카드 쪽으로 옮겨 간 것이다. 이걸 같이
    // 안 보여주면 사용자는 잔액이 늘었다고 읽는다.
    const { body } = await preview({ payment_method_id: ids.cardPm, settlement: 'deferred' });
    const i = body.impact.find((x) => x.accountId === ids.account);

    assert.ok(i.cardUnpaidAfter > i.cardUnpaidBefore, '미결제액이 안 늘었다');
  });

  test('B-4. 바뀔 게 없으면 영향도 없다', async () => {
    const { body } = await preview({ payment_method_id: ids.cardPm, settlement: 'immediate' });
    assert.deepEqual(body.impact, []);
  });
});

describe('C. 확인 없이는 못 바꾼다', () => {
  test('C-1. 지문이 없으면 428 이다', async () => {
    // 화면에서만 막고 엔드포인트가 열려 있으면 원칙이 반쪽이 된다(ADR 0008).
    const before = settlementCounts();
    const { status, body } = await execute({ payment_method_id: ids.cardPm, settlement: 'deferred' });

    assert.equal(status, 428);
    assert.equal(body.preview_required, true);
    assert.deepEqual(settlementCounts(), before, '지문 없이 데이터가 바뀌었다');
  });

  test('C-2. 지문이 틀리면 409 다', async () => {
    const before = settlementCounts();
    const { status, body } = await execute({
      payment_method_id: ids.cardPm, settlement: 'deferred', preview_token: 'deadbeef',
    });

    assert.equal(status, 409);
    assert.equal(body.preview_stale, true);
    assert.deepEqual(settlementCounts(), before);
  });

  test('C-3. 프리뷰 뒤 대상이 달라지면 거부한다', async () => {
    const { body: p } = await preview({ payment_method_id: ids.cardPm, settlement: 'deferred' });

    // 그 사이 거래가 하나 더 들어온다.
    await post('/api/transactions', {
      date: '2026-07-25', amount: 7000, category_id: ids.cat,
      payment_method_id: ids.cardPm, merchant: '나중에추가',
    });

    const { status, body } = await execute({
      payment_method_id: ids.cardPm, settlement: 'deferred', preview_token: p.preview_token,
    });

    assert.equal(status, 409, '대상이 달라졌는데 그대로 실행했다');
    assert.equal(body.preview_stale, true);

    await seed();  // 다음 테스트를 위해 되돌린다
  });

  test('C-3b. 건수가 그대로여도 대상의 상태가 바뀌면 거부한다', async () => {
    // C-3 는 거래가 **추가**되는 경우다. 그건 id 목록이 달라져서 잡힌다.
    //
    // 여기는 id 목록이 그대로인데 **어느 한 건의 현재 상태만** 바뀐 경우다.
    // 지문이 id·금액만 담으면 이걸 못 잡고, 사용자가 본 적 없는 상태의 거래가
    // 조용히 재분류된다.
    await seed();
    const { body: p } = await preview({ payment_method_id: ids.cardPm, settlement: 'deferred' });
    const targetId = p.samples[0].id;

    // 대상 하나를 다른 값으로 바꾼다. 여전히 deferred 가 아니라 범위 안에 남는다.
    const { body: list } = await json('/api/transactions?limit=200');
    const row = (list.data || list).find((t) => t.id === targetId);
    await json(`/api/transactions/${targetId}`, {
      method: 'PUT',
      body: JSON.stringify({
        date: row.date, amount: row.amount, category_id: row.category_id,
        payment_method_id: row.payment_method_id, merchant: row.merchant,
        settlement: 'settlement',
      }),
    });

    const after = await preview({ payment_method_id: ids.cardPm, settlement: 'deferred' });
    assert.equal(after.body.count, p.count, '전제가 깨졌다 — 건수가 달라졌으면 id 로도 잡힌다');

    const { status, body } = await execute({
      payment_method_id: ids.cardPm, settlement: 'deferred', preview_token: p.preview_token,
    });

    assert.equal(status, 409, '대상의 상태가 바뀌었는데 옛 지문으로 실행됐다');
    assert.equal(body.preview_stale, true);

    await seed();
  });

  test('C-4. 잘못된 입력은 400 이고 사용자 말로 답한다', async () => {
    for (const b of [
      {},
      { payment_method_id: ids.cardPm },
      { payment_method_id: ids.cardPm, settlement: 'nonsense' },
      { payment_method_id: 999999, settlement: 'deferred' },
      { payment_method_id: ids.cardPm, settlement: 'deferred', from: '2026-7-1' },
      { payment_method_id: ids.cardPm, settlement: 'deferred', from: '2026-08-01', to: '2026-07-01' },
    ]) {
      const { status, body } = await preview(b);
      assert.equal(status, 400, JSON.stringify(b));
      assert.match(body.error, /[가-힣]/, `내부 용어가 샜다: ${body.error}`);
      assert.doesNotMatch(body.error, /payment_method_id|settlement|undefined/);
    }
  });
});

describe('D. 실행', () => {
  test('D-1. 지문이 맞으면 바꾸고 결과를 알린다', async () => {
    const { body: p } = await preview({ payment_method_id: ids.cardPm, settlement: 'deferred' });
    const { status, body } = await execute({
      payment_method_id: ids.cardPm, settlement: 'deferred', preview_token: p.preview_token,
    });

    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.updated, p.count, '프리뷰에서 본 건수와 다르다');
    assert.equal(settlementCounts().deferred, 3);
  });

  test('D-2. 실행 후에도 무엇이 달라졌는지 준다', async () => {
    // 다시 계산하면 대상이 0건이라 빈 배열이 된다. 쓰기 전 값을 실어야 한다.
    await seed();
    const { body: p } = await preview({ payment_method_id: ids.cardPm, settlement: 'deferred' });
    const { body } = await execute({
      payment_method_id: ids.cardPm, settlement: 'deferred', preview_token: p.preview_token,
    });

    assert.ok(body.impact.length > 0, '실행 결과에 영향이 비어 있다');
    assert.ok(body.impact[0].balanceDelta > 0);
  });

  test('D-3. 범위 밖 거래는 안 건드린다', async () => {
    await seed();
    const { body: p } = await preview({ payment_method_id: ids.cardPm, settlement: 'deferred' });
    await execute({ payment_method_id: ids.cardPm, settlement: 'deferred', preview_token: p.preview_token });

    const db = new Database(server.dbPath, { readonly: true });
    const cash = db.prepare(
      "SELECT COALESCE(settlement,'immediate') AS s FROM transactions WHERE merchant='현금결제'"
    ).get();
    db.close();

    assert.equal(cash.s, 'immediate', '다른 결제수단 거래까지 바뀌었다');
  });

  test('D-4. 감사 이력에 이름이 남는다', async () => {
    // 수백 건짜리 작업이 이름 없이 묶여 있으면 되돌릴지 판단할 근거가 없다(#298).
    await seed();
    const { body: p } = await preview({ payment_method_id: ids.cardPm, settlement: 'deferred' });
    await execute({ payment_method_id: ids.cardPm, settlement: 'deferred', preview_token: p.preview_token });

    const db = new Database(server.dbPath, { readonly: true });
    const label = db.prepare(
      "SELECT action_label FROM audit_log WHERE action_label IS NOT NULL ORDER BY id DESC LIMIT 1"
    ).get();
    db.close();

    assert.ok(label, '라벨이 안 남았다');
    assert.match(label.action_label, /재분류/);
  });
});

// 재분류는 `settlement` 을 바꾼다. 그런데 그 값은 `billing_month` 의 **입력**이다
// (#289). 거래 하나를 PUT 으로 고치는 경로는 입력이 바뀌면 청구월을 다시
// 계산하는데, 대량 재분류에는 그게 없었다.
//
//   deferred 로 바꾸면      청구월이 빈 채로 남는다
//   deferred 에서 벗어나면  옛 청구월이 그대로 남는다 — 뜻이 겹친다
//
// 청구월이 비면 `cardUnpaid` 가 `unassigned` 로 빼고 `projectBalance` 는 그
// 거래를 추이에서 통째로 뺀다. **재분류의 목적이 바로 그 두 계산을 맞추는
// 것**이라, 청구월을 안 채우면 절반만 한 셈이 된다.
function billingRows() {
  const db = new Database(server.dbPath, { readonly: true });
  const rows = db.prepare(
    "SELECT id, merchant, COALESCE(settlement,'immediate') AS settlement, billing_month"
    + ' FROM transactions ORDER BY id'
  ).all();
  db.close();
  return rows;
}

// 결제일 25 · 마감 12 인 카드를 만들어 대상 거래에 붙인다. 청구월이 실제로
// 계산되려면 주기를 아는 카드가 있어야 한다.
//
// 이름을 케이스마다 다르게 준다. 같은 카드사에 같은 이름은 409 라, 고정 이름을
// 쓰면 **두 번째 케이스부터 카드가 안 만들어지고 id 가 undefined 가 된다** —
// 그러면 청구월이 안 붙는데 테스트는 "계산이 틀렸다" 처럼 보인다.
let cycleCardSeq = 0;
async function attachCycleCard() {
  const { status, body: card } = await post('/api/card-products', {
    payment_method_id: ids.cardPm, issuer: '테스트발급사',
    product_name: `주기카드 ${++cycleCardSeq}`,
    card_type: '신용', billing_cycle_day: 25, statement_close_day: 12,
  });
  assert.equal(status, 201, JSON.stringify(card));

  const { body: remapPlan } = await post('/api/card-products/remap/preview', { card_product_id: card.id });
  const applied = await post('/api/card-products/remap', {
    card_product_id: card.id, preview_token: remapPlan.preview_token,
  });
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  return card.id;
}

describe('E. 재분류가 청구월을 따라 고친다', () => {
  test('E-1. deferred 로 바꾸면 청구월이 채워진다', async () => {
    await seed();
    await attachCycleCard();

    const { body: plan } = await preview({ payment_method_id: ids.cardPm, settlement: 'deferred' });
    assert.equal(plan.count, 3);
    // 7/5 · 7/12 는 마감 12 기준 7월 마감 → 결제일 25 > 12 라 같은 달 = 2026-07.
    // 8/1 은 8월 마감 → 2026-08.
    assert.equal(plan.billing_month_filled, 3, '세 건 다 채워져야 한다');
    assert.equal(plan.billing_month_cleared, 0);

    const { status } = await execute({
      payment_method_id: ids.cardPm, settlement: 'deferred', preview_token: plan.preview_token,
    });
    assert.equal(status, 200);

    const rows = billingRows().filter((r) => r.settlement === 'deferred');
    assert.equal(rows.length, 3);
    assert.ok(rows.every((r) => /^\d{4}-\d{2}$/.test(r.billing_month || '')),
      `청구월이 안 채워졌다: ${JSON.stringify(rows)}`);
  });

  test('E-2. deferred 에서 벗어나면 옛 청구월을 지운다', async () => {
    // 즉시 결제에 청구월이 남아 있으면 뜻이 겹친다 — 청구월은 "무엇이 언제
    // 청구되는가" 라서 인출 자체에 붙이면 이중으로 읽힌다.
    await seed();
    await attachCycleCard();
    const { body: toDeferred } = await preview({ payment_method_id: ids.cardPm, settlement: 'deferred' });
    await execute({
      payment_method_id: ids.cardPm, settlement: 'deferred', preview_token: toDeferred.preview_token,
    });
    assert.ok(billingRows().some((r) => r.billing_month !== null));

    const { body: back } = await preview({ payment_method_id: ids.cardPm, settlement: 'immediate' });
    assert.equal(back.billing_month_cleared, 3);
    assert.equal(back.billing_month_filled, 0);

    const { status } = await execute({
      payment_method_id: ids.cardPm, settlement: 'immediate', preview_token: back.preview_token,
    });
    assert.equal(status, 200);

    const rows = billingRows().filter((r) => r.merchant && r.merchant.startsWith('카드결제'));
    assert.ok(rows.every((r) => r.billing_month === null),
      `옛 청구월이 남았다: ${JSON.stringify(rows)}`);
  });

  test('E-3. 카드 주기를 모르면 안 적는다 — 추측하지 않는다', async () => {
    // 카드 상품이 안 붙은 거래는 주기를 알 수 없다. 추측한 청구월로 묶으면
    // 사용자가 결제일에 빠질 금액을 잘못 본다(#290).
    await seed();

    const { body: plan } = await preview({ payment_method_id: ids.cardPm, settlement: 'deferred' });
    assert.equal(plan.count, 3);
    assert.equal(plan.billing_month_filled, 0);

    await execute({
      payment_method_id: ids.cardPm, settlement: 'deferred', preview_token: plan.preview_token,
    });
    const rows = billingRows().filter((r) => r.settlement === 'deferred');
    assert.ok(rows.every((r) => r.billing_month === null));
  });

  test('E-4. 대표 사례가 청구월 전 → 후를 보여준다', async () => {
    await seed();
    await attachCycleCard();

    const { body: plan } = await preview({ payment_method_id: ids.cardPm, settlement: 'deferred' });
    const s = plan.samples[0];
    assert.equal(s.billing_month_before, null);
    assert.ok(/^\d{4}-\d{2}$/.test(s.billing_month_after), JSON.stringify(s));
  });

  // E-5 는 저장된 청구월이 움직여서 걸린다. 그것만으로는 **구매일·카드가 지문에
  // 들어 있는지**를 증명하지 못한다 — 실제로 그 둘을 빼도 E-5 는 통과했다.
  //
  // 그래서 청구월을 손으로 고정한 채 입력만 옮긴다. 저장된 값이 안 움직이므로
  // 각 입력이 지문에 담겼는지가 단독으로 드러난다.
  test('E-5b. 청구월은 그대로인데 구매일만 바뀌어도 막는다', async () => {
    await seed();
    const cardId = await attachCycleCard();
    const target = billingRows().find((r) => r.merchant === '카드결제1');

    // 청구월을 **프리뷰 전에** 손으로 박아 둔다. 이렇게 해야 프리뷰 뒤의 수정이
    // 저장된 청구월을 안 움직이고, 구매일만 달라진 상태가 만들어진다.
    const pinned = (over) => json(`/api/transactions/${target.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        date: '2026-07-05', category_id: ids.cat, amount: 30000,
        payment_method_id: ids.cardPm, card_product_id: cardId,
        merchant: '카드결제1', billing_month: '2026-07', ...over,
      }),
    });
    assert.equal((await pinned({})).status, 200);
    assert.equal(billingRows().find((r) => r.id === target.id).billing_month, '2026-07');

    const { body: plan } = await preview({ payment_method_id: ids.cardPm, settlement: 'deferred' });
    assert.equal(plan.count, 3);

    const edited = await pinned({ date: '2026-07-20' });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal(billingRows().find((r) => r.id === target.id).billing_month, '2026-07',
      '저장된 청구월은 그대로여야 이 케이스가 성립한다');

    const { status, body } = await execute({
      payment_method_id: ids.cardPm, settlement: 'deferred', preview_token: plan.preview_token,
    });
    assert.equal(status, 409, JSON.stringify(body));
  });

  test('E-5c. 청구월은 그대로인데 카드만 바뀌어도 막는다', async () => {
    await seed();
    const cardId = await attachCycleCard();
    const { status: bareStatus, body: bare } = await post('/api/card-products', {
      payment_method_id: ids.cardPm, issuer: '테스트발급사',
      product_name: `주기없는카드 ${++cycleCardSeq}`, card_type: '신용',
    });
    assert.equal(bareStatus, 201, JSON.stringify(bare));

    const target = billingRows().find((r) => r.merchant === '카드결제1');
    const pinned = (cardProductId) => json(`/api/transactions/${target.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        date: '2026-07-05', category_id: ids.cat, amount: 30000,
        payment_method_id: ids.cardPm, card_product_id: cardProductId,
        merchant: '카드결제1', billing_month: '2026-07',
      }),
    });
    assert.equal((await pinned(cardId)).status, 200);
    assert.equal(billingRows().find((r) => r.id === target.id).billing_month, '2026-07');

    const { body: plan } = await preview({ payment_method_id: ids.cardPm, settlement: 'deferred' });
    assert.equal(plan.count, 3);

    // 주기를 모르는 카드로 옮기면 계산 결과가 null 이 된다 — 프리뷰가 예고한
    // 값과 다르다. 저장된 청구월은 그대로라 카드가 지문에 없으면 통과한다.
    const edited = await pinned(bare.id);
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal(billingRows().find((r) => r.id === target.id).billing_month, '2026-07',
      '저장된 청구월은 그대로여야 이 케이스가 성립한다');

    const { status, body } = await execute({
      payment_method_id: ids.cardPm, settlement: 'deferred', preview_token: plan.preview_token,
    });
    assert.equal(status, 409, JSON.stringify(body));
  });

  test('E-5. 프리뷰 뒤 청구월만 달라져도 지문이 막는다', async () => {
    // #419 가 `C-3b` 로 잡은 것과 같은 계열이다. 지문이 `billing_month` 를
    // 담지 않으면 건수도 id 목록도 그대로라 통과하고, 사용자가 본 적 없는
    // 상태의 거래가 덮인다.
    await seed();
    const cardId = await attachCycleCard();

    const { body: plan } = await preview({ payment_method_id: ids.cardPm, settlement: 'deferred' });
    const target = billingRows().find((r) => r.merchant === '카드결제1');

    const edited = await json(`/api/transactions/${target.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        date: '2026-07-05', category_id: ids.cat, amount: 30000,
        payment_method_id: ids.cardPm, card_product_id: cardId,
        merchant: '카드결제1', billing_month: '2026-12',
      }),
    });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));

    const { status, body } = await execute({
      payment_method_id: ids.cardPm, settlement: 'deferred', preview_token: plan.preview_token,
    });
    assert.equal(status, 409, JSON.stringify(body));
    assert.equal(body.preview_stale, true);
  });
});
