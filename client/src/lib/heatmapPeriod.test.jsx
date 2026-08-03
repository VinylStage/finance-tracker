import { describe, it, expect } from 'vitest';
import { monthRange, yearMonths, bucketToDaily } from './heatmapPeriod';

describe('monthRange', () => {
  it('31일 달의 from/to', () => {
    const result = monthRange(2023, 1); // 1월
    expect(result).toEqual({ from: '2023-01-01', to: '2023-01-31' });
  });

  it('30일 달의 to 가 30일이다', () => {
    const result = monthRange(2023, 4); // 4월
    expect(result).toEqual({ from: '2023-04-01', to: '2023-04-30' });
  });

  it('평년 2월의 to 가 28일이다', () => {
    const result = monthRange(2023, 2); // 2월
    expect(result).toEqual({ from: '2023-02-01', to: '2023-02-28' });
  });

  it('윤년 2월의 to 가 29일이다', () => {
    const result = monthRange(2024, 2); // 2월 (윤년)
    expect(result).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  });
});

describe('yearMonths', () => {
  it('12개월이 나온다', () => {
    const result = yearMonths(2023);
    expect(result).toHaveLength(12);
  });

  it('첫 원소가 1월이고 마지막이 12월이다', () => {
    const result = yearMonths(2023);
    expect(result[0]).toEqual({ year: 2023, month: 1, from: '2023-01-01', to: '2023-01-31' });
    expect(result[11]).toEqual({ year: 2023, month: 12, from: '2023-12-01', to: '2023-12-31' });
  });

  it('각 원소의 from 이 그 달 1일이다', () => {
    const result = yearMonths(2023);
    expect(result[6]).toEqual({ year: 2023, month: 7, from: '2023-07-01', to: '2023-07-31' });
  });

  it('윤년의 2월 원소 to 가 29일이다', () => {
    const result = yearMonths(2024);
    expect(result[1]).toEqual({ year: 2024, month: 2, from: '2024-02-01', to: '2024-02-29' });
  });
});

describe('bucketToDaily', () => {
  it('그 달 날짜의 expense 를 꺼낸다', () => {
    const buckets = {
      '2023-01-01': { income: 1000, expense: 500, count: 1 },
      '2023-01-02': { income: 2000, expense: 300, count: 1 },
    };
    const result = bucketToDaily(buckets, 2023, 1);
    expect(result).toEqual({
      '2023-01-01': 500,
      '2023-01-02': 300,
    });
  });

  it('그 달 밖 날짜는 버린다', () => {
    const buckets = {
      '2023-01-01': { income: 1000, expense: 500, count: 1 },
      '2023-02-01': { income: 2000, expense: 300, count: 1 },
    };
    const result = bucketToDaily(buckets, 2023, 1);
    expect(result).toEqual({
      '2023-01-01': 500,
    });
  });

  it('expense 가 0 인 날도 키가 남는다', () => {
    const buckets = {
      '2023-01-01': { income: 1000, expense: 500, count: 1 },
      '2023-01-02': { income: 2000, expense: 0, count: 1 },
    };
    const result = bucketToDaily(buckets, 2023, 1);
    expect(result).toEqual({
      '2023-01-01': 500,
      '2023-01-02': 0,
    });
  });

  it('buckets 가 비면 빈 객체다', () => {
    const result = bucketToDaily({}, 2023, 1);
    expect(result).toEqual({});
  });

  it('buckets 가 null 이면 빈 객체다', () => {
    const result = bucketToDaily(null, 2023, 1);
    expect(result).toEqual({});
  });
});
