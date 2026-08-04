'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { estimateBenefit } = require('../src/services/cardStrategy.js');
const { BENEFIT_TYPES } = require('../src/constants.js');

test('estimateBenefit - 최소 결제액 경계 — 같으면 통과', () => {
  const result = estimateBenefit({
    benefits: [{ id:1, category_id:null, merchant_pattern:null, benefit_type:'적립', rate:10, monthly_cap:null, min_amount:10000 }],
    amount: 10000, categoryId: 1, merchant: 'x', thresholdMet: true, benefitUsedThisMonth: 0
  });
  assert.strictEqual(result.benefit, 1000);
});

test('estimateBenefit - 1원 모자라면 제외', () => {
  const result = estimateBenefit({
    benefits: [{ id:1, category_id:null, merchant_pattern:null, benefit_type:'적립', rate:10, monthly_cap:null, min_amount:10000 }],
    amount: 9999, categoryId: 1, merchant: 'x', thresholdMet: true, benefitUsedThisMonth: 0
  });
  assert.strictEqual(result.benefit, 0);
  assert.strictEqual(result.applied, null);
});

test('estimateBenefit - 월 한도 경계 — 딱 맞으면 안 깎인다', () => {
  const result = estimateBenefit({
    benefits: [{ id:1, category_id:null, merchant_pattern:null, benefit_type:'적립', rate:10, monthly_cap:1000, min_amount:null }],
    amount: 10000, categoryId: 1, merchant: 'x', thresholdMet: true, benefitUsedThisMonth: 0
  });
  assert.strictEqual(result.benefit, 1000);
  assert.strictEqual(result.capped, false);   // 안 깎였음을 명시한다
});

test('estimateBenefit - 한도 초과 — 남은 만큼만', () => {
  const result = estimateBenefit({
    benefits: [{ id:1, category_id:null, merchant_pattern:null, benefit_type:'적립', rate:10, monthly_cap:1000, min_amount:null }],
    amount: 10000, categoryId: 1, merchant: 'x', thresholdMet: true, benefitUsedThisMonth: 700
  });
  assert.strictEqual(result.benefit, 300);
  assert.strictEqual(result.capped, true);
});

test('estimateBenefit - 한도 소진 — 0', () => {
  const result = estimateBenefit({
    benefits: [{ id:1, category_id:null, merchant_pattern:null, benefit_type:'적립', rate:10, monthly_cap:1000, min_amount:null }],
    amount: 10000, categoryId: 1, merchant: 'x', thresholdMet: true, benefitUsedThisMonth: 1000
  });
  assert.strictEqual(result.benefit, 0);
  assert.strictEqual(result.capped, true);
});

test('estimateBenefit - 실적 미달', () => {
  const result = estimateBenefit({
    benefits: [{ id:1, category_id:null, merchant_pattern:null, benefit_type:'적립', rate:10, monthly_cap:1000, min_amount:null }],
    amount: 10000, categoryId: 1, merchant: 'x', thresholdMet: false, benefitUsedThisMonth: 0
  });
  assert.strictEqual(result.benefit, 0);
  assert.strictEqual(result.thresholdUnmet, true);
});

test('estimateBenefit - 소수점 — 내림', () => {
  const result = estimateBenefit({
    benefits: [{ id:1, category_id:null, merchant_pattern:null, benefit_type:'적립', rate:0.5, monthly_cap:null, min_amount:null }],
    amount: 41000, categoryId: 1, merchant: 'x', thresholdMet: true, benefitUsedThisMonth: 0
  });
  assert.strictEqual(result.benefit, 205);
});

test('estimateBenefit - 매칭됨', () => {
  const result = estimateBenefit({
    benefits: [
      { id:1, category_id:10, merchant_pattern:null, benefit_type:'적립', rate:5, monthly_cap:10000, min_amount:null },
      { id:2, category_id:null, merchant_pattern:'스타벅스', benefit_type:'적립', rate:10, monthly_cap:null, min_amount:null }
    ],
    amount: 41000, categoryId: 10, merchant: '스타벅스 강남점', thresholdMet: true, benefitUsedThisMonth: 0
  });
  assert.strictEqual(result.benefit, 4100);
  assert.strictEqual(result.applied.id, 2);
});

test('estimateBenefit - 매칭 안 됨', () => {
  // 원래 이 테스트는 데이터에 걸리는 혜택(id:1, category 10)을 넣어 두고
  // benefit 0 을 기대해 스스로 모순이었다. 아무것도 안 걸리게 고친다.
  const result = estimateBenefit({
    benefits: [
      { id:1, category_id:99, merchant_pattern:null, benefit_type:'적립', rate:5, monthly_cap:10000, min_amount:null },
      { id:2, category_id:null, merchant_pattern:'다른가맹점', benefit_type:'적립', rate:10, monthly_cap:null, min_amount:null }
    ],
    amount: 41000, categoryId: 10, merchant: '스타벅스 강남점', thresholdMet: true, benefitUsedThisMonth: 0
  });
  assert.strictEqual(result.benefit, 0);
  assert.strictEqual(result.applied, null);
  assert.ok(result.skipped.every((x) => x.reason === 'no-match'));
});

test('estimateBenefit - 후보가 없음', () => {
  const result = estimateBenefit({
    benefits: [
      { id:1, category_id:10, merchant_pattern:null, benefit_type:'적립', rate:5, monthly_cap:10000, min_amount:50000 }
    ],
    amount: 41000, categoryId: 10, merchant: '스타벅스 강남점', thresholdMet: true, benefitUsedThisMonth: 0
  });
  assert.strictEqual(result.benefit, 0);
  assert.strictEqual(result.applied, null);
});

test('estimateBenefit - 최소액 미달', () => {
  const result = estimateBenefit({
    benefits: [
      { id:1, category_id:10, merchant_pattern:null, benefit_type:'적립', rate:5, monthly_cap:10000, min_amount:50000 }
    ],
    amount: 41000, categoryId: 10, merchant: '스타벅스 강남점', thresholdMet: true, benefitUsedThisMonth: 0
  });
  assert.strictEqual(result.benefit, 0);
  assert.strictEqual(result.applied, null);
});

test('estimateBenefit - 후보가 여러 개일 때 rate 높은 것 선택', () => {
  // id:2 의 category_id 는 null 이어야 한다. 원래는 20 이었는데 categoryId 가
  // 10 이라, 카테고리·가맹점이 둘 다 설정되면 둘 다 맞아야 한다는 규칙에서
  // 아예 후보가 아니게 된다. 요율 우선을 보려던 의도를 살려 데이터를 고친다.
  const result = estimateBenefit({
    benefits: [
      { id:1, category_id:10, merchant_pattern:null, benefit_type:'적립', rate:5, monthly_cap:10000, min_amount:null },
      { id:2, category_id:null, merchant_pattern:'스타벅스', benefit_type:'적립', rate:10, monthly_cap:null, min_amount:null }
    ],
    amount: 41000, categoryId: 10, merchant: '스타벅스 강남점', thresholdMet: true, benefitUsedThisMonth: 0
  });
  assert.strictEqual(result.benefit, 4100);
  assert.strictEqual(result.applied.id, 2);
});

test('estimateBenefit - 후보가 여러 개일 때 구체적인 것 선택', () => {
  const result = estimateBenefit({
    benefits: [
      { id:1, category_id:10, merchant_pattern:null, benefit_type:'적립', rate:5, monthly_cap:10000, min_amount:null },
      { id:2, category_id:10, merchant_pattern:'스타벅스', benefit_type:'적립', rate:5, monthly_cap:10000, min_amount:null }
    ],
    amount: 41000, categoryId: 10, merchant: '스타벅스 강남점', thresholdMet: true, benefitUsedThisMonth: 0
  });
  assert.strictEqual(result.benefit, 2050);
  assert.strictEqual(result.applied.id, 2);
});

test('estimateBenefit - 요율이 같으면 merchant > category > all 순서로 우선순위', () => {
  const result = estimateBenefit({
    benefits: [
      { id:1, category_id:10, merchant_pattern:null, benefit_type:'적립', rate:5, monthly_cap:10000, min_amount:null },
      { id:2, category_id:10, merchant_pattern:'스타벅스', benefit_type:'적립', rate:5, monthly_cap:10000, min_amount:null },
      { id:3, category_id:null, merchant_pattern:null, benefit_type:'적립', rate:5, monthly_cap:10000, min_amount:null }
    ],
    amount: 41000, categoryId: 10, merchant: '스타벅스 강남점', thresholdMet: true, benefitUsedThisMonth: 0
  });
  assert.strictEqual(result.benefit, 2050);
  assert.strictEqual(result.applied.id, 2);
});

// 검수에서 나온 회귀(#276 위임 9회차).
//
// 세 가지가 명세와 달랐다. 전부 자기 테스트로는 안 잡혔다 — 예시가 우연히
// 두 규칙을 동시에 만족하는 값이어서다.
test('요율이 구체성보다 먼저다', () => {
  // 가맹점 지정 0.5% 가 카테고리 10% 를 이기면 사용자가 950원을 놓친다.
  const r = estimateBenefit({
    benefits: [
      { id:1, category_id:null, merchant_pattern:'스타벅스', benefit_type:'적립', rate:0.5, monthly_cap:null, min_amount:null },
      { id:2, category_id:10, merchant_pattern:null, benefit_type:'적립', rate:10, monthly_cap:null, min_amount:null },
    ],
    amount: 10000, categoryId: 10, merchant: '스타벅스 강남점', thresholdMet: true, benefitUsedThisMonth: 0,
  });
  assert.strictEqual(r.applied.id, 2);
  assert.strictEqual(r.benefit, 1000);
});

test('카테고리와 가맹점이 둘 다 있으면 둘 다 맞아야 한다', () => {
  // "그 가맹점에서 그 카테고리로 쓸 때" 라는 뜻이다. 하나만 맞아도 준다고
  // 보면 실제보다 많이 추정하게 된다.
  const both = (categoryId) => estimateBenefit({
    benefits: [{ id:9, category_id:10, merchant_pattern:'스타벅스', benefit_type:'적립', rate:10, monthly_cap:null, min_amount:null }],
    amount: 10000, categoryId, merchant: '스타벅스 강남점', thresholdMet: true, benefitUsedThisMonth: 0,
  });
  assert.strictEqual(both(10).benefit, 1000, '둘 다 맞는데 안 줬다');
  assert.strictEqual(both(20).benefit, 0, '카테고리가 다른데 줬다');
});

test('실적 미달일 때 applied 는 실제로 걸리는 혜택이다', () => {
  // 첫 번째 혜택을 그냥 집으면, 걸리지도 않는 99% 혜택을 화면이 보여준다.
  const r = estimateBenefit({
    benefits: [
      { id:1, category_id:null, merchant_pattern:'없는가맹점', benefit_type:'적립', rate:99, monthly_cap:null, min_amount:null },
      { id:2, category_id:null, merchant_pattern:null, benefit_type:'적립', rate:5, monthly_cap:null, min_amount:null },
    ],
    amount: 10000, categoryId: 1, merchant: '스타벅스', thresholdMet: false, benefitUsedThisMonth: 0,
  });
  assert.strictEqual(r.applied.id, 2, '걸리지도 않는 혜택을 applied 로 냈다');
  assert.strictEqual(r.benefit, 0);
  assert.strictEqual(r.thresholdUnmet, true);
});

test('걸러진 이유가 전부 실린다', () => {
  // "왜 추천 안 됐는지" 가 결과의 일부다. 고른 것만 남기면 화면이 말할 수 없다.
  const r = estimateBenefit({
    benefits: [
      { id:1, category_id:99, merchant_pattern:null, benefit_type:'적립', rate:5, monthly_cap:null, min_amount:null },
      { id:2, category_id:null, merchant_pattern:null, benefit_type:'적립', rate:3, monthly_cap:null, min_amount:50000 },
      { id:3, category_id:null, merchant_pattern:null, benefit_type:'적립', rate:1, monthly_cap:null, min_amount:null },
    ],
    amount: 10000, categoryId: 10, merchant: 'x', thresholdMet: true, benefitUsedThisMonth: 0,
  });
  const byId = Object.fromEntries(r.skipped.map((s) => [s.id, s.reason]));
  assert.strictEqual(byId[1], 'no-match');
  assert.strictEqual(byId[2], 'below-min-amount');
  assert.strictEqual(r.applied.id, 3);
});
