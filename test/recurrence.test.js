'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { occurrencesBetween, clampDay, lastDayOf } = require('../src/services/recurrence');
const { RECURRING_FREQS } = require('../src/constants');

// 발생일 계산은 달력 경계에서 틀리기 쉽다 — 말일, 윤년, 연말 넘김, interval.
// 여기서 고정해두면 catch-up(#279)이 그 위에서 안심하고 돈다.

const rule = (over = {}) => ({
  freq: 'monthly',
  interval: 1,
  day_of_month: 15,
  starts_on: '2026-01-15',
  ends_on: null,
  month_of_year: null,
  ...over,
});

describe('A. 정본 상수', () => {
  test('A-1. RECURRING_FREQS 는 일·월·연 셋이다', () => {
    assert.deepEqual(RECURRING_FREQS, ['daily', 'monthly', 'yearly']);
  });
});

describe('B. 말일 처리 (A안 — 말일로 당김)', () => {
  test('B-1. 1월 31일 규칙이 2월엔 28일로 당겨진다', () => {
    const got = occurrencesBetween(
      rule({ day_of_month: 31, starts_on: '2026-01-31' }), '2026-01-01', '2026-03-31'
    );
    assert.deepEqual(got, ['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  test('B-2. 윤년 2월은 29일로 당겨진다', () => {
    const got = occurrencesBetween(
      rule({ day_of_month: 31, starts_on: '2024-01-31' }), '2024-02-01', '2024-02-29'
    );
    assert.deepEqual(got, ['2024-02-29']);
  });

  test('B-3. 30일 규칙도 2월엔 말일로 당겨진다', () => {
    const got = occurrencesBetween(
      rule({ day_of_month: 30, starts_on: '2026-01-30' }), '2026-02-01', '2026-02-28'
    );
    assert.deepEqual(got, ['2026-02-28']);
  });

  test('B-4. 당겨진 뒤 다음 달은 원래 일자로 돌아온다', () => {
    // 2월에 28일로 당겨졌다고 3월도 28일이 되면 안 된다.
    const got = occurrencesBetween(
      rule({ day_of_month: 31, starts_on: '2026-01-31' }), '2026-03-01', '2026-03-31'
    );
    assert.deepEqual(got, ['2026-03-31']);
  });

  test('B-5. clampDay 와 lastDayOf 가 직접 검증된다', () => {
    assert.equal(lastDayOf(2026, 2), 28);
    assert.equal(lastDayOf(2024, 2), 29);
    assert.equal(clampDay(2026, 2, 31), 28);
    assert.equal(clampDay(2026, 3, 31), 31);
  });
});

describe('C. 월 반복과 interval', () => {
  test('C-1. 매월 15일', () => {
    const got = occurrencesBetween(rule(), '2026-01-01', '2026-04-30');
    assert.deepEqual(got, ['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15']);
  });

  test('C-2. 2개월마다 — 시작월 기준으로 센다', () => {
    const got = occurrencesBetween(rule({ interval: 2 }), '2026-01-01', '2026-06-30');
    assert.deepEqual(got, ['2026-01-15', '2026-03-15', '2026-05-15']);
  });

  test('C-3. 연말을 넘어간다', () => {
    const got = occurrencesBetween(rule({ starts_on: '2026-11-15' }), '2026-11-01', '2027-02-28');
    assert.deepEqual(got, ['2026-11-15', '2026-12-15', '2027-01-15', '2027-02-15']);
  });

  test('C-4. 조회 구간이 시작일보다 앞서면 시작일부터 나온다', () => {
    const got = occurrencesBetween(rule({ starts_on: '2026-03-15' }), '2026-01-01', '2026-04-30');
    assert.deepEqual(got, ['2026-03-15', '2026-04-15']);
  });

  test('C-5. interval 2 에서 구간이 중간부터여도 주기가 어긋나지 않는다', () => {
    // 시작 1월, 2개월마다 → 1·3·5·7월. 4월부터 조회해도 5·7월이지 4·6월이 아니다.
    const got = occurrencesBetween(rule({ interval: 2 }), '2026-04-01', '2026-08-31');
    assert.deepEqual(got, ['2026-05-15', '2026-07-15']);
  });
});

describe('D. 적용 기간', () => {
  test('D-1. ends_on 당일은 포함한다', () => {
    const got = occurrencesBetween(rule({ ends_on: '2026-03-15' }), '2026-01-01', '2026-12-31');
    assert.deepEqual(got, ['2026-01-15', '2026-02-15', '2026-03-15']);
  });

  test('D-2. ends_on 하루 전이면 그달은 빠진다', () => {
    const got = occurrencesBetween(rule({ ends_on: '2026-03-14' }), '2026-01-01', '2026-12-31');
    assert.deepEqual(got, ['2026-01-15', '2026-02-15']);
  });

  test('D-3. ends_on 이 없으면 무기한이다', () => {
    const got = occurrencesBetween(rule(), '2026-01-01', '2026-12-31');
    assert.equal(got.length, 12);
  });

  test('D-4. 시작 전 구간만 조회하면 비어 있다', () => {
    const got = occurrencesBetween(rule({ starts_on: '2026-06-15' }), '2026-01-01', '2026-05-31');
    assert.deepEqual(got, []);
  });
});

describe('E. 일 반복', () => {
  test('E-1. 매일', () => {
    const got = occurrencesBetween(
      rule({ freq: 'daily', starts_on: '2026-01-01' }), '2026-01-01', '2026-01-05'
    );
    assert.deepEqual(got, ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05']);
  });

  test('E-2. 3일마다 — 시작일 기준', () => {
    const got = occurrencesBetween(
      rule({ freq: 'daily', interval: 3, starts_on: '2026-01-01' }), '2026-01-01', '2026-01-10'
    );
    assert.deepEqual(got, ['2026-01-01', '2026-01-04', '2026-01-07', '2026-01-10']);
  });

  test('E-3. 월 경계를 넘는다', () => {
    const got = occurrencesBetween(
      rule({ freq: 'daily', starts_on: '2026-01-30' }), '2026-01-30', '2026-02-02'
    );
    assert.deepEqual(got, ['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']);
  });

  test('E-4. 구간이 중간부터여도 주기가 어긋나지 않는다', () => {
    const got = occurrencesBetween(
      rule({ freq: 'daily', interval: 3, starts_on: '2026-01-01' }), '2026-01-05', '2026-01-11'
    );
    assert.deepEqual(got, ['2026-01-07', '2026-01-10']);
  });
});

describe('F. 연 반복', () => {
  test('F-1. 매년 같은 날', () => {
    const got = occurrencesBetween(
      rule({ freq: 'yearly', month_of_year: 3, day_of_month: 10, starts_on: '2026-03-10' }),
      '2026-01-01', '2028-12-31'
    );
    assert.deepEqual(got, ['2026-03-10', '2027-03-10', '2028-03-10']);
  });

  test('F-2. 2월 29일 연 반복은 평년에 28일로 당겨진다', () => {
    const got = occurrencesBetween(
      rule({ freq: 'yearly', month_of_year: 2, day_of_month: 29, starts_on: '2024-02-29' }),
      '2024-01-01', '2026-12-31'
    );
    assert.deepEqual(got, ['2024-02-29', '2025-02-28', '2026-02-28']);
  });

  test('F-3. 2년마다', () => {
    const got = occurrencesBetween(
      rule({ freq: 'yearly', interval: 2, month_of_year: 5, day_of_month: 1, starts_on: '2026-05-01' }),
      '2026-01-01', '2031-12-31'
    );
    assert.deepEqual(got, ['2026-05-01', '2028-05-01', '2030-05-01']);
  });
});

describe('G. 잘못된 입력', () => {
  test('G-1. 알 수 없는 freq 는 빈 배열', () => {
    assert.deepEqual(occurrencesBetween(rule({ freq: 'weekly' }), '2026-01-01', '2026-12-31'), []);
  });

  test('G-2. 날짜 형식이 틀리면 빈 배열', () => {
    assert.deepEqual(occurrencesBetween(rule(), 'nope', '2026-12-31'), []);
    assert.deepEqual(occurrencesBetween(rule(), '2026-01-01', ''), []);
  });

  test('G-3. rule 이 없으면 빈 배열', () => {
    assert.deepEqual(occurrencesBetween(null, '2026-01-01', '2026-12-31'), []);
  });

  test('G-4. interval 이 0 이나 음수면 1 로 본다 — 무한루프를 만들지 않는다', () => {
    const got = occurrencesBetween(rule({ interval: 0 }), '2026-01-01', '2026-03-31');
    assert.deepEqual(got, ['2026-01-15', '2026-02-15', '2026-03-15']);
  });

  test('G-5. from 이 to 보다 뒤면 빈 배열', () => {
    assert.deepEqual(occurrencesBetween(rule(), '2026-06-01', '2026-01-01'), []);
  });
});
