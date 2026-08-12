'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const {
  ruleOf, benefitForTransaction, benefitForMonth, validateRule,
  BENEFIT_KINDS, RATE_KIND,
} = require('../src/services/benefitRules');

test('1. 규칙이 없으면 rate 컬럼을 본다', () => {
  assert.deepStrictEqual(ruleOf({ rate: 0.7 }), { kind: 'rate', rate: 0.7 });
  assert.deepStrictEqual(ruleOf({ rate: 0.7, rule_json: null }), { kind: 'rate', rate: 0.7 });
});

test('2. 깨진 JSON 도 rate 컬럼으로 되돌아간다', () => {
  assert.deepStrictEqual(ruleOf({ rate: 1.5, rule_json: '{이건 JSON이 아니다' }), { kind: 'rate', rate: 1.5 });
});

test('3. kind 가 없는 JSON 도 되돌아간다', () => {
  assert.deepStrictEqual(ruleOf({ rate: 2, rule_json: '{"rate":3}' }), { kind: 'rate', rate: 2 });
});

test('4. 제대로 된 규칙은 그대로 읽는다', () => {
  const r = ruleOf({ rate: 0, rule_json: '{"kind":"flat_monthly","tiers":[]}' });
  assert.strictEqual(r.kind, 'flat_monthly');
});

test('5. 요율형은 거래금액에 요율을 곱한다', () => {
  const out = benefitForTransaction({ rate: 10 }, { amount: 12345 });
  assert.strictEqual(out.benefit, 1234);   // floor(12345 × 10 / 100)
  assert.strictEqual(out.kind, 'rate');
});

test('6. 요율이 0 이면 0 이다', () => {
  assert.strictEqual(benefitForTransaction({ rate: 0 }, { amount: 50000 }).benefit, 0);
});

test('7. 요율형은 월 단위 몫이 없다', () => {
  assert.strictEqual(benefitForMonth({ rate: 10 }, { prevMonthSpend: 999999 }).benefit, 0);
});

const FLAT = {
  rate: 0,
  rule_json: JSON.stringify({
    kind: 'flat_monthly',
    tiers: [
      { min_spend: 300000, amount: 3000 },
      { min_spend: 600000, amount: 7000, label: '상위 구간' },
    ],
  }),
};

test('8. 정액구간형은 이 결제에 붙는 몫이 없다', () => {
  assert.strictEqual(benefitForTransaction(FLAT, { amount: 1000000 }).benefit, 0);
});

test('9. 전월실적이 구간에 못 미치면 0 이고 안내를 준다', () => {
  const out = benefitForMonth(FLAT, { prevMonthSpend: 299999 });
  assert.strictEqual(out.benefit, 0);
  assert.ok(out.explain && out.explain.includes('300000'), out.explain);
});

test('10. 하한과 정확히 같으면 그 구간이다', () => {
  assert.strictEqual(benefitForMonth(FLAT, { prevMonthSpend: 300000 }).benefit, 3000);
});

test('11. 상위 구간 하한을 넘으면 상위 구간이다', () => {
  assert.strictEqual(benefitForMonth(FLAT, { prevMonthSpend: 600000 }).benefit, 7000);
  assert.strictEqual(benefitForMonth(FLAT, { prevMonthSpend: 5000000 }).benefit, 7000);
});

test('12. 구간 사이 값은 아래 구간이다', () => {
  assert.strictEqual(benefitForMonth(FLAT, { prevMonthSpend: 599999 }).benefit, 3000);
});

test('13. 이름을 적어 두면 안내에 쓴다', () => {
  const out = benefitForMonth(FLAT, { prevMonthSpend: 600000 });
  assert.ok(out.explain && out.explain.includes('상위 구간'));
});

const REVERSED = {
  rate: 0,
  rule_json: JSON.stringify({
    kind: 'flat_monthly',
    tiers: [
      { min_spend: 600000, amount: 7000 },
      { min_spend: 300000, amount: 3000 },
    ],
  }),
};

test('14. 구간을 거꾸로 넣어도 제대로 판정한다', () => {
  assert.strictEqual(benefitForMonth(REVERSED, { prevMonthSpend: 300000 }).benefit, 3000);
  assert.strictEqual(benefitForMonth(REVERSED, { prevMonthSpend: 600000 }).benefit, 7000);
  assert.strictEqual(benefitForMonth(REVERSED, { prevMonthSpend: 100000 }).benefit, 0);
});

test('15. 구간이 비어 있으면 0 이다', () => {
  const empty = {
    rate: 0,
    rule_json: JSON.stringify({
      kind: 'flat_monthly',
      tiers: [],
    }),
  };
  assert.strictEqual(benefitForMonth(empty, { prevMonthSpend: 100000 }).benefit, 0);
});

test('16. 검증은 모르는 유형을 막는다', () => {
  assert.strictEqual(validateRule(null), null);          // 규칙 없음은 허용
  assert.strictEqual(validateRule(undefined), null);
  assert.ok(validateRule({ kind: 'flat_montly', tiers: [] }));   // 오타
  assert.ok(validateRule({ kind: 'nonsense' }));
  assert.ok(validateRule('문자열'));
  assert.ok(validateRule([1, 2]));
});

test('17. 검증은 값의 범위와 중복도 막는다', () => {
  assert.ok(validateRule({ kind: 'rate', rate: -1 }));
  assert.ok(validateRule({ kind: 'flat_monthly', tiers: [] }));
  assert.ok(validateRule({ kind: 'flat_monthly', tiers: [{ min_spend: -1, amount: 100 }] }));
  assert.ok(validateRule({ kind: 'flat_monthly', tiers: [{ min_spend: 0, amount: -5 }] }));
  assert.ok(validateRule({ kind: 'flat_monthly', tiers: [{ min_spend: 100, amount: 1 }, { min_spend: 100, amount: 2 }] }));

  assert.strictEqual(validateRule({ kind: 'rate', rate: 0 }), null);
  assert.strictEqual(validateRule({ kind: 'flat_monthly', tiers: [{ min_spend: 0, amount: 0 }] }), null);

  assert.ok(BENEFIT_KINDS.includes('rate'));
  assert.ok(BENEFIT_KINDS.includes('flat_monthly'));
  assert.ok(!BENEFIT_KINDS.includes('custom'));
  assert.strictEqual(RATE_KIND, 'rate');
});
