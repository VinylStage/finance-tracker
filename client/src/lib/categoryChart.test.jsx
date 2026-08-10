import { describe, it, expect } from 'vitest';
import { capTopCategories, sliceColor, shareOf, OTHERS_LABEL, OTHERS_COLOR, SLICE_RAMP } from './categoryChart';

describe('capTopCategories', () => {
  it('5개 이하면 원본 그대로 — 기타를 만들지 않는다', () => {
    const input = [
      { category: '식비', total: 5000 },
      { category: '교통', total: 3000 }
    ];
    const result = capTopCategories(input);
    expect(result.slices).toHaveLength(2);
    expect(result.others).toEqual([]);
    expect(result.othersTotal).toBe(0);
  });

  it('정확히 5개는 자르지 않는다 — 경계', () => {
    const input = [
      { category: 'c1', total: 500 },
      { category: 'c2', total: 400 },
      { category: 'c3', total: 300 },
      { category: 'c4', total: 200 },
      { category: 'c5', total: 100 }
    ];
    const result = capTopCategories(input);
    expect(result.slices).toHaveLength(5);
    expect(result.slices.some(s => s.category === OTHERS_LABEL)).toBe(false);
    expect(result.othersTotal).toBe(0);
  });

  it('6개부터 기타가 생긴다 — 기타가 1개만 담아도 의도된 동작', () => {
    const input = [
      { category: 'c1', total: 600 },
      { category: 'c2', total: 500 },
      { category: 'c3', total: 400 },
      { category: 'c4', total: 300 },
      { category: 'c5', total: 200 },
      { category: 'c6', total: 100 }
    ];
    const result = capTopCategories(input);
    expect(result.slices).toHaveLength(6);
    expect(result.slices[result.slices.length - 1].category).toBe(OTHERS_LABEL);
    expect(result.slices[result.slices.length - 1].isOthers).toBe(true);
    expect(result.slices[result.slices.length - 1].total).toBe(100);
    expect(result.others).toHaveLength(1);
  });

  it('기타 합계는 6번째 이후 전부를 더한다', () => {
    const input = [
      { category: 'c1', total: 600 },
      { category: 'c2', total: 500 },
      { category: 'c3', total: 400 },
      { category: 'c4', total: 300 },
      { category: 'c5', total: 200 },
      { category: 'c6', total: 100 },
      { category: 'c7', total: 50 },
      { category: 'c8', total: 25 }
    ];
    const result = capTopCategories(input);
    expect(result.othersTotal).toBe(175);
    expect(result.others).toHaveLength(3);
    expect(result.slices).toHaveLength(6);
  });

  it('API 정렬을 신뢰하지 않는다 — 뒤섞여 들어와도 큰 순으로 자른다', () => {
    const input = [
      { category: 'a', total: 100 },
      { category: 'b', total: 900 },
      { category: 'c', total: 50 },
      { category: 'd', total: 800 },
      { category: 'e', total: 700 },
      { category: 'f', total: 600 }
    ];
    const result = capTopCategories(input);
    expect(result.slices[0].category).toBe('b');
    expect(result.slices[result.slices.length - 1].category).toBe(OTHERS_LABEL);
    expect(result.slices[result.slices.length - 1].total).toBe(50);
    // 정렬을 안 하면 상위 5개 판정이 뒤집혀 큰 지출이 '기타' 로 숨는다
  });

  it('category 가 null 이거나 항목이 null 이면 버린다', () => {
    const input = [
      { category: '식비', total: 5000 },
      null,
      { category: null, total: 9999 },
      { total: 1 }
    ];
    const result = capTopCategories(input);
    expect(result.slices).toHaveLength(1);
    expect(result.slices[0].category).toBe('식비');
  });

  it('배열이 아니면 빈 결과', () => {
    expect(capTopCategories(undefined)).toEqual({ slices: [], others: [], othersTotal: 0 });
    expect(capTopCategories(null)).toEqual({ slices: [], others: [], othersTotal: 0 });
    expect(capTopCategories('식비')).toEqual({ slices: [], others: [], othersTotal: 0 });
  });
});

describe('sliceColor', () => {
  it('순위가 그대로 램프 농도가 된다', () => {
    expect(sliceColor(0)).toBe(SLICE_RAMP[0]);
    expect(sliceColor(4)).toBe(SLICE_RAMP[4]);
  });

  it('램프 길이를 넘는 순위는 마지막 색으로 고정된다', () => {
    expect(sliceColor(5)).toBe(SLICE_RAMP[SLICE_RAMP.length - 1]);
    expect(sliceColor(99)).toBe(SLICE_RAMP[SLICE_RAMP.length - 1]);
    // 고정하지 않으면 undefined 가 CSS 로 나가 조각이 색 없이 그려진다
  });

  it('기타는 램프 밖 무채색이다 — 카테고리가 아니라 묶음이라서', () => {
    expect(sliceColor(0, true)).toBe(OTHERS_COLOR);
    expect(sliceColor(3, true)).toBe(OTHERS_COLOR);
    expect(SLICE_RAMP.includes(OTHERS_COLOR)).toBe(false);
  });
});

describe('shareOf', () => {
  it('비율을 낸다', () => {
    expect(shareOf(25, 100)).toBe(0.25);
    expect(shareOf(0, 100)).toBe(0);
  });

  it('총합이 0 이거나 음수거나 숫자가 아니면 0 — 나누기를 막는다', () => {
    expect(shareOf(10, 0)).toBe(0);
    expect(shareOf(10, -5)).toBe(0);
    expect(shareOf(10, undefined)).toBe(0);
    expect(shareOf(10, '많음')).toBe(0);
    // 막지 않으면 Infinity 나 NaN 이 그대로 퍼센트 라벨에 찍힌다
  });
});
