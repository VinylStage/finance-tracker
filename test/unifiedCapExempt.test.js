'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers/testServer');

const PORT = 21064;
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

after(() => server && server.stop());

function row(id, rate, exempt) {
  return {
    id,
    category_id: null,
    merchant_pattern: '에버랜드',
    benefit_type: '할인',
    rate,
    monthly_cap: null,
    min_amount: 0,
    max_amount: null,
    payment_style: null,
    card_threshold_tier_id: null,
    threshold_exempt: 1,
    unified_cap_exempt: exempt ? 1 : 0,
    rule_json: JSON.stringify({ kind: 'rate', rate }),
  };
}

const { estimateBenefit } = require('../src/services/cardStrategy.js');

test('통합 한도 밖이면 안 잘린다', () => {
  const result = estimateBenefit({
    benefits: [row(1, 50, true)],
    amount: 41000,
    categoryId: null,
    merchant: '에버랜드',
    thresholdMet: true,
    benefitUsedThisMonth: 0,
    tierMonthlyCap: 5000
  });

  assert.strictEqual(result.benefit, 20500);
  assert.strictEqual(result.capped, false);
  assert.strictEqual(result.cappedBy, null);
});

test('통합 한도 안이면 예전대로 잘린다', () => {
  const result = estimateBenefit({
    benefits: [row(1, 50, false)],
    amount: 41000,
    categoryId: null,
    merchant: '에버랜드',
    thresholdMet: true,
    benefitUsedThisMonth: 0,
    tierMonthlyCap: 5000
  });

  assert.strictEqual(result.benefit, 5000);
  assert.strictEqual(result.capped, true);
  assert.strictEqual(result.cappedBy, 'card-monthly');
});

test('통합 한도를 건너뛰어도 항목 한도는 걸린다', () => {
  const benefit = row(1, 50, true);
  benefit.rule_json = JSON.stringify({ kind: 'rate', rate: 50, caps: [{ window: 'month', amount: 8000 }] });

  const result = estimateBenefit({
    benefits: [benefit],
    amount: 41000,
    categoryId: null,
    merchant: '에버랜드',
    thresholdMet: true,
    benefitUsedThisMonth: 0,
    tierMonthlyCap: 5000
  });

  assert.strictEqual(result.benefit, 8000);
  assert.strictEqual(result.cappedBy, 'item-month');
});

before(async () => {
  server = await startTestServer({ port: PORT });
  ids.pm = (await post('/api/payment-methods', { name: '통합밖카드', type: '체크' })).body.id;
  ids.card = (await post('/api/card-products', {
    payment_method_id: ids.pm,
    issuer: '예시카드사',
    product_name: '예시 통합밖 카드',
    card_type: '체크',
  })).body.id;
});

test('API 로 저장하고 되읽으면 살아 있다', async () => {
  const benefit = (await post('/api/card-benefits', {
    card_product_id: ids.card,
    merchant_pattern: '통합밖가맹점',
    benefit_type: '할인',
    rate: 50,
    threshold_exempt: true,
    unified_cap_exempt: true,
  })).body;


  const list = (await json('/api/card-benefits')).body.data;
  const found = list.find(b => b.id === benefit.id);
  assert.strictEqual(found.unified_cap_exempt, 1);
});

test('안 보내면 0 이다', async () => {
  const benefit = (await post('/api/card-benefits', {
    card_product_id: ids.card,
    merchant_pattern: '기본가맹점',
    benefit_type: '할인',
    rate: 50,
    threshold_exempt: true,
  })).body;


  const list = (await json('/api/card-benefits')).body.data;
  const found = list.find(b => b.id === benefit.id);
  assert.strictEqual(found.unified_cap_exempt, 0);
});

test('계산까지 닿는다', async () => {
  // 대조 카드가 있어야 비교가 돈다 (하나면 comparable:false, reason:'single-card')
  const pm2 = (await post('/api/payment-methods', { name: '대조', type: '신용' })).body.id;
  await post('/api/card-products', {
    payment_method_id: pm2, issuer: '예시카드사',
    product_name: '대조 카드', card_type: '신용',
  });

  // 통합 한도 5,000원짜리 구간
  await json(`/api/card-strategy/tiers/${ids.card}`, {
    method: 'PUT',
    body: JSON.stringify({ tiers: [{ min_spend: 0, label: '기본', monthly_cap: 5000 }] }),
  });

  for (const [merchant, exempt] of [['면제가맹점', true], ['보통가맹점', false]]) {
    await post('/api/card-benefits', {
      card_product_id: ids.card, merchant_pattern: merchant,
      benefit_type: '할인', rate: 50,
      threshold_exempt: true, unified_cap_exempt: exempt,
    });
  }

  // 거래에는 category_id 가 필수다. GET /api/categories 는 **배열 그대로**를 낸다
  // (`body.data` 가 아니라 `body`). 다른 엔드포인트와 다르니 주의한다.
  const cat = (await json('/api/categories')).body.find((c) => c.major_type !== '수입').id;
  for (const merchant of ['면제가맹점', '보통가맹점']) {
    await post('/api/transactions', {
      date: '2026-03-10', merchant, amount: 41000,
      payment_method_id: ids.pm, type: '지출', category_id: cat,
    });
  }

  const cmp = await json('/api/card-strategy/comparison?from=2026-03-01&to=2026-03-31');
  const free = cmp.body.details.find((d) => d.merchant === '면제가맹점');
  const capped = cmp.body.details.find((d) => d.merchant === '보통가맹점');

  assert.ok(free);
  assert.ok(capped);

  assert.strictEqual(free.actual.benefit, 20500); // 41000의 50%, 안 잘림
  assert.strictEqual(capped.actual.benefit, 5000); // 통합 한도에 잘림
});

// 위 6번은 **실제로 그 카드로 결제한** 경로만 본다. 「이 카드로 바꿨다면」 을 계산하는
// 가정 경로는 #641 이 따로 만든 두 번째 누적(`hypoUsed`)을 쓰므로 같은 단언이 안 걸린다.
// 한쪽만 면제를 지키면 같은 혜택이 시나리오에 따라 다르게 취급된다.
test('통합 한도 밖인 줄은 **가정 계산에서도** 남의 한도를 안 깎는다', async () => {
  // 결제는 전부 다른 카드로 한다. 그래야 ids.card 쪽이 순수한 «가정» 이 된다.
  const other = (await post('/api/payment-methods', { name: '실제결제카드', type: '신용' })).body.id;
  await post('/api/card-products', {
    payment_method_id: other, issuer: '예시카드사',
    product_name: '실제 결제 카드', card_type: '신용',
  });

  const cat = (await json('/api/categories')).body.find((c) => c.major_type !== '수입').id;
  for (const merchant of ['면제가맹점', '보통가맹점']) {
    await post('/api/transactions', {
      date: '2026-05-10', merchant, amount: 41000,
      payment_method_id: other, type: '지출', category_id: cat,
    });
  }

  const cmp = await json('/api/card-strategy/comparison?from=2026-05-01&to=2026-05-31');
  const capped = cmp.body.details.find((d) => d.merchant === '보통가맹점');
  assert.ok(capped);

  // 면제 줄(20,500)이 통합 한도 5,000 을 먼저 먹었다면 이 값이 0 이 된다.
  assert.strictEqual(capped.best.benefit, 5000);
});
