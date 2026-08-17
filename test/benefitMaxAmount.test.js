const { test } = require('node:test');
const assert = require('node:assert/strict');
const { estimateBenefit } = require('../src/services/cardStrategy.js');

function row(id, rate, min, max) {
  return {
    id,
    category_id: 10,
    merchant_pattern: null,
    benefit_type: 'discount',
    rate,
    monthly_cap: null,
    min_amount: min,
    max_amount: max,
    payment_style: null,
    card_threshold_tier_id: null,
    threshold_exempt: 1,
    rule_json: JSON.stringify({ kind: 'rate', rate }),
  };
}

const under = row(1, 30, 0, 100000);        // 10만원 미만 30%
const over = row(2, 20, 100000, null);      // 10만원 이상 20%

test('상한 미만이면 그 줄이 걸린다', () => {
  const result = estimateBenefit({
    benefits: [under, over],
    amount: 50000,
    categoryId: 10,
    merchant: null,
    thresholdMet: true,
    benefitUsedThisMonth: 0
  });
  
  assert.equal(result.benefit, 15000);
  assert.equal(result.applied.id, 1);
});

test('경계는 «미만» 이다', () => {
  const result = estimateBenefit({
    benefits: [under, over],
    amount: 100000,
    categoryId: 10,
    merchant: null,
    thresholdMet: true,
    benefitUsedThisMonth: 0
  });
  
  assert.equal(result.benefit, 20000);
  assert.equal(result.applied.id, 2);
});

test('상한에 걸린 줄이 skipped에 사유와 함께 남는다', () => {
  const result = estimateBenefit({
    benefits: [under, over],
    amount: 100000,
    categoryId: 10,
    merchant: null,
    thresholdMet: true,
    benefitUsedThisMonth: 0
  });
  
  assert.ok(result.skipped.some(s => s.id === 1 && s.reason === 'above-max-amount'));
});

test('하한에 걸린 줄도 그대로 남는다', () => {
  const result = estimateBenefit({
    benefits: [under, over],
    amount: 50000,
    categoryId: 10,
    merchant: null,
    thresholdMet: true,
    benefitUsedThisMonth: 0
  });
  
  assert.ok(result.skipped.some(s => s.id === 2 && s.reason === 'below-min-amount'));
});

test('상한이 없으면 예전과 같다', () => {
  const result = estimateBenefit({
    benefits: [row(3, 25, 0, null)], // 상한이 없는 혜택
    amount: 99999999,
    categoryId: 10,
    merchant: null,
    thresholdMet: true,
    benefitUsedThisMonth: 0
  });
  
  assert.equal(result.applied.id, 3);
});

test('상한 미만이면서 하한 미만인 결제는 아무 줄도 안 걸린다', () => {
  const modifiedUnder = row(1, 30, 10000, 100000); // min_amount를 10000으로 변경
  const result = estimateBenefit({
    benefits: [modifiedUnder, over],
    amount: 5000,
    categoryId: 10,
    merchant: null,
    thresholdMet: true,
    benefitUsedThisMonth: 0
  });
  
  assert.equal(result.benefit, 0);
  assert.equal(result.applied, null);
});
