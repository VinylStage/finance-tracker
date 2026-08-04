import { describe, it, expect } from 'vitest';
import { formatWon, unpaidSummary, accountStatus } from './balanceView';

describe('formatWon', () => {
  it('should format positive numbers with comma and 원', () => {
    expect(formatWon(1000000)).toBe('1,000,000원');
  });

  it('should handle zero correctly', () => {
    expect(formatWon(0)).toBe('0원');
  });

  it('should handle negative numbers', () => {
    expect(formatWon(-12000)).toBe('-12,000원');
  });

  it('should return "0원" for invalid inputs', () => {
    expect(formatWon(null)).toBe('0원');
    expect(formatWon(undefined)).toBe('0원');
    expect(formatWon(NaN)).toBe('0원');
    expect(formatWon('abc')).toBe('0원');
  });

  it('should round decimal numbers', () => {
    expect(formatWon(1234.6)).toBe('1,235원');
  });
});

describe('unpaidSummary', () => {
  it('should transform card unpaid object correctly', () => {
    const input = {
      total: 50000,
      byMonth: {
        '2026-05': { deferred: 45000, settled: 0, unpaid: 45000 },
        '2026-04': { deferred: 30000, settled: 30000, unpaid: 0 }
      },
      unassigned: { deferred: 5000, settled: 0, count: 1 }
    };

    const expected = {
      total: 50000,
      months: [{ month: '2026-05', unpaid: 45000 }],
      unknownCount: 1
    };

    expect(unpaidSummary(input)).toEqual(expected);
  });

  it('should handle null input', () => {
    expect(unpaidSummary(null)).toEqual({ total: 0, months: [], unknownCount: 0 });
  });

  it('should handle undefined input', () => {
    expect(unpaidSummary(undefined)).toEqual({ total: 0, months: [], unknownCount: 0 });
  });

  it('should include months with negative unpaid values', () => {
    const input = {
      total: 10000,
      byMonth: {
        '2026-05': { deferred: 5000, settled: 0, unpaid: -1000 }
      },
      unassigned: { count: 0 }
    };

    const expected = {
      total: 10000,
      months: [{ month: '2026-05', unpaid: -1000 }],
      unknownCount: 0
    };

    expect(unpaidSummary(input)).toEqual(expected);
  });

  it('should sort months in ascending order', () => {
    const input = {
      total: 10000,
      byMonth: {
        '2026-12': { deferred: 5000, settled: 0, unpaid: 5000 },
        '2026-01': { deferred: 3000, settled: 0, unpaid: 3000 }
      },
      unassigned: { count: 0 }
    };

    const expected = {
      total: 10000,
      months: [
        { month: '2026-01', unpaid: 3000 },
        { month: '2026-12', unpaid: 5000 }
      ],
      unknownCount: 0
    };

    expect(unpaidSummary(input)).toEqual(expected);
  });
});

describe('accountStatus', () => {
  it('should return "no-account" for null/undefined account', () => {
    expect(accountStatus(null)).toBe('no-account');
    expect(accountStatus(undefined)).toBe('no-account');
  });

  it('should return "no-opening-balance" when opening_balance is null/undefined', () => {
    expect(accountStatus({ opening_balance: null })).toBe('no-opening-balance');
    expect(accountStatus({ opening_balance: undefined })).toBe('no-opening-balance');
  });

  it('should return "unknown-billing" when unassigned count > 0', () => {
    expect(accountStatus({
      opening_balance: 1000,
      card_unpaid: { unassigned: { count: 1 } }
    })).toBe('unknown-billing');
  });

  it('should return "no-activity" when counted and deferred are both zero', () => {
    expect(accountStatus({
      opening_balance: 1000,
      counted: 0,
      deferred: 0
    })).toBe('no-activity');
  });

  it('should return "ok" for normal accounts', () => {
    expect(accountStatus({
      opening_balance: 1000,
      counted: 10,
      deferred: 5
    })).toBe('ok');

    expect(accountStatus({
      opening_balance: 1000,
      counted: 0,
      deferred: 5
    })).toBe('ok');
  });
});

// 위임 검수에서 나온 회귀(#291 위임 실험).
//
// 첫 산출물이 toLocaleString() 을 로케일 없이 불렀다. 개발 환경에서는 통과하는데
// LC_ALL=de_DE.UTF-8 로 돌리면 1.234.567 이 되어 3개가 깨졌다. 저장소의 다른
// 포매터는 전부 'ko-KR' 을 명시하고 있었다.
describe('로케일 고정', () => {
  it('실행 환경 로케일과 무관하게 쉼표 구분을 쓴다', () => {
    // 이 단언은 시스템 로케일이 무엇이든 성립해야 한다.
    expect(formatWon(1234567)).toBe('1,234,567원');
    expect(formatWon(1234567)).not.toContain('.');
  });
});
