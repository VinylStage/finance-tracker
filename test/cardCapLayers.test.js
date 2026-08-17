'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { estimateBenefit } = require('../src/services/cardStrategy.js');

// 혜택 줄 하나를 만든다. rate 는 퍼센트, caps 는 항목별 한도 목록이다.
function benefit({ id = 1, rate = 10, caps = null, monthlyCap = null }) {
  return {
    id,
    benefit_type: '적립',
    category_id: null,
    merchant_pattern: null,
    payment_style: null,
    card_threshold_tier_id: null,
    min_amount: 0,
    rate,
    monthly_cap: monthlyCap,
    rule_json: JSON.stringify(caps ? { kind: 'rate', rate, caps } : { kind: 'rate', rate }),
  };
}

// 한 건 결제를 추정한다.
function estimate({ benefits, amount, usedThisMonth = 0, tierMonthlyCap = null }) {
  return estimateBenefit({
    benefits,
    amount,
    categoryId: null,
    merchant: null,
    paymentStyle: null,
    activeTierId: null,
    thresholdMet: true,
    benefitUsedThisMonth: usedThisMonth,
    tierMonthlyCap,
  });
}

test('한도가 없으면 요율 그대로다', () => {
  const r = estimate({
    benefits: [benefit({ rate: 10 })],
    amount: 50000,
  });
  assert.strictEqual(r.benefit, 5000);
  assert.strictEqual(r.capped, false);
  assert.strictEqual(r.cappedBy, null);
});

test('통합 한도가 항목 한도보다 작으면 통합에 잘린다', () => {
  const r = estimate({
    benefits: [benefit({ rate: 10, caps: [{ window: 'month', amount: 10000 }] })],
    amount: 200000,
    tierMonthlyCap: 5000,
  });
  assert.strictEqual(r.benefit, 5000);
  assert.strictEqual(r.cappedBy, 'card-monthly');
});

test('통합 한도가 항목 한도보다 크면 항목에 잘린다', () => {
  const r = estimate({
    benefits: [benefit({ rate: 10, caps: [{ window: 'month', amount: 4000 }] })],
    amount: 200000,
    tierMonthlyCap: 50000,
  });
  assert.strictEqual(r.benefit, 4000);
  assert.strictEqual(r.cappedBy, 'item-month');
});

test('건당 한도는 이번 결제만 보고 자른다', () => {
  const r = estimate({
    benefits: [benefit({ rate: 10, caps: [{ window: 'transaction', amount: 3000 }] })],
    amount: 100000,
    usedThisMonth: 999999,
  });
  assert.strictEqual(r.benefit, 3000);
  assert.strictEqual(r.cappedBy, 'item-transaction');
});

test('하루 한도는 아직 적용하지 못한다는 사실을 싣는다', () => {
  const r = estimate({
    benefits: [benefit({ rate: 10, caps: [{ window: 'day', amount: 1000 }] })],
    amount: 100000,
  });
  assert.strictEqual(r.benefit, 10000);
  assert.ok(r.unappliedCapWindows.includes('day'));
});

test('월 누적이 통합 한도를 이미 채웠으면 혜택이 0 이다', () => {
  const r = estimate({
    benefits: [benefit({ rate: 10 })],
    amount: 100000,
    tierMonthlyCap: 5000,
    usedThisMonth: 5000,
  });
  assert.strictEqual(r.benefit, 0);
  assert.strictEqual(r.cappedBy, 'card-monthly');
});
