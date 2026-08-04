'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

// 카드 전략 조회의 DB 배선(#276).
//
// 순수 함수(cardStrategy·cardThreshold·cardComparison)는 각자 테스트가 있다.
// **여기서 확인하는 것은 배선이다** — 실적 구간이 실제 쿼리 범위로 쓰이는지,
// 수입과 파생 거래가 실제로 안 섞이는지, 카드가 없을 때 500 이 아니라 빈
// 결과가 나오는지.

const PORT = 34633;
let server;
let ids = {};

async function json(pathname, options) {
  const r = await fetch(`${server.base}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return { status: r.status, body: await r.json() };
}

const post = (p, body) => json(p, { method: 'POST', body: JSON.stringify(body) });

async function firstId(pathname, pick = (x) => x[0]) {
  const { body } = await json(pathname);
  const list = body.data || body;
  return pick(list).id;
}

before(async () => {
  server = await startTestServer({ port: PORT });

  // 결제수단 — 시드에 카드사가 들어 있다.
  const { body: pms } = await json('/api/payment-methods');
  const pmList = pms.data || pms;
  ids.cardPm = pmList.find((p) => p.type === '신용').id;
  ids.cashPm = pmList.find((p) => p.type === '현금성').id;

  // 상품마다 결제수단을 따로 둔다. 한 결제수단에 상품이 둘이면 상품 특정이
  // 모호해져서(#302 의 B 안) 계산에서 빠지는데, 그건 D-4 에서 따로 본다.
  ids.cardPm2 = (await post('/api/payment-methods', { name: '테스트카드2', type: '신용' })).body.id;
  ids.orphanPm = (await post('/api/payment-methods', { name: '상품없는카드', type: '신용' })).body.id;

  const { body: cats } = await json('/api/categories');
  const catList = cats.data || cats;
  ids.expenseCat = catList.find((c) => c.major_type === '선택지출').id;
  ids.incomeCat = catList.find((c) => c.major_type === '수입').id;
});

after(() => server && server.stop());

describe('A. 카드가 없어도 깨지지 않는다', () => {
  test('A-1. 실적 목록은 빈 배열이다', async () => {
    const { status, body } = await json('/api/card-strategy/thresholds');
    assert.equal(status, 200);
    assert.deepEqual(body.data, []);
  });

  test('A-2. 사후 분석은 비교 불가로 답한다', async () => {
    const { status, body } = await json('/api/card-strategy/comparison');
    assert.equal(status, 200);
    assert.equal(body.comparable, false);
    assert.equal(body.reason, 'single-card');
  });

  test('A-3. 추정은 금액이 없으면 400 이다', async () => {
    assert.equal((await json('/api/card-strategy/estimate')).status, 400);
    assert.equal((await json('/api/card-strategy/estimate?amount=0')).status, 400);
    assert.equal((await json('/api/card-strategy/estimate?amount=abc')).status, 400);
  });
});

describe('B. 실적 구간이 쿼리 범위로 쓰인다', () => {
  before(async () => {
    // 마감일 6일, 실적 조건 30만원.
    await post('/api/card-products', {
      payment_method_id: ids.cardPm, issuer: '테스트카드', product_name: '실적카드',
      card_type: '신용', statement_close_day: 6, billing_cycle_day: 25,
      prev_month_threshold: 300000,
    });
    ids.card = await firstId('/api/card-products', (l) => l.find((c) => c.product_name === '실적카드'));

    // asOf 2026-08-04 기준 실적 구간은 전월 달력월 7/1 ~ 7/31 이다.
    // 마감일 6일을 넣어 두는 이유는 **그 값이 실적에 안 쓰이는지 보기 위해서**다.
    // card_product_id 를 안 보낸다. **쓰는 곳이 없기 때문이다** — 거래 입력은
    // 결제수단만 고른다. 상품 특정은 결제수단을 되짚어 나온다.
    const tx = (date, amount, over = {}) => post('/api/transactions', {
      date, amount, category_id: ids.expenseCat, payment_method_id: ids.cardPm,
      merchant: '테스트', ...over,
    });

    await tx('2026-06-30', 500000);  // 구간 직전 — 세면 안 된다
    await tx('2026-07-01', 200000);  // 1일 — 포함
    await tx('2026-07-31', 100000);  // 말일 — 포함
    await tx('2026-08-01', 500000);  // 구간 직후 — 세면 안 된다
  });

  test('B-1. 전월 달력월만 합산한다', async () => {
    const { body } = await json('/api/card-strategy/thresholds?asOf=2026-08-04');
    const row = body.data.find((c) => c.cardProductId === ids.card);

    assert.deepEqual(row.period, { start: '2026-07-01', end: '2026-07-31' });
    assert.equal(row.spend, 300000, '구간 밖 거래가 실적에 들어갔다');
    assert.equal(row.counted, 2);
    assert.equal(row.met, true);
  });

  test('B-2. 수입은 실적에서 빠진다', async () => {
    await post('/api/transactions', {
      date: '2026-07-10', amount: 9000000, category_id: ids.incomeCat,
      payment_method_id: ids.cardPm, merchant: '월급',
    });

    const { body } = await json('/api/card-strategy/thresholds?asOf=2026-08-04');
    const row = body.data.find((c) => c.cardProductId === ids.card);

    assert.equal(row.spend, 300000, '수입이 실적에 들어갔다');
    assert.equal(row.excluded.income, 1);
  });

  test('B-3. 추정임을 항상 알린다', async () => {
    // 카드사 실적 제외 항목(세금·상품권 등)을 우리는 모른다.
    const { body } = await json('/api/card-strategy/thresholds?asOf=2026-08-04');
    assert.equal(body.data.every((c) => c.estimated === true), true);
  });

  test('B-4. asOf 를 안 주면 오늘로 본다', async () => {
    const { body } = await json('/api/card-strategy/thresholds');
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(body.asOf), `asOf 가 날짜가 아니다: ${body.asOf}`);
  });

  test('B-5. 잘못된 asOf 는 500 이 아니라 오늘로 떨어진다', async () => {
    const { status, body } = await json('/api/card-strategy/thresholds?asOf=2026-8-4');
    assert.equal(status, 200);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(body.asOf));
  });
});

describe('C. 지금 결제하면 어느 카드가 나은가', () => {
  before(async () => {
    await post('/api/card-benefits', {
      card_product_id: ids.card, benefit_type: '적립', rate: 5,
    });

    // 실적을 못 채운 두 번째 카드.
    await post('/api/card-products', {
      payment_method_id: ids.cardPm2, issuer: '테스트카드', product_name: '미달카드',
      card_type: '신용', statement_close_day: 6, prev_month_threshold: 9000000,
    });
    ids.card2 = await firstId('/api/card-products', (l) => l.find((c) => c.product_name === '미달카드'));
    await post('/api/card-benefits', {
      card_product_id: ids.card2, benefit_type: '적립', rate: 20,
    });
  });

  test('C-1. 혜택이 큰 순으로 준다', async () => {
    const { body } = await json('/api/card-strategy/estimate?amount=10000&asOf=2026-08-04');
    assert.equal(body.data[0].cardProductId, ids.card, '실적 미달 카드가 1등으로 올라왔다');
    assert.equal(body.data[0].benefit, 500);
  });

  test('C-2. 실적 미달 카드는 혜택 0 이지만 목록에는 남는다', async () => {
    const { body } = await json('/api/card-strategy/estimate?amount=10000&asOf=2026-08-04');
    const unmet = body.data.find((c) => c.cardProductId === ids.card2);

    assert.equal(unmet.benefit, 0);
    assert.equal(unmet.thresholdMet, false);
    // "이 카드는 20% 인데 실적이 모자라요" 를 화면이 말할 수 있어야 한다.
    assert.equal(unmet.applied.rate, 20);
    assert.equal(unmet.thresholdUnmet, true);
  });

  test('C-3. 한도 소진을 모른다는 것을 알린다', async () => {
    // 이번 달 이미 받은 혜택을 기록하지 않으므로 한도가 남았다고 가정한다.
    const { body } = await json('/api/card-strategy/estimate?amount=10000');
    assert.equal(body.capUnknown, true);
  });
});

describe('D. 사후 분석 배선', () => {
  test('D-1. 기간을 안 주면 최근 3개월이다', async () => {
    const { body } = await json('/api/card-strategy/comparison');
    assert.ok(body.period.from < body.period.to, `기간이 뒤집혔다: ${JSON.stringify(body.period)}`);
  });

  test('D-2. 뒤집힌 기간은 400 이다', async () => {
    const { status } = await json('/api/card-strategy/comparison?from=2026-08-01&to=2026-07-01');
    assert.equal(status, 400);
  });

  test('D-3. 수입은 차액 계산에 안 들어간다', async () => {
    const { body } = await json('/api/card-strategy/comparison?from=2026-06-01&to=2026-07-31');
    const incomeRow = (body.details || []).find((d) => d.merchant === '월급');
    assert.equal(incomeRow, undefined, '수입이 차액 계산에 들어갔다');
  });

  test('D-4. 카드 상품을 모르는 결제 건수를 알린다', async () => {
    // 카드로 썼는데 상품을 안 고른 거래. 차액에 넣으면 안 되고, 대신
    // "등록하면 N건을 더 분석할 수 있어요" 의 근거가 된다.
    await post('/api/transactions', {
      date: '2026-07-15', amount: 50000, category_id: ids.expenseCat,
      payment_method_id: ids.orphanPm, merchant: '상품미상',
    });

    const { body } = await json('/api/card-strategy/comparison?from=2026-06-01&to=2026-07-31');
    assert.ok(body.unknownCard >= 1, `모르는 건을 안 셌다: ${JSON.stringify(body.unknownCard)}`);
    assert.equal((body.details || []).some((d) => d.merchant === '상품미상'), false);
  });

  test('D-5. 현금 결제는 카드를 안 쓴 것으로 본다', async () => {
    await post('/api/transactions', {
      date: '2026-07-16', amount: 20000, category_id: ids.expenseCat,
      payment_method_id: ids.cashPm, merchant: '현금가게',
    });

    const { body } = await json('/api/card-strategy/comparison?from=2026-06-01&to=2026-07-31');
    const row = (body.details || []).find((d) => d.merchant === '현금가게');
    assert.ok(row, '현금 거래가 계산에서 빠졌다');
    assert.equal(row.actual, null);
  });

  test('D-6. 실적 추정 여부를 이어서 알린다', async () => {
    const { body } = await json('/api/card-strategy/comparison?from=2026-06-01&to=2026-07-31');
    assert.equal(body.thresholdEstimated, true);
  });
});

describe('E. 한 결제수단에 상품이 둘이면 특정하지 않는다', () => {
  // 016 은 payment_method_id 에 UNIQUE 를 안 걸었다 — 한 카드사에 카드 두 장을
  // 표현할 수 있어야 하기 때문이다(#302 의 B 안이 이 경로로 간다).
  //
  // 그 상태에서 아무거나 고르면 **남의 카드 혜택으로 계산한 차액**을 사용자에게
  // 보여주게 된다. 모르면 모르는 채로 두고 unknownCard 로 센다.

  test('E-1. 상품을 하나 더 붙이면 그 결제수단 거래가 특정 불가로 바뀐다', async () => {
    const before = await json('/api/card-strategy/thresholds?asOf=2026-08-04');
    const beforeRow = before.body.data.find((c) => c.cardProductId === ids.card);
    assert.equal(beforeRow.spend, 300000, '전제가 깨졌다 — 붙이기 전에는 특정됐어야 한다');

    // 같은 결제수단에 두 번째 상품을 붙인다.
    await post('/api/card-products', {
      payment_method_id: ids.cardPm, issuer: '테스트카드', product_name: '겹치는카드',
      card_type: '신용', statement_close_day: 6,
    });

    const after = await json('/api/card-strategy/thresholds?asOf=2026-08-04');
    const afterRow = after.body.data.find((c) => c.cardProductId === ids.card);

    assert.equal(afterRow.spend, 0, '어느 상품인지 모르는데 실적으로 셌다');
    assert.equal(afterRow.met, false);
  });

  test('E-2. 특정 불가 건은 차액이 아니라 unknownCard 로 간다', async () => {
    const { body } = await json('/api/card-strategy/comparison?from=2026-06-01&to=2026-07-31');
    assert.equal((body.details || []).some((d) => d.merchant === '테스트'), false,
      '특정 못 한 거래가 차액 계산에 들어갔다');
    assert.ok(body.unknownCard >= 4, `특정 불가 건을 안 셌다: ${body.unknownCard}`);
  });
});
