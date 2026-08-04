import { describe, it, expect } from 'vitest';
import { defaultTxDate } from './defaultTxDate';

describe('defaultTxDate', () => {
  const today = '2026-07-15';

  describe('A. 달력뷰 선택 우선', () => {
    it('A-1. selectedDay 가 있으면 그대로 나온다', () => {
      const result = defaultTxDate({ selectedDay: '2026-07-10', expandedMonths: [], today });
      expect(result).toBe('2026-07-10');
    });

    it('A-2. selectedDay 가 있으면 expandedMonths 를 무시한다', () => {
      const result = defaultTxDate({ selectedDay: '2026-07-10', expandedMonths: ['2026-08'], today });
      expect(result).toBe('2026-07-10');
    });

    it('A-3. selectedDay 형식이 틀리면 무시하고 다음 규칙으로 간다', () => {
      const result = defaultTxDate({ selectedDay: 'invalid-date', expandedMonths: [], today });
      expect(result).toBe(today);
    });
  });

  describe('B. 펼친 달 기준', () => {
    it('B-1. 펼친 달이 하나면 그 달 1일이다', () => {
      const result = defaultTxDate({ selectedDay: null, expandedMonths: ['2026-08'], today });
      expect(result).toBe('2026-08-01');
    });

    it('B-2. 펼친 달이 여럿이면 가장 최신 달 기준이다', () => {
      const result = defaultTxDate({ selectedDay: null, expandedMonths: ['2026-07', '2026-08'], today });
      expect(result).toBe('2026-08-01');
    });

    it('B-3. 펼친 달이 이번 달이면 오늘 날짜다', () => {
      const result = defaultTxDate({ selectedDay: null, expandedMonths: ['2026-07'], today });
      expect(result).toBe(today);
    });

    it('B-4. 펼친 달이 미래 달이면 그 달 1일이다', () => {
      const result = defaultTxDate({ selectedDay: null, expandedMonths: ['2026-09'], today });
      expect(result).toBe('2026-09-01');
    });

    it('B-5. 형식이 틀린 값은 무시한다', () => {
      const result = defaultTxDate({ selectedDay: null, expandedMonths: ['2026-07', 'invalid', '2026-08'], today });
      expect(result).toBe('2026-08-01');
    });
  });

  describe('C. 기본값', () => {
    it('C-1. 아무것도 없으면 오늘이다', () => {
      const result = defaultTxDate({ selectedDay: null, expandedMonths: [], today });
      expect(result).toBe(today);
    });

    it('C-2. expandedMonths 가 배열이 아니면 오늘이다', () => {
      // @ts-expect-error - testing invalid input
      const result = defaultTxDate({ selectedDay: null, expandedMonths: 'not-an-array', today });
      expect(result).toBe(today);
    });

    it('C-3. expandedMonths 가 빈 배열이면 오늘이다', () => {
      const result = defaultTxDate({ selectedDay: null, expandedMonths: [], today });
      expect(result).toBe(today);
    });
  });
});
