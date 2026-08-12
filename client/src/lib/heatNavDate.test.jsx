import { describe, it, expect } from 'vitest';
import { dailyBasis, heatLevel, heatClass, heatLabel, HEAT_CLASS } from './heatmap';
import { categoryStyle, CATEGORY_STYLE, AMOUNT_MARK } from './categoryStyle';
import { NAV_GROUPS, MOBILE_PRIMARY, groupForPath } from './nav';
import { localYMD, localYearMonth } from './date';

describe('heatmap', () => {
  it('기준선은 월 예산을 그 달 일수로 나눈 값이다', () => {
    expect(dailyBasis(310000, 31, 0)).toBe(10000);
  });

  it('예산이나 일수를 정의할 수 없으면 폴백을 쓴다', () => {
    expect(dailyBasis(0, 31, 7000)).toBe(7000);
    expect(dailyBasis(310000, 0, 7000)).toBe(7000);
    expect(dailyBasis(-100, 31, 7000)).toBe(7000);
  });

  it('폴백도 없으면 0 이다', () => {
    expect(dailyBasis(0, 0, 0)).toBe(0);
    expect(dailyBasis(0, 0, -5)).toBe(0);
  });

  it('지출이 없으면 0단계다', () => {
    expect(heatLevel(0, 10000)).toBe(0);
    expect(heatLevel(-500, 10000)).toBe(0);
  });

  it('기준선을 정의할 수 없으면 색을 안 칠한다', () => {
    expect(heatLevel(50000, 0)).toBe(0);
  });

  it('경계는 전부 이하(<=)로 아래 단계에 붙는다', () => {
    // 기준선 10000으로 아래를 각각 확인
    expect(heatLevel(5000, 10000)).toBe(1); // 기준의 0.5배 정각
    expect(heatLevel(5001, 10000)).toBe(2);
    expect(heatLevel(10000, 10000)).toBe(2); // 기준 정각
    expect(heatLevel(10001, 10000)).toBe(3);
    expect(heatLevel(20000, 10000)).toBe(3); // 기준의 2배 정각
    expect(heatLevel(20001, 10000)).toBe(4);
  });

  it('단계마다 다른 클래스를 준다', () => {
    expect(HEAT_CLASS.length).toBe(5);
    expect(new Set(HEAT_CLASS).size).toBe(5); // 서로 모두 다름
    
    expect(heatClass(0, 10000)).toBe(HEAT_CLASS[0]);
    expect(heatClass(30000, 10000)).toBe(HEAT_CLASS[4]);
  });

  it('지출이 없으면 그렇게 말한다', () => {
    expect(heatLabel(0, 10000)).toBe('지출 없음');
    expect(heatLabel(50000, 0)).toBe('지출 없음'); // 기준이 없어 0단계다
  });

  it('배수는 소수점 한 자리다', () => {
    expect(heatLabel(15000, 10000)).toBe('기준의 1.5배');
    expect(heatLabel(33333, 10000)).toBe('기준의 3.3배');
  });
});

describe('categoryStyle', () => {
  it('대분류마다 다른 아이콘을 준다', () => {
    const icons = ['수입', '고정지출', '변동필수', '부채상환', '선택지출', '저축', '미분류']
      .map(type => categoryStyle(type).icon);
    expect(new Set(icons).size).toBe(7); // 서로 모두 다름
  });

  it('모르는 대분류는 기본 아이콘으로 흘린다', () => {
    expect(categoryStyle('없는대분류').icon).toBe('category');
    expect(categoryStyle(undefined).icon).toBe('category');
    expect(categoryStyle(null).icon).toBe('category');
  });

  it('색은 전 대분류가 같다', () => {
    const colors = ['수입', '고정지출', '변동필수', '부채상환', '선택지출', '저축', '미분류']
      .map(type => categoryStyle(type).color);
    expect(new Set(colors).size).toBe(1); // 전부 같은 값
  });

  it('미리 만든 표도 같은 값을 준다', () => {
    expect(CATEGORY_STYLE['수입']).toEqual(categoryStyle('수입'));
    expect(Object.keys(CATEGORY_STYLE).length).toBe(7);
  });

  it('금액 부호를 색 밖의 채널로도 구분한다', () => {
    expect(AMOUNT_MARK.income.arrow).not.toBe(AMOUNT_MARK.expense.arrow);
    expect(AMOUNT_MARK.income.sign).toBe('+');
    expect(AMOUNT_MARK.expense.sign).toBe('-');
  });
});

describe('nav', () => {
  it('1차 그룹은 다섯이다', () => {
    expect(NAV_GROUPS.length).toBe(5);
    expect(NAV_GROUPS.map((g) => g.id)).toEqual(['home', 'transactions', 'analysis', 'assets', 'settings']);
  });

  it('모바일 상시 노출은 셋이다', () => {
    expect(MOBILE_PRIMARY).toEqual(['home', 'transactions', 'analysis']);
    expect(MOBILE_PRIMARY.every(id => NAV_GROUPS.some(g => g.id === id))).toBe(true);
  });

  it('루트 경로는 홈이다', () => {
    expect(groupForPath('/').id).toBe('home');
  });

  it('자식 경로는 그 그룹으로 간다', () => {
    expect(groupForPath('/assets/installments').id).toBe('assets');
    expect(groupForPath('/analysis/comparison').id).toBe('analysis');
    expect(groupForPath('/settings').id).toBe('settings');
  });

  it('비슷한 이름의 다른 경로에 잘못 붙지 않는다', () => {
    expect(groupForPath('/analysis-x')).toBeNull();
    expect(groupForPath('/assetsfoo')).toBeNull();
    expect(groupForPath('/없는경로')).toBeNull();
  });
});

describe('date', () => {
  it('로컬 타임존 기준으로 자리를 채워 적는다', () => {
    const d = new Date(2026, 0, 5, 3, 0, 0); // 2026-01-05 03:00 로컬
    expect(localYMD(d)).toBe('2026-01-05');
    expect(localYearMonth(d)).toBe('2026-01');
    
    // 연말 경계 확인
    expect(localYMD(new Date(2026, 11, 31, 23, 30))).toBe('2026-12-31');
  });
});
