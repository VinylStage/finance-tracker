const { test } = require('node:test');
const assert = require('node:assert/strict');
const { matchesDates, datesOf, validateRule } = require('../src/services/benefitRules.js');
const { estimateBenefit } = require('../src/services/cardStrategy.js');

test('날짜 조건이 없으면 아무 날이나 통과한다', () => {
  assert.strictEqual(matchesDates([], '2026-03-15'), true);
});

test('날짜 목록에 포함된 날은 참, 그렇지 않으면 거짓', () => {
  assert.strictEqual(matchesDates(['10-01', '06-06'], '2026-10-01'), true);
  assert.strictEqual(matchesDates(['10-01', '06-06'], '2026-10-02'), false);
  // 연도는 안 본다. 조건이 «올해 6월 6일» 이 아니라 «현충일» 이라서다.
  assert.strictEqual(matchesDates(['10-01', '06-06'], '2019-06-06'), true);
});

test('날짜를 모를 때는 null을 반환한다', () => {
  assert.strictEqual(matchesDates(['10-01'], undefined), null);
  assert.strictEqual(matchesDates(['10-01'], '10-01'), null);
});

test('datesOf는 형식이 틀린 날짜를 버린다', () => {
  const benefit = {
    rule_json: JSON.stringify({
      kind: 'rate',
      rate: 30,
      when: { dates: ['10-01', '13-01', '02-30', 'x'] }
    })
  };
  assert.deepStrictEqual(datesOf(benefit), ['10-01']);
});

test('validateRule은 모르는 조건 칸을 막는다', () => {
  const rule = { kind: 'rate', rate: 1, when: { date: ['10-01'] } };
  assert.ok(typeof validateRule(rule) === 'string');
  
  rule.when = { dates: ['10-01'] };
  assert.strictEqual(validateRule(rule), null);
  
  rule.when = { dates: [] };
  assert.ok(typeof validateRule(rule) === 'string');
});

test('estimateBenefit은 날짜가 맞는 날에만 혜택을 준다', () => {
  const dated = {
    id: 1,
    category_id: 10,
    merchant_pattern: null,
    benefit_type: 'discount',
    rate: 30,
    monthly_cap: null,
    min_amount: 0,
    max_amount: null,
    payment_style: null,
    card_threshold_tier_id: null,
    threshold_exempt: 1,
    rule_json: JSON.stringify({ kind: 'rate', rate: 30, when: { dates: ['10-01', '06-06'] } }),
  };

  // 날짜가 맞는 경우
  const result1 = estimateBenefit({
    benefits: [dated],
    amount: 10000,
    categoryId: 10,
    merchant: null,
    thresholdMet: true,
    benefitUsedThisMonth: 0,
    date: '2026-10-01'
  });
  assert.strictEqual(result1.benefit, 3000);
  assert.ok(result1.applied !== null);

  // 날짜가 맞지 않는 경우
  const result2 = estimateBenefit({
    benefits: [dated],
    amount: 10000,
    categoryId: 10,
    merchant: null,
    thresholdMet: true,
    benefitUsedThisMonth: 0,
    date: '2026-10-02'
  });
  assert.strictEqual(result2.benefit, 0);
  assert.ok(result2.applied === null);
  assert.ok(result2.skipped.some(s => s.reason === 'date-mismatch'));
});

test('estimateBenefit은 날짜를 모르면 빼고 그 사실을 알린다', () => {
  const dated = {
    id: 1,
    category_id: 10,
    merchant_pattern: null,
    benefit_type: 'discount',
    rate: 30,
    monthly_cap: null,
    min_amount: 0,
    max_amount: null,
    payment_style: null,
    card_threshold_tier_id: null,
    threshold_exempt: 1,
    rule_json: JSON.stringify({ kind: 'rate', rate: 30, when: { dates: ['10-01', '06-06'] } }),
  };

  // 날짜를 아예 넘기지 않은 경우
  const result = estimateBenefit({
    benefits: [dated],
    amount: 10000,
    categoryId: 10,
    merchant: null,
    thresholdMet: true,
    benefitUsedThisMonth: 0
  });
  assert.strictEqual(result.benefit, 0);
  assert.strictEqual(result.undatedSkipped, true);
  assert.ok(result.skipped.some(s => s.reason === 'date-unknown'));
});

test('날짜 조건이 없는 혜택은 날짜를 몰라도 통과한다', () => {
  const benefit = {
    id: 1,
    category_id: 10,
    merchant_pattern: null,
    benefit_type: 'discount',
    rate: 30,
    monthly_cap: null,
    min_amount: 0,
    max_amount: null,
    payment_style: null,
    card_threshold_tier_id: null,
    threshold_exempt: 1,
    rule_json: JSON.stringify({ kind: 'rate', rate: 30 }),
  };

  const result = estimateBenefit({
    benefits: [benefit],
    amount: 10000,
    categoryId: 10,
    merchant: null,
    thresholdMet: true,
    benefitUsedThisMonth: 0
  });
  assert.strictEqual(result.undatedSkipped, false);
});
