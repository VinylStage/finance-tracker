'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { resolvePeriod } = require('../src/utils/period');

describe('A. 범위 지정', () => {
  test('from/to 가 둘 다 있으면 그대로 쓴다', () => {
    const result = resolvePeriod({ from: '2026-01-01', to: '2026-12-31' });
    assert.deepStrictEqual(result, {
      from: '2026-01-01',
      to: '2026-12-31',
      source: 'range',
      error: null,
    });
  });

  test('from 만 있고 to 가 없으면 to=null 로 두고 source=range', () => {
    const result = resolvePeriod({ from: '2026-01-01' });
    assert.deepStrictEqual(result, {
      from: '2026-01-01',
      to: null,
      source: 'range',
      error: null,
    });
  });

  test('to 만 있고 from 이 없어도 마찬가지로 열린 구간', () => {
    const result = resolvePeriod({ to: '2026-12-31' });
    assert.deepStrictEqual(result, {
      from: null,
      to: '2026-12-31',
      source: 'range',
      error: null,
    });
  });
});

describe('B. 월 지정', () => {
  test('month 가 YYYY-MM 형식이면 그 달의 1일~말일로 펼친다', () => {
    const result = resolvePeriod({ month: '2026-02' });
    assert.deepStrictEqual(result, {
      from: '2026-02-01',
      to: '2026-02-28',
      source: 'month',
      error: null,
    });
  });

  test('윤년 2월은 29일까지', () => {
    const result = resolvePeriod({ month: '2024-02' });
    assert.deepStrictEqual(result, {
      from: '2024-02-01',
      to: '2024-02-29',
      source: 'month',
      error: null,
    });
  });
});

describe('C. 연 지정', () => {
  test('year 가 YYYY 형식이면 그 해 01-01~12-31 로 펼친다', () => {
    const result = resolvePeriod({ year: '2026' });
    assert.deepStrictEqual(result, {
      from: '2026-01-01',
      to: '2026-12-31',
      source: 'year',
      error: null,
    });
  });
});

describe('D. 우선순위', () => {
  test('from/to 가 있으면 month/year 를 무시한다', () => {
    const result = resolvePeriod({ from: '2026-01-01', to: '2026-12-31', month: '2025-06', year: '2025' });
    assert.deepStrictEqual(result, {
      from: '2026-01-01',
      to: '2026-12-31',
      source: 'range',
      error: null,
    });
  });

  test('month 가 있으면 year 를 무시한다', () => {
    const result = resolvePeriod({ month: '2026-02', year: '2025' });
    assert.deepStrictEqual(result, {
      from: '2026-02-01',
      to: '2026-02-28',
      source: 'month',
      error: null,
    });
  });
});

describe('E. 오류', () => {
  // 오류 문구 자체를 단언하지 않는다. 문구는 사용자에게 보이는 말이라 다듬어질
  // 수 있고, 여기에 박아 두면 문구를 고칠 때마다 테스트가 깨진다.
  // 계약은 "from/to 가 비고, source 는 none 이고, 사람이 읽을 오류가 있다" 이다.
  function assertRejected(result) {
    assert.strictEqual(result.from, null);
    assert.strictEqual(result.to, null);
    assert.strictEqual(result.source, 'none');
    assert.strictEqual(typeof result.error, 'string');
    assert.ok(result.error.length > 0);
  }

  test('from 이 to 보다 늦으면 오류', () => {
    assertRejected(resolvePeriod({ from: '2026-12-31', to: '2026-01-01' }));
  });

  test('날짜 형식이 YYYY-MM-DD 가 아니면 오류', () => {
    assertRejected(resolvePeriod({ from: '2026/01/01' }));
  });

  test('month 가 YYYY-MM 형식이 아니면 오류', () => {
    assertRejected(resolvePeriod({ month: '2026/01' }));
  });

  test('year 가 네 자리 숫자가 아니면 오류', () => {
    assertRejected(resolvePeriod({ year: '26' }));
  });

  test('존재하지 않는 날짜면 오류', () => {
    assertRejected(resolvePeriod({ from: '2026-02-30' }));
  });

  test('존재하지 않는 월이면 오류', () => {
    assertRejected(resolvePeriod({ month: '2026-13' }));
  });

  test('오류 문구에 영문 키 이름이 그대로 노출되지 않는다', () => {
    // 사용자가 읽는 말이어야 한다. from/to 같은 내부 키가 새면 안 된다.
    const r = resolvePeriod({ from: '2026-12-31', to: '2026-01-01' });
    assert.ok(!/\bfrom\b|\bto\b|query/.test(r.error), r.error);
  });
});
