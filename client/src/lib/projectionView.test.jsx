import { describe, it, expect } from 'vitest';
import { monthLabel, describeScope, describeNegativeTurn } from './projectionView';

describe('monthLabel', () => {
  it('should format same year as just month', () => {
    expect(monthLabel('2026-09', '2026-08-04')).toBe('9월');
  });

  it('should format different year with year prefix', () => {
    expect(monthLabel('2027-01', '2026-08-04')).toBe('2027년 1월');
  });

  it('should handle same year edge case', () => {
    expect(monthLabel('2026-08', '2026-08-04')).toBe('8월');
  });

  it('should return empty string for invalid inputs', () => {
    expect(monthLabel(null, '2026-08-04')).toBe('');
    expect(monthLabel('엉뚱', '2026-08-04')).toBe('');
  });
});

describe('describeScope', () => {
  it('should describe multiple includes correctly', () => {
    expect(describeScope(['scheduled', 'card-unpaid']))
      .toBe('예정된 인출과 카드값만 반영했어요. 앞으로의 지출은 포함되지 않았어요.');
  });

  it('should handle single include', () => {
    expect(describeScope(['scheduled']))
      .toBe('예정된 인출만 반영했어요. 앞으로의 지출은 포함되지 않았어요.');
  });

  it('should handle empty array', () => {
    expect(describeScope([])).toBe('반영할 예정 내역이 없어요.');
  });

  it('should handle null input', () => {
    expect(describeScope(null)).toBe('반영할 예정 내역이 없어요.');
  });
});

describe('describeNegativeTurn', () => {
  it('should describe negative turn with formatted balance', () => {
    const projection = {
      negativeFrom: '2026-11',
      months: [
        { month: '2026-11', change: -600000, balance: -300000 }
      ],
      asOf: '2026-08-04'
    };
    
    expect(describeNegativeTurn(projection))
      .toBe('11월에 잔액이 -300,000원이 돼요.');
  });

  it('should return null when no negative turn', () => {
    expect(describeNegativeTurn({ negativeFrom: null, months: [], asOf: '2026-08-04' }))
      .toBe(null);
    
    expect(describeNegativeTurn(null))
      .toBe(null);
  });

  it('should handle negative balance correctly', () => {
    const projection = {
      negativeFrom: '2026-11',
      months: [
        { month: '2026-11', change: -600000, balance: -1234567 }
      ],
      asOf: '2026-08-04'
    };
    
    expect(describeNegativeTurn(projection))
      .toBe('11월에 잔액이 -1,234,567원이 돼요.');
  });
});

// 위임 검수에서 나온 회귀(#291 위임 실험 3회차).
//
// 첫 산출물이 describeNegativeTurn 에서 monthLabel 을 재사용하지 않고
// negativeFrom.substring(5,7) 로 직접 잘랐다. 두 가지가 깨졌다.
describe('전환 문구가 monthLabel 을 재사용한다', () => {
  it('한 자리 월에 선행 0 이 남지 않는다', () => {
    const s = describeNegativeTurn({
      negativeFrom: '2026-09', asOf: '2026-08-04',
      months: [{ month: '2026-09', change: -1, balance: -300000 }],
    });
    expect(s).toContain('9월에');
    expect(s).not.toContain('09월');
  });

  it('해가 넘어가면 연도를 붙인다', () => {
    // '1월' 만 나오면 올해인지 내년인지 알 수 없다.
    const s = describeNegativeTurn({
      negativeFrom: '2027-01', asOf: '2026-08-04',
      months: [{ month: '2027-01', change: -1, balance: -50000 }],
    });
    expect(s).toContain('2027년 1월');
  });
});
