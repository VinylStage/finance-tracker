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

// 아래 두 건은 위임 산출이 아니라 사람이 더한 것이다(M8 이 더미데이터 검증에서
// 찾은 계약 함정). 구간에 통합 한도가 생기면 혜택 줄의 `monthly_cap` 컬럼이 통합
// 폴백 자리에서 밀려나는데, 그때 그 줄의 한도가 사라지면 과대추정이 된다.
test('구간 통합 한도가 있어도 혜택 줄의 옛 한도 컬럼이 사라지지 않는다', () => {
  const r = estimate({
    // 실적과 무관한 줄. 구간을 안 가리키고 자기 한도만 컬럼에 갖고 있다.
    benefits: [benefit({ rate: 20, monthlyCap: 3000 })],
    amount: 50000, // 20% → 10,000
    tierMonthlyCap: 50000, // 통합은 넉넉하다
  });
  // 통합(50,000)만 보면 10,000 이 그대로 나가서 3.3배 부푼다.
  assert.strictEqual(r.benefit, 3000);
  assert.strictEqual(r.cappedBy, 'item-month');
});

test('선언에 월 한도가 있으면 그것이 정본이고 옛 컬럼은 무시된다', () => {
  const r = estimate({
    benefits: [benefit({ rate: 20, caps: [{ window: 'month', amount: 8000 }], monthlyCap: 3000 })],
    amount: 50000, // 20% → 10,000
    tierMonthlyCap: 50000,
  });
  // 컬럼(3,000)이 아니라 선언(8,000)으로 잘려야 한다.
  assert.strictEqual(r.benefit, 8000);
  assert.strictEqual(r.cappedBy, 'item-month');
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
