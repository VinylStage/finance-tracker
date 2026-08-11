import { describe, it, expect } from 'vitest';
import {
  budgetStatus,
  overflowWidthPx,
  budgetLabel,
  CAUTION_TICK_PCT,
  BUDGET_TONE,
  BUDGET_MARK,
} from './budget';

describe('A. budgetStatus — 단계 판정', () => {
  it('A-1. (0, 100000) → level 이 normal, ratio 가 0', () => {
    const result = budgetStatus(0, 100000);
    expect(result.level).toBe('normal');
    expect(result.ratio).toBe(0);
  });

  it('A-2. (79999, 100000) → level 이 normal — 80% 미만', () => {
    const result = budgetStatus(79999, 100000);
    expect(result.level).toBe('normal');
  });

  it('A-3. (80000, 100000) → level 이 caution — 정확히 80% 는 주의', () => {
    const result = budgetStatus(80000, 100000);
    expect(result.level).toBe('caution');
  });

  it('A-4. (99999, 100000) → level 이 caution', () => {
    const result = budgetStatus(99999, 100000);
    expect(result.level).toBe('caution');
  });

  it('A-5. (100000, 100000) → level 이 caution — 정확히 100% 는 초과가 아니다', () => {
    const result = budgetStatus(100000, 100000);
    expect(result.level).toBe('caution');
  });

  it('A-6. (100001, 100000) → level 이 over', () => {
    const result = budgetStatus(100001, 100000);
    expect(result.level).toBe('over');
  });

  it('A-7. (150000, 100000) → level 이 over, ratio 가 1.5', () => {
    const result = budgetStatus(150000, 100000);
    expect(result.level).toBe('over');
    expect(result.ratio).toBe(1.5);
  });
});

describe('B. budgetStatus — 예산이 없거나 이상할 때', () => {
  it('B-1. (50000, 0) → 전부 중립', () => {
    const result = budgetStatus(50000, 0);
    expect(result.level).toBe('normal');
    expect(result.ratio).toBe(0);
    expect(result.barPct).toBe(0);
    expect(result.remaining).toBe(0);
    expect(result.over).toBe(0);
    expect(result.overRatio).toBe(0);
  });

  it('B-2. (50000, -100) → B-1 과 같다', () => {
    const result = budgetStatus(50000, -100);
    expect(result.level).toBe('normal');
    expect(result.ratio).toBe(0);
    expect(result.barPct).toBe(0);
    expect(result.remaining).toBe(0);
    expect(result.over).toBe(0);
    expect(result.overRatio).toBe(0);
  });

  it('B-3. (50000, null) → B-1 과 같다', () => {
    const result = budgetStatus(50000, null);
    expect(result.level).toBe('normal');
    expect(result.ratio).toBe(0);
    expect(result.barPct).toBe(0);
    expect(result.remaining).toBe(0);
    expect(result.over).toBe(0);
    expect(result.overRatio).toBe(0);
  });

  it('B-4. (50000, undefined) → B-1 과 같다', () => {
    const result = budgetStatus(50000, undefined);
    expect(result.level).toBe('normal');
    expect(result.ratio).toBe(0);
    expect(result.barPct).toBe(0);
    expect(result.remaining).toBe(0);
    expect(result.over).toBe(0);
    expect(result.overRatio).toBe(0);
  });

  it('B-5. (null, 100000) → used 가 0 으로 취급돼 level 이 normal, remaining 이 100000', () => {
    const result = budgetStatus(null, 100000);
    expect(result.level).toBe('normal');
    expect(result.remaining).toBe(100000);
  });

  it('B-6. (\'abc\', 100000) → 숫자가 아닌 값도 0 으로 취급 — remaining 이 100000', () => {
    const result = budgetStatus('abc', 100000);
    expect(result.remaining).toBe(100000);
  });
});

describe('C. budgetStatus — 막대와 금액', () => {
  it('C-1. (50000, 100000) → barPct 50, remaining 50000, over 0, overRatio 0', () => {
    const result = budgetStatus(50000, 100000);
    expect(result.barPct).toBe(50);
    expect(result.remaining).toBe(50000);
    expect(result.over).toBe(0);
    expect(result.overRatio).toBe(0);
  });

  it('C-2. (150000, 100000) → barPct 가 100 을 넘지 않는다(100), remaining 0, over 50000, overRatio 0.5', () => {
    const result = budgetStatus(150000, 100000);
    expect(result.barPct).toBe(100);
    expect(result.remaining).toBe(0);
    expect(result.over).toBe(50000);
    expect(result.overRatio).toBe(0.5);
  });

  it('C-3. (33333, 100000) → barPct 가 반올림된 정수다(33)', () => {
    const result = budgetStatus(33333, 100000);
    expect(result.barPct).toBe(33);
  });

  it('C-4. (0, 100000) → barPct 0, remaining 100000', () => {
    const result = budgetStatus(0, 100000);
    expect(result.barPct).toBe(0);
    expect(result.remaining).toBe(100000);
  });
});

describe('D. overflowWidthPx', () => {
  it('D-1. overflowWidthPx(null) → 0', () => {
    expect(overflowWidthPx(null)).toBe(0);
  });

  it('D-2. overflowWidthPx(undefined) → 0', () => {
    expect(overflowWidthPx(undefined)).toBe(0);
  });

  it('D-3. 초과가 없는 상태(budgetStatus(50000, 100000)) → 0', () => {
    const status = budgetStatus(50000, 100000);
    expect(overflowWidthPx(status)).toBe(0);
  });

  it('D-4. overRatio 가 0 인 객체 { overRatio: 0 } → 0', () => {
    expect(overflowWidthPx({ overRatio: 0 })).toBe(0);
  });

  it('D-5. budgetStatus(150000, 100000) — overRatio 0.5 → 44 (상한값)', () => {
    const status = budgetStatus(150000, 100000);
    expect(overflowWidthPx(status)).toBe(44);
  });

  it('D-6. budgetStatus(200000, 100000) — overRatio 1.0, 상한을 넘김 → 44 로 포화된다 — 0.5 일 때와 같은 값', () => {
    const status = budgetStatus(200000, 100000);
    expect(overflowWidthPx(status)).toBe(44);
  });

  it('D-7. budgetStatus(110000, 100000) — overRatio 0.1 → 8 보다 크고 44 보다 작다', () => {
    const status = budgetStatus(110000, 100000);
    const width = overflowWidthPx(status);
    expect(width).toBeGreaterThan(8);
    expect(width).toBeLessThan(44);
  });

  it('D-8. 초과가 아주 작을 때({ overRatio: 0.001 }) → 최소값 8 이상이다', () => {
    const width = overflowWidthPx({ overRatio: 0.001 });
    expect(width).toBeGreaterThanOrEqual(8);
  });
});

describe('E. budgetLabel', () => {
  it('E-1. over 상태 → 문자열에 \'초과\' 가 들어가고 over 금액이 들어간다', () => {
    const fmt = (n) => String(n);
    const status = budgetStatus(150000, 100000);
    const label = budgetLabel(status, fmt);
    expect(label).toContain('초과');
    expect(label).toContain('50000');
  });

  it('E-2. caution 상태 → \'남음\' 과 \'주의\' 가 둘 다 들어간다', () => {
    const fmt = (n) => String(n);
    const status = budgetStatus(90000, 100000);
    const label = budgetLabel(status, fmt);
    expect(label).toContain('남음');
    expect(label).toContain('주의');
  });

  it('E-3. normal 상태 → \'남음\' 이 들어가고 \'주의\' 는 들어가지 않는다', () => {
    const fmt = (n) => String(n);
    const status = budgetStatus(50000, 100000);
    const label = budgetLabel(status, fmt);
    expect(label).toContain('남음');
    expect(label).not.toContain('주의');
  });

  it('E-4. fmt 가 실제로 불린다 → fmt 를 vi.fn() 으로 만들어 호출됐는지 확인한다', () => {
    const mockFmt = vi.fn((n) => String(n));
    const status = budgetStatus(50000, 100000);
    budgetLabel(status, mockFmt);
    expect(mockFmt).toHaveBeenCalled();
  });
});

describe('F. 상수', () => {
  it('F-1. CAUTION_TICK_PCT → 80 이다', () => {
    expect(CAUTION_TICK_PCT).toBe(80);
  });

  it('F-2. BUDGET_TONE → normal · caution · over 세 키가 있고 각각 bar 와 text 를 갖는다', () => {
    expect(BUDGET_TONE.normal).toHaveProperty('bar');
    expect(BUDGET_TONE.normal).toHaveProperty('text');
    expect(BUDGET_TONE.caution).toHaveProperty('bar');
    expect(BUDGET_TONE.caution).toHaveProperty('text');
    expect(BUDGET_TONE.over).toHaveProperty('bar');
    expect(BUDGET_TONE.over).toHaveProperty('text');
  });

  it('F-3. BUDGET_MARK → normal 은 null 이고, caution 과 over 는 비어 있지 않은 문자열이다', () => {
    expect(BUDGET_MARK.normal).toBeNull();
    expect(BUDGET_MARK.caution).toBeDefined();
    expect(BUDGET_MARK.caution).not.toBe('');
    expect(BUDGET_MARK.over).toBeDefined();
    expect(BUDGET_MARK.over).not.toBe('');
  });

  it('F-4. BUDGET_MARK.caution 과 BUDGET_MARK.over → 서로 다르다', () => {
    expect(BUDGET_MARK.caution).not.toBe(BUDGET_MARK.over);
  });
});
