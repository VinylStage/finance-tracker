import { describe, it, expect, beforeEach } from 'vitest';
import { applyTheme } from './theme';
import { capTopCategories, sliceColor, OTHERS_LABEL } from './categoryChart';

// Mock document for theme tests
const mockDocument = {
  removeAttribute: vi.fn(),
  setAttribute: vi.fn(),
  getAttribute: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  createElement: vi.fn().mockReturnValue({}),
  querySelector: vi.fn(),
  querySelectorAll: vi.fn(),
  documentElement: {
    removeAttribute: vi.fn(),
    setAttribute: vi.fn(),
    getAttribute: vi.fn(),
  }
};

// Mock global object
global.document = mockDocument;

describe('theme', () => {
  beforeEach(() => {
    // Reset mocks
    mockDocument.documentElement.removeAttribute.mockReset();
    mockDocument.documentElement.setAttribute.mockReset();
    mockDocument.documentElement.getAttribute.mockReset();
    
    // Set up initial state
    mockDocument.documentElement.getAttribute.mockReturnValue(null);
  });

  it('root를 안 주면 문서 루트에 적용한다 — 다크', () => {
    const result = applyTheme('dark');
    expect(result).toBe('dark');
    expect(mockDocument.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
  });

  it('라이트는 속성을 지운다 — 기본 팔레트가 곧 라이트다', () => {
    // First set to dark
    applyTheme('dark');
    mockDocument.documentElement.getAttribute.mockReturnValue('dark');
    
    // Then switch to light
    const result = applyTheme('light');
    expect(result).toBe('light');
    expect(mockDocument.documentElement.removeAttribute).toHaveBeenCalledWith('data-theme');
  });

  it('모르는 값은 라이트로 떨어진다', () => {
    const result = applyTheme('아무거나');
    expect(result).toBe('light');
    expect(mockDocument.documentElement.removeAttribute).toHaveBeenCalledWith('data-theme');
  });
});

describe('categoryChart', () => {
  it('자료가 아니면 빈 결과를 낸다 — 터지지 않는다', () => {
    expect(capTopCategories(null)).toEqual({ slices: [], others: [], othersTotal: 0 });
    expect(capTopCategories('x')).toEqual({ slices: [], others: [], othersTotal: 0 });
  });

  it('카테고리가 없는 행은 빼고 센다', () => {
    const input = [null, { category: null, total: 5 }, { category: 'A', total: 3 }];
    const result = capTopCategories(input);
    expect(result.slices).toEqual([{ category: 'A', total: 3 }]);
  });

  it('금액이 없는 행은 0 으로 보고 정렬 뒤로 보낸다', () => {
    const input = [{ category: 'A' }, { category: 'B', total: 2 }];
    const result = capTopCategories(input);
    expect(result.slices[0].category).toBe('B');
    expect(result.slices[1].category).toBe('A');
    expect(result.slices[1].total).toBeUndefined();
  });

  it('여섯 개째부터 «기타» 가 생긴다', () => {
    const input = [
      { category: 'c1', total: 60 },
      { category: 'c2', total: 50 },
      { category: 'c3', total: 40 },
      { category: 'c4', total: 30 },
      { category: 'c5', total: 20 },
      { category: 'c6', total: 10 }
    ];
    const result = capTopCategories(input);
    expect(result.slices).toHaveLength(6);
    expect(result.slices[result.slices.length - 1].category).toBe(OTHERS_LABEL);
    expect(result.slices[result.slices.length - 1].isOthers).toBe(true);
    expect(result.slices[result.slices.length - 1].total).toBe(10);
    expect(result.othersTotal).toBe(10);
    expect(result.others).toHaveLength(1);
  });

  it('금액이 없는 행만 «기타» 로 밀리면 합계가 0 이다', () => {
    const input = [
      { category: 'c1', total: 60 },
      { category: 'c2', total: 50 },
      { category: 'c3', total: 40 },
      { category: 'c4', total: 30 },
      { category: 'c5', total: 20 },
      { category: 'c6' }
    ];
    const result = capTopCategories(input);
    expect(result.othersTotal).toBe(0);
  });

  it('램프를 넘는 index 는 마지막 색으로 고정된다', () => {
    expect(sliceColor(9, false)).toBe('var(--color-brand-tint)');
  });

  it('기타는 램프 밖 무채색이다', () => {
    expect(sliceColor(0, true)).toBe('var(--color-flow-rest)');
  });
});
