'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { estimateBenefit } = require('../src/services/cardStrategy.js');

// 혜택 줄 하나. exempt 가 «실적 조건이 붙지 않는다» 다.
function benefit({ exempt = 0, rate = 20, cap = null } = {}) {
  return {
    id: 1,
    card_product_id: 1,
    category_id: null,
    merchant_pattern: '예시가맹점',
    benefit_type: '적립',
    rate,
    monthly_cap: cap,
    min_amount: 0,
    payment_style: null,
    card_threshold_tier_id: null,
    rule_json: null,
    threshold_exempt: exempt,
  };
}

function run({ exempt = 0, met = true, amount = 20000, used = 0, tierCap = null } = {}) {
  return estimateBenefit({
    benefits: [benefit({ exempt })],
    amount,
    categoryId: null,
    merchant: '예시가맹점',
    paymentStyle: null,
    activeTierId: null,
    thresholdMet: met,
    benefitUsedThisMonth: used,
    tierMonthlyCap: tierCap,
  });
}

test('실적 조건이 붙는 혜택은 실적 미달이면 0 이다', () => {
  const r = run({ exempt: 0, met: false });
  assert.equal(r.benefit, 0);
  assert.equal(r.thresholdUnmet, true);
});

test('실적 조건이 없는 혜택은 실적 미달이어도 그대로 계산된다', () => {
  const r = run({ exempt: 1, met: false });
  assert.equal(r.benefit, 4000);
  assert.notEqual(r.thresholdUnmet, true);
});

test('실적을 채운 달은 둘이 같다', () => {
  assert.equal(run({ exempt: 0, met: true }).benefit, 4000);
  assert.equal(run({ exempt: 1, met: true }).benefit, 4000);
});

test('칸이 아예 없으면 실적 조건이 붙는 것으로 본다', () => {
  const row = benefit();
  delete row.threshold_exempt;
  const r = estimateBenefit({
    benefits: [row], amount: 20000, categoryId: null, merchant: '예시가맹점',
    paymentStyle: null, activeTierId: null, thresholdMet: false,
    benefitUsedThisMonth: 0, tierMonthlyCap: null,
  });
  assert.equal(r.benefit, 0);
  assert.equal(r.thresholdUnmet, true);
});

test('면제된 혜택도 한도에는 걸린다', () => {
  // 통합 한도 1,000원. 20% 로 4,000원이 나오지만 한도에 잘린다.
  const r = run({ exempt: 1, met: false, tierCap: 1000 });
  assert.equal(r.benefit, 1000);
  assert.equal(r.capped, true);
});

test('면제돼도 고른 혜택은 그대로 실린다', () => {
  const r = run({ exempt: 1, met: false });
  assert.equal(r.applied.id, 1);
  assert.equal(r.applied.rate, 20);
});
