'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { buildTransactionFilters } = require('../src/utils/transactionFilters');

// 조건이 붙었는지 보기 좋게, 앞머리 ' WHERE 1=1' 을 떼고 본다.
function condOf(query) {
  return buildTransactionFilters(query).where.replace(' WHERE 1=1', '').trim();
}

function paramsOf(query) {
  return buildTransactionFilters(query).params;
}

test('1. 카드 번호를 주면 그 카드로 좁힌다', () => {
  assert.equal(condOf({ card_product_id: '4' }), 'AND t.card_product_id = ?');
  assert.deepEqual(paramsOf({ card_product_id: '4' }), [4]);
});

test('2. `none` 은 카드가 안 붙은 거래를 고른다', () => {
  assert.equal(condOf({ card_product_id: 'none' }), 'AND t.card_product_id IS NULL');
  assert.deepEqual(paramsOf({ card_product_id: 'none' }), []);
});

test('3. 빈 문자열은 조건을 안 건다', () => {
  assert.equal(condOf({ card_product_id: '' }), '');
});

test('4. 아예 안 보내도 조건을 안 건다', () => {
  assert.equal(condOf({}), '');
});

test('5. 숫자가 아닌 값은 무시한다', () => {
  assert.equal(condOf({ card_product_id: 'abc' }), '');
});

test('6. 기간 조건과 함께 걸린다', () => {
  const result = buildTransactionFilters({ from: '2026-08-01', to: '2026-08-31', card_product_id: 'none' });
  assert.ok(result.where.includes('t.date >='));
  assert.ok(result.where.includes('t.date <='));
  assert.ok(result.where.includes('t.card_product_id IS NULL'));
  assert.deepEqual(result.params, ['2026-08-01', '2026-08-31']);
});

test('7. 결제수단 조건과 카드 조건이 같이 걸린다', () => {
  const result = buildTransactionFilters({ payment_method_id: '2', card_product_id: '7' });
  assert.ok(result.where.includes('t.payment_method_id = ?'));
  assert.ok(result.where.includes('t.card_product_id = ?'));
  assert.deepEqual(result.params, [2, 7]);
});

test('8. `none` 이 아닌 다른 글자는 카드 번호로 읽는다', () => {
  assert.equal(condOf({ card_product_id: 'NONE' }), '');
});
