import { describe, it, expect } from 'vitest';
import { remainingBudget, toSpentMap, trapIndex } from './quickEntry';

describe('remainingBudget', () => {
  it('예산이 있으면 남은 금액을 낸다', () => {
    const result = remainingBudget({ name: '식비', monthly_budget: 300000, major_type: '변동필수' }, { 식비: 100000 });
    expect(result).toEqual({
      show: true,
      budget: 300000,
      spent: 100000,
      remaining: 200000,
      over: 0,
      level: 'normal'
    });
  });

  it('80% 부터 주의다 — 대시보드와 같은 경계', () => {
    // 지출 79999 면 normal
    let result = remainingBudget({ name: '식비', monthly_budget: 100000, major_type: '변동필수' }, { 식비: 79999 });
    expect(result.level).toBe('normal');

    // 지출 80000 이면 caution
    result = remainingBudget({ name: '식비', monthly_budget: 100000, major_type: '변동필수' }, { 식비: 80000 });
    expect(result.level).toBe('caution');

    // 지출 100000 이면 caution
    result = remainingBudget({ name: '식비', monthly_budget: 100000, major_type: '변동필수' }, { 식비: 100000 });
    expect(result.level).toBe('caution');
  });

  it('넘으면 over 이고 초과분을 낸다', () => {
    const result = remainingBudget({ name: '식비', monthly_budget: 100000, major_type: '변동필수' }, { 식비: 130000 });
    expect(result).toEqual({
      show: true,
      budget: 100000,
      spent: 130000,
      remaining: 0,
      over: 30000,
      level: 'over'
    });
  });

  it('수입 카테고리는 표시하지 않는다', () => {
    const result = remainingBudget({ name: '월급', monthly_budget: 5000000, major_type: '수입' }, {});
    expect(result).toEqual({
      show: false,
      budget: 0,
      spent: 0,
      remaining: 0,
      over: 0,
      level: 'none'
    });
  });

  it('예산 미설정이면 표시하지 않는다', () => {
    const result1 = remainingBudget({ name: '식비', monthly_budget: 0, major_type: '변동필수' }, {});
    expect(result1.show).toBe(false);

    const result2 = remainingBudget({ name: '식비', monthly_budget: null, major_type: '변동필수' }, {});
    expect(result2.show).toBe(false);

    const result3 = remainingBudget({ name: '식비', monthly_budget: undefined, major_type: '변동필수' }, {});
    expect(result3.show).toBe(false);

    const result4 = remainingBudget({ name: '식비', monthly_budget: '없음', major_type: '변동필수' }, {});
    expect(result4.show).toBe(false);
  });

  it('category 나 지출맵이 없어도 죽지 않는다', () => {
    expect(() => remainingBudget(null, null)).not.toThrow();
    expect(() => remainingBudget(undefined, {})).not.toThrow();
    expect(() => remainingBudget({ name: '식비', monthly_budget: 300000, major_type: '변동필수' }, null)).not.toThrow();

    const result = remainingBudget({ name: '식비', monthly_budget: 300000, major_type: '변동필수' }, null);
    expect(result).toEqual({
      show: true,
      budget: 300000,
      spent: 0,
      remaining: 300000,
      over: 0,
      level: 'normal'
    });
  });
});

describe('toSpentMap', () => {
  it('배열을 카테고리별 합계로 바꾼다', () => {
    const result = toSpentMap([{ category: '식비', total: 1000 }, { category: '교통', total: 500 }]);
    expect(result).toEqual({ 식비: 1000, 교통: 500 });
  });

  it('같은 카테고리가 여러 번 오면 더한다', () => {
    const result = toSpentMap([{ category: '식비', total: 1000 }, { category: '식비', total: 2000 }]);
    expect(result).toEqual({ 식비: 3000 });
  });

  it('망가진 행은 버리고 배열이 아니면 빈 맵', () => {
    const result = toSpentMap([null, { total: 5 }, { category: null, total: 5 }, { category: '식비', total: '삼천' }]);
    expect(result).toEqual({ 식비: 0 });

    expect(toSpentMap(undefined)).toEqual({});
    expect(toSpentMap(null)).toEqual({});
    expect(toSpentMap('식비')).toEqual({});
  });
});

describe('trapIndex', () => {
  it('앞으로 돌다가 끝에서 처음으로 순환한다', () => {
    expect(trapIndex(0, 3, false)).toBe(1);
    expect(trapIndex(1, 3, false)).toBe(2);
    expect(trapIndex(2, 3, false)).toBe(0);
  });

  it('뒤로 돌다가 처음에서 끝으로 순환한다', () => {
    expect(trapIndex(2, 3, true)).toBe(1);
    expect(trapIndex(1, 3, true)).toBe(0);
    expect(trapIndex(0, 3, true)).toBe(2);
  });

  it('컨테이너에 포커스가 있으면(-1) 양끝에서 시작한다', () => {
    expect(trapIndex(-1, 3, false)).toBe(0);
    expect(trapIndex(-1, 3, true)).toBe(2);
  });

  it('포커스 가능한 요소가 없으면 -1', () => {
    expect(trapIndex(0, 0, false)).toBe(-1);
    expect(trapIndex(-1, 0, true)).toBe(-1);
  });

  it('count 가 숫자가 아니면 -1', () => {
    expect(trapIndex(0, NaN, false)).toBe(-1);
    expect(trapIndex(0, undefined, false)).toBe(-1);
    expect(trapIndex(0, Infinity, false)).toBe(-1);
    expect(trapIndex(0, -3, false)).toBe(-1);
  });
});
