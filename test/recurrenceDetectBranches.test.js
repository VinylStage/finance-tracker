'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { detectRecurringCandidates: detect } = require('../src/services/recurrenceDetect');

// #736 — detectRecurringCandidates 를 쪼개기 전에, 돌연변이로 재서 기존 테스트가
// 못 잡던 분기(가맹점명 정리, 버리는 행, 중앙값·편차·경계, 기본값, 정렬, 동률)를 고정한다.

const row = (date, over = {}) => ({
  date, amount: 10000, merchant: '넷플릭스', category_id: 1, payment_method_id: 2, payment_style: '일시불', ...over,
});

test('제외 목록도 가맹점명을 정리해서 비교한다', () => {
  const result = detect([row('2026-01-10'), row('2026-02-10'), row('2026-03-10')], { existingMerchants: [' 넷플릭스 '] });
  assert.strictEqual(result.length, 0);
});

test('null 행이 섞여도 멈추지 않는다', () => {
  const result = detect([null, row('2026-01-10'), row('2026-02-10'), row('2026-03-10')]);
  assert.strictEqual(result.length, 1);
});

test('금액이 숫자가 아닌 행은 버린다', () => {
  const result = detect([row('2026-01-10'), row('2026-02-10'), row('2026-03-10'), row('2026-04-10', { amount: 'abc' })]);
  assert.strictEqual(result[0].occurrences, 3);
});

test('건수가 짝수면 금액·결제일 중앙값은 가운데 둘의 평균', () => {
  const result = detect([row('2026-01-10'), row('2026-02-10'), row('2026-03-12', { amount: 12000 }), row('2026-04-12', { amount: 12000 })]);
  assert.strictEqual(result[0].amount, 11000);
  assert.strictEqual(result[0].day_of_month, 11);
});

test('금액 편차는 가장 크게 튄 것으로 재고 최소·최대를 준다', () => {
  const result = detect([row('2026-01-10'), row('2026-02-10', { amount: 9000 }), row('2026-03-10', { amount: 15000 })]);
  assert.strictEqual(result[0].amount_varies, true);
  assert.strictEqual(result[0].amount_min, 9000);
  assert.strictEqual(result[0].amount_max, 15000);
});

test('결제일 편차도 가장 크게 튄 것으로 잰다', () => {
  const result = detect([row('2026-01-10'), row('2026-02-10'), row('2026-03-20')]);
  assert.strictEqual(result[0].day_varies, true);
});

test('금액 편차가 정확히 20% 면 흔들린다고 보지 않는다', () => {
  const result = detect([row('2026-01-10'), row('2026-02-10'), row('2026-03-10', { amount: 12000 })]);
  assert.strictEqual(result[0].amount_varies, false);
});

test('결제일 편차가 5일이면 그대로, 6일이면 흔들린다', () => {
  const result1 = detect([row('2026-01-10'), row('2026-02-10'), row('2026-03-15')]);
  assert.strictEqual(result1[0].day_varies, false);
  
  const result2 = detect([row('2026-01-10'), row('2026-02-10'), row('2026-03-16')]);
  assert.strictEqual(result2[0].day_varies, true);
});

test('결제방식이 비어 있으면 일시불로 채운다', () => {
  const result = detect([row('2026-01-10', { payment_style: null }), row('2026-02-10', { payment_style: null }), row('2026-03-10', { payment_style: null })]);
  assert.strictEqual(result[0].payment_style, '일시불');
});

test('결제일이 흔들리는 것도 고정된 것보다 아래로 간다', () => {
  const B = { merchant: '교통' };
  const result = detect([row('2026-01-10'), row('2026-02-10'), row('2026-03-10'), row('2026-01-01', B), row('2026-02-10', B), row('2026-03-20', B), row('2026-04-10', B)]);
  assert.deepStrictEqual(result.map((c) => c.merchant), ['넷플릭스', '교통']);
});

test('가장 많이 쓴 값이 동률이면 먼저 나온 값', () => {
  const result = detect([row('2026-01-10', { category_id: 7 }), row('2026-02-10', { category_id: 8 }), row('2026-03-10', { category_id: 8 }), row('2026-04-10', { category_id: 7 })]);
  assert.strictEqual(result[0].category_id, 7);
});

test('가맹점명의 공백을 정리해 같은 곳으로 묶는다', () => {
  const result = detect([row('2026-01-10', { merchant: '넷플릭스  코리아' }), row('2026-02-10', { merchant: ' 넷플릭스 코리아' }), row('2026-03-10', { merchant: '넷플릭스 코리아 ' })]);
  assert.deepStrictEqual(result.map((c) => [c.merchant, c.occurrences]), [['넷플릭스 코리아', 3]]);
});
