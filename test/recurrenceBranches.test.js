'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { occurrencesBetween } = require('../src/services/recurrence');

// #736 — occurrencesBetween 을 freq 별로 쪼개기 전에, 돌연변이로 재서 기존
// 테스트가 못 잡던 분기(빠진 필드의 기본값, 연 반복의 interval·경계·상한)를 고정한다.

test('freq 가 없으면 월 반복으로 본다', () => {
  const result = occurrencesBetween({ starts_on: '2026-01-10' }, '2026-01-01', '2026-03-31');
  assert.deepStrictEqual(result, ['2026-01-10', '2026-02-10', '2026-03-10']);
});

test('starts_on 이 없으면 조회 시작일부터 센다', () => {
  const result = occurrencesBetween({ freq: 'monthly', day_of_month: 5 }, '2026-03-01', '2026-05-31');
  assert.deepStrictEqual(result, ['2026-03-05', '2026-04-05', '2026-05-05']);
});

test('interval 이 소수면 내림한다', () => {
  const result = occurrencesBetween({ freq: 'daily', interval: 2.5, starts_on: '2026-01-01' }, '2026-01-01', '2026-01-07');
  assert.deepStrictEqual(result, ['2026-01-01', '2026-01-03', '2026-01-05', '2026-01-07']);
});

test('월 반복에 day_of_month 가 없으면 starts_on 의 일', () => {
  const result = occurrencesBetween({ freq: 'monthly', starts_on: '2026-01-20' }, '2026-02-01', '2026-03-31');
  assert.deepStrictEqual(result, ['2026-02-20', '2026-03-20']);
});

test('연 반복에 month_of_year 가 없으면 starts_on 의 달', () => {
  const result = occurrencesBetween({ freq: 'yearly', starts_on: '2025-07-04' }, '2026-01-01', '2027-12-31');
  assert.deepStrictEqual(result, ['2026-07-04', '2027-07-04']);
});

test('연 interval 2 에서 구간이 중간부터여도 주기가 어긋나지 않는다', () => {
  const result = occurrencesBetween({ freq: 'yearly', interval: 2, starts_on: '2020-03-01', month_of_year: 3, day_of_month: 1 }, '2023-01-01', '2027-12-31');
  assert.deepStrictEqual(result, ['2024-03-01', '2026-03-01']);
});

test('연 반복은 조회 끝날 당일을 포함한다', () => {
  const result = occurrencesBetween({ freq: 'yearly', starts_on: '2024-05-10' }, '2024-01-01', '2026-05-10');
  assert.deepStrictEqual(result, ['2024-05-10', '2025-05-10', '2026-05-10']);
});

test('연 반복은 10년 구간도 다 낸다', () => {
  const result = occurrencesBetween({ freq: 'yearly', starts_on: '2020-01-15' }, '2020-01-01', '2029-12-31');
  assert.deepStrictEqual(result, [
    '2020-01-15',
    '2021-01-15',
    '2022-01-15',
    '2023-01-15',
    '2024-01-15',
    '2025-01-15',
    '2026-01-15',
    '2027-01-15',
    '2028-01-15',
    '2029-01-15'
  ]);
});
