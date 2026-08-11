'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
  computeThreshold, normalizeTiers, tierFor, nextTierAfter,
} = require('../src/services/cardThreshold');

// 실적 구간 계산(#526). 라우트가 아니라 계산 규칙 자체를 본다.

const TIERS = [
  { min_spend: 0, rate: 0.5, label: '기본' },
  { min_spend: 400000, rate: 1.5, label: '40만' },
  { min_spend: 1000000, rate: 2.0, label: '100만' },
];

// 전월(2026-07)에 든 거래를 만든다. asOf 는 항상 '2026-08-10' 을 쓴다.
const tx = (id, amount) => ({
  id, date: '2026-07-15', amount, origin: 'manual', major_type: '선택지출',
});

const run = (list, extra = {}) => computeThreshold({
  cardProduct: null, transactions: list, asOf: '2026-08-10', tiers: TIERS, ...extra,
});

describe('A. 구간 판정', () => {
  test('A-1. 하한과 정확히 같으면 그 구간이다', () => {
    const result = run([tx(1, 400000)]);
    assert.equal(result.tier.min_spend, 400000);
  });

  test('A-2. 하한보다 1원 모자라면 아래 구간이다', () => {
    const result = run([tx(1, 399999)]);
    assert.equal(result.tier.min_spend, 0);
  });

  test('A-3. 최상위 구간을 넘으면 최상위다', () => {
    const result = run([tx(1, 1200000)]);
    assert.equal(result.tier.min_spend, 1000000);
    assert.equal(result.tier.rate, 2);
  });

  test('A-4. 여러 건이면 합계로 판정한다', () => {
    const result = run([tx(1, 300000), tx(2, 150000)]);
    assert.equal(result.tier.min_spend, 400000);
  });
});

describe('B. 정리와 다음 구간', () => {
  test('B-1. normalizeTiers 는 하한 오름차순으로 정렬한다', () => {
    const result = normalizeTiers([{ min_spend: 100 }, { min_spend: 5 }]);
    assert.equal(result[0].min_spend, 5);
  });

  test('B-2. normalizeTiers 는 숫자가 아닌 하한을 버린다', () => {
    const result = normalizeTiers([{ min_spend: 'x' }, { min_spend: 5 }]);
    assert.equal(result.length, 1);
  });

  test('B-3. 다음 구간까지 남은 금액을 낸다', () => {
    const result = run([tx(1, 300000)]);
    assert.equal(result.toNextTier, 100000);
  });

  // 경계에서만 갈리는 자리다. 실적이 어느 구간 하한과 정확히 같을 때
  // "다음 구간" 이 자기 자신이 되면 남은 금액이 0 으로 나와, 사용자는 이미
  // 다음 구간에 든 것으로 읽는다. 돌연변이(`<` → `<=`)가 이 케이스가 없어서
  // 살아남았다.
  test('B-5. 하한과 정확히 같아도 다음 구간은 그 위다', () => {
    const r = run([tx(1, 400000)]);
    assert.equal(r.nextTier.min_spend, 1000000);
    assert.equal(r.toNextTier, 600000);
  });

  test('B-4. 최상위 구간이면 다음 구간이 없다', () => {
    const result = run([tx(1, 1200000)]);
    assert.equal(result.nextTier, null);
    assert.equal(result.toNextTier, 0);
  });
});

describe('C. 수동 제외', () => {
  test('C-1. 제외한 거래는 합계에서 빠진다', () => {
    const result = run([tx(1, 300000), tx(2, 200000)], { excludedIds: [2] });
    assert.equal(result.spend, 300000);
  });

  test('C-2. 제외 건수를 센다', () => {
    const result = run([tx(1, 300000), tx(2, 200000)], { excludedIds: [2] });
    assert.equal(result.excluded.manual, 1);
  });

  test('C-3. 제외 때문에 구간이 내려갈 수 있다', () => {
    const result = run([tx(1, 300000), tx(2, 200000)], { excludedIds: [2] });
    assert.equal(result.tier.min_spend, 0);
  });
});
