'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { computeThreshold, tierQualifies } = require('../src/services/cardThreshold');

describe('A. tierQualifies 단독', () => {
  test('A-1. null을 넣으면 false', () => {
    assert.strictEqual(tierQualifies(null), false);
  });

  test('A-2. undefined를 넣으면 false', () => {
    assert.strictEqual(tierQualifies(undefined), false);
  });

  test('A-3. rate: 1을 넣으면 true', () => {
    assert.strictEqual(tierQualifies({ rate: 1 }), true);
  });

  test('A-4. rate: 0을 넣으면 false — 혜택 없는 구간', () => {
    assert.strictEqual(tierQualifies({ rate: 0 }), false);
  });

  test('A-5. rate: null을 넣으면 true — 요율은 혜택마다 다름', () => {
    assert.strictEqual(tierQualifies({ rate: null }), true);
  });

  test('A-6. rate가 없는 객체를 넣으면 true', () => {
    assert.strictEqual(tierQualifies({}), true);
  });

  test('A-7. rate: 0.5를 넣으면 true', () => {
    assert.strictEqual(tierQualifies({ rate: 0.5 }), true);
  });

  test('A-8. rate: -1을 넣으면 false', () => {
    assert.strictEqual(tierQualifies({ rate: -1 }), false);
  });
});

describe('B. met이 그 판정을 따른다 — 새 동작', () => {
  const tiers = [
    { min_spend: 0, rate: 0 },
    { min_spend: 100000, rate: null }
  ];

  const tx = (amount) => ({ date: '2026-06-10', amount, major_type: '변동필수', origin: 'manual' });

  test('B-1. 거래 없음 (0원) — 하위 구간(rate 0)', () => {
    const r = computeThreshold({
      cardProduct: { prev_month_threshold: null },
      transactions: [],
      asOf: '2026-07-15',
      tiers,
    });
    assert.strictEqual(r.met, false);
  });

  test('B-2. 50,000원 — 아직 하위 구간', () => {
    const r = computeThreshold({
      cardProduct: { prev_month_threshold: null },
      transactions: [tx(50000)],
      asOf: '2026-07-15',
      tiers,
    });
    assert.strictEqual(r.met, false);
  });

  test('B-3. 100,000원 (경계) — 상위 구간(rate null)', () => {
    const r = computeThreshold({
      cardProduct: { prev_month_threshold: null },
      transactions: [tx(100000)],
      asOf: '2026-07-15',
      tiers,
    });
    assert.strictEqual(r.met, true);
  });

  test('B-4. 250,000원', () => {
    const r = computeThreshold({
      cardProduct: { prev_month_threshold: null },
      transactions: [tx(250000)],
      asOf: '2026-07-15',
      tiers,
    });
    assert.strictEqual(r.met, true);
  });

  test('B-5. B-3과 같은 상황에서 tier.rate는 null이다', () => {
    const r = computeThreshold({
      cardProduct: { prev_month_threshold: null },
      transactions: [tx(100000)],
      asOf: '2026-07-15',
      tiers,
    });
    assert.strictEqual(r.tier.rate, null);
  });
});

describe('C. 요율이 있는 구간은 예전 그대로 — 하위호환', () => {
  const tiers = [
    { min_spend: 0, rate: 1 },
    { min_spend: 400000, rate: 2 }
  ];

  const tx = (amount) => ({ date: '2026-06-10', amount, major_type: '변동필수', origin: 'manual' });

  test('C-1. 0원 — met이 true, rate가 1', () => {
    const r = computeThreshold({
      cardProduct: { prev_month_threshold: null },
      transactions: [],
      asOf: '2026-07-15',
      tiers,
    });
    assert.strictEqual(r.met, true);
    assert.strictEqual(r.rate, 1);
  });

  test('C-2. 500,000원 — met이 true, rate가 2', () => {
    const r = computeThreshold({
      cardProduct: { prev_month_threshold: null },
      transactions: [tx(500000)],
      asOf: '2026-07-15',
      tiers,
    });
    assert.strictEqual(r.met, true);
    assert.strictEqual(r.rate, 2);
  });
});

describe('D. 구간이 없으면 예전 계약 그대로 — 하위호환', () => {
  const tx = (amount) => ({ date: '2026-06-10', amount, major_type: '변동필수', origin: 'manual' });

  test('D-1. tiers를 안 주고 prev_month_threshold: null — met이 true', () => {
    const r = computeThreshold({
      cardProduct: { prev_month_threshold: null },
      transactions: [],
      asOf: '2026-07-15',
      tiers: undefined,
    });
    assert.strictEqual(r.met, true);
  });

  test('D-2. tiers 없이 prev_month_threshold: 300000, 지출 100,000 — met이 false', () => {
    const r = computeThreshold({
      cardProduct: { prev_month_threshold: 300000 },
      transactions: [tx(100000)],
      asOf: '2026-07-15',
      tiers: undefined,
    });
    assert.strictEqual(r.met, false);
  });

  test('D-3. tiers 없이 prev_month_threshold: 300000, 지출 300,000 — met이 true', () => {
    const r = computeThreshold({
      cardProduct: { prev_month_threshold: 300000 },
      transactions: [tx(300000)],
      asOf: '2026-07-15',
      tiers: undefined,
    });
    assert.strictEqual(r.met, true);
  });
});
