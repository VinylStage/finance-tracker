import { describe, it, expect } from 'vitest';
import { bucketByDay } from './dailyBuckets';

describe('bucketByDay', () => {
  it('같은 날 수입과 지출이 섞인 경우', () => {
    const transactions = [
      { date: '2026-08-01', amount: 50000, major_type: '수입' },
      { date: '2026-08-01', amount: 12000, major_type: '지출' },
    ];
    const result = bucketByDay(transactions);
    expect(result).toEqual({
      '2026-08-01': { income: 50000, expense: 12000, count: 2 },
    });
  });

  it('거래 없는 날은 키 자체가 없다 — 0 으로 채우지 않는다', () => {
    // 달력뷰가 "안 썼다" 와 "기록을 안 했다" 를 구분해 그리려면, 없는 날은
    // { income: 0, expense: 0 } 이 아니라 키가 아예 없어야 한다.
    const result = bucketByDay([
      { date: '2026-08-01', amount: 12000, major_type: '지출' },
      { date: '2026-08-03', amount: 5000, major_type: '지출' },
    ]);
    expect(Object.keys(result).sort()).toEqual(['2026-08-01', '2026-08-03']);
    expect('2026-08-02' in result).toBe(false);
    expect(result['2026-08-02']).toBeUndefined();
  });

  it('수입 외 major_type 은 전부 지출로 센다', () => {
    // 정본 상수 MAJOR_TYPES 는 수입 외에 고정지출·변동필수·선택지출·저축·
    // 부채상환·미분류를 갖는다. 수입만 갈라내고 나머지는 묶는 것이 규칙이다.
    const result = bucketByDay([
      { date: '2026-08-01', amount: 1000, major_type: '고정지출' },
      { date: '2026-08-01', amount: 2000, major_type: '저축' },
      { date: '2026-08-01', amount: 3000, major_type: '미분류' },
      { date: '2026-08-01', amount: 4000, major_type: '수입' },
    ]);
    expect(result['2026-08-01']).toEqual({ income: 4000, expense: 6000, count: 4 });
  });

  it('여러 달이 섞여 들어와도 날짜 키로 그대로 갈린다', () => {
    const result = bucketByDay([
      { date: '2026-07-31', amount: 1000, major_type: '지출' },
      { date: '2026-08-01', amount: 2000, major_type: '지출' },
    ]);
    expect(result['2026-07-31'].expense).toBe(1000);
    expect(result['2026-08-01'].expense).toBe(2000);
  });

  it('amount 가 문자열/null/undefined 인 경우 0 처리', () => {
    const transactions = [
      { date: '2026-08-01', amount: 'abc', major_type: '수입' },
      { date: '2026-08-01', amount: null, major_type: '지출' },
      { date: '2026-08-01', amount: undefined, major_type: '지출' },
    ];
    const result = bucketByDay(transactions);
    expect(result).toEqual({
      '2026-08-01': { income: 0, expense: 0, count: 3 },
    });
  });

  it('date 가 빠지거나 형식이 틀린 원소는 건너뛴다', () => {
    const transactions = [
      { date: '2026-08-01', amount: 12000, major_type: '지출' },
      { date: 'invalid-date', amount: 12000, major_type: '지출' },
      { amount: 12000, major_type: '지출' },
    ];
    const result = bucketByDay(transactions);
    expect(result).toEqual({
      '2026-08-01': { income: 0, expense: 12000, count: 1 },
    });
  });

  it('빈 배열, null, undefined 입력', () => {
    expect(bucketByDay([])).toEqual({});
    expect(bucketByDay(null)).toEqual({});
    expect(bucketByDay(undefined)).toEqual({});
    expect(bucketByDay('not-array')).toEqual({});
  });

  it('원본 배열 불변', () => {
    const original = [
      { date: '2026-08-01', amount: 12000, major_type: '지출' },
    ];
    const originalCopy = JSON.parse(JSON.stringify(original));
    bucketByDay(original);
    expect(original).toEqual(originalCopy);
  });
});
