import { describe, it, expect } from 'vitest';
import {
  budgetStatus, overflowWidthPx, budgetLabel,
  CAUTION_TICK_PCT, BUDGET_TONE, BUDGET_MARK,
} from './budget';
import { monthsBetween, savingsProgress, MILESTONES } from './savingsProgress';

describe('budgetStatus', () => {
  it('예산의 절반을 쓰면 중립이다', () => {
    const result = budgetStatus(50, 100);
    expect(result.level).toBe('normal');
    expect(result.remaining).toBe(50);
    expect(result.over).toBe(0);
    expect(result.barPct).toBe(50);
  });

  it('소진율 80% 정각은 주의다', () => {
    const result = budgetStatus(80, 100);
    expect(result.level).toBe('caution');

    // 경계가 주의 쪽에 붙는다. 79.9% 는 중립이다.
    const result2 = budgetStatus(79, 100);
    expect(result2.level).toBe('normal');
  });

  it('소진율 100% 정각은 아직 초과가 아니다', () => {
    const result = budgetStatus(100, 100);
    expect(result.level).toBe('caution');
    expect(result.over).toBe(0);
    expect(result.remaining).toBe(0);
  });

  it('예산을 넘기면 초과다', () => {
    const result = budgetStatus(120, 100);
    expect(result.level).toBe('over');
    expect(result.over).toBe(20);
    expect(result.remaining).toBe(0);
    expect(result.overRatio).toBeCloseTo(0.2);
  });

  it('막대는 100 을 넘지 않는다', () => {
    const result = budgetStatus(300, 100);
    expect(result.barPct).toBe(100);
  });

  it('예산이 0 이면 소진율을 정의하지 않는다', () => {
    const result = budgetStatus(500, 0);
    expect(result).toEqual({
      level: 'normal',
      ratio: 0,
      barPct: 0,
      remaining: 0,
      over: 0,
      overRatio: 0
    });

    // 음수 예산도 같다
    const result2 = budgetStatus(500, -10);
    expect(result2.level).toBe('normal');
    expect(result2.ratio).toBe(0);
  });

  it('숫자가 아닌 값은 0 으로 본다', () => {
    expect(budgetStatus(undefined, 100).remaining).toBe(100);
    expect(budgetStatus(null, 100).level).toBe('normal');
  });

  it('초과가 없으면 초과 세그먼트도 없다', () => {
    expect(overflowWidthPx(budgetStatus(50, 100))).toBe(0);
    expect(overflowWidthPx(budgetStatus(100, 100))).toBe(0);
    expect(overflowWidthPx(null)).toBe(0);
  });

  it('초과 세그먼트는 최소 폭을 갖는다', () => {
    const result = overflowWidthPx(budgetStatus(101, 100));
    expect(result).toBeGreaterThanOrEqual(8);
    expect(result).toBeLessThanOrEqual(44);
  });

  it('초과 세그먼트는 상한에서 포화한다', () => {
    expect(overflowWidthPx(budgetStatus(150, 100))).toBe(44);
    expect(overflowWidthPx(budgetStatus(1000, 100))).toBe(44);
  });

  it('단계마다 다른 문구를 낸다', () => {
    const fmt = (n) => `${n}원`;
    
    expect(budgetLabel(budgetStatus(50, 100), fmt)).toBe('50원 남음');
    expect(budgetLabel(budgetStatus(90, 100), fmt)).toBe('10원 남음 · 주의');
    expect(budgetLabel(budgetStatus(130, 100), fmt)).toBe('30원 초과');
  });

  it('색과 아이콘 채널이 단계마다 다르다', () => {
    expect(Object.keys(BUDGET_TONE)).toEqual(['normal', 'caution', 'over']);
    expect(BUDGET_TONE.normal.bar).not.toBe(BUDGET_TONE.caution.bar);
    expect(BUDGET_TONE.normal.bar).not.toBe(BUDGET_TONE.over.bar);
    expect(BUDGET_TONE.caution.bar).not.toBe(BUDGET_TONE.over.bar);

    expect(BUDGET_MARK.normal).toBeNull();
    expect(BUDGET_MARK.caution).not.toBeNull();
    expect(BUDGET_MARK.over).not.toBeNull();
    expect(BUDGET_MARK.caution).not.toBe(BUDGET_MARK.over);
  });

  it('주의 눈금은 80 이다', () => {
    expect(CAUTION_TICK_PCT).toBe(80);
  });
});

describe('monthsBetween', () => {
  it('날짜가 지났으면 그 달을 센다', () => {
    expect(monthsBetween('2026-01-15', '2026-04-15')).toBe(3);
    expect(monthsBetween('2026-01-15', '2026-04-20')).toBe(3);
  });

  it('날짜가 아직 안 지났으면 그 달은 안 센다', () => {
    expect(monthsBetween('2026-01-15', '2026-04-14')).toBe(2);
  });

  it('연도를 넘어도 센다', () => {
    expect(monthsBetween('2025-11-01', '2026-02-01')).toBe(3);
  });

  it('형식이 틀리면 null 이다', () => {
    expect(monthsBetween('2026-1-5', '2026-04-15')).toBeNull();
    expect(monthsBetween(null, '2026-04-15')).toBeNull();
    expect(monthsBetween('2026-01-15', undefined)).toBeNull();
    expect(monthsBetween(20260115, '2026-04-15')).toBeNull();
  });
});

describe('savingsProgress', () => {
  const PRODUCT = {
    start_date: '2026-01-10',
    maturity_date: '2027-01-10',
    monthly_contribution: 100000,
    status: '진행중',
  };

  it('만기일이 없으면 진행률을 정의하지 않는다', () => {
    const result = savingsProgress({ ...PRODUCT, maturity_date: null }, '2026-06-10');
    expect(result.hasSchedule).toBe(false);
    expect(result.barPct).toBe(0);
    expect(result.goal).toBe(0);

    // 월납입액이 0 일 때도 같다
    const result2 = savingsProgress({ ...PRODUCT, monthly_contribution: 0 }, '2026-06-10');
    expect(result2.hasSchedule).toBe(false);
  });

  it('시작일 당일에 1회차를 낸 것으로 센다', () => {
    const result = savingsProgress(PRODUCT, '2026-01-10');
    expect(result.totalMonths).toBe(12);
    expect(result.paidMonths).toBe(1);
    expect(result.goal).toBe(1200000);
    expect(result.contributed).toBe(100000);
    expect(result.remaining).toBe(1100000);
  });

  it('만기 처리된 상품은 날짜와 무관하게 목표를 채운다', () => {
    const result = savingsProgress({ ...PRODUCT, status: '완료' }, '2026-02-10');
    expect(result.paidMonths).toBe(12);
    expect(result.ratio).toBe(1);
    expect(result.barPct).toBe(100);
    expect(result.remaining).toBe(0);
    expect(result.milestone).toBe(0.75);
  });

  it('마일스톤은 지난 것 중 가장 높은 것을 준다', () => {
    expect(MILESTONES).toEqual([0.25, 0.5, 0.75]);

    // 2/12 라 25% 전
    expect(savingsProgress(PRODUCT, '2026-02-10').milestone).toBeNull();
    
    // 4/12
    expect(savingsProgress(PRODUCT, '2026-04-10').milestone).toBe(0.25);
    
    // 7/12
    expect(savingsProgress(PRODUCT, '2026-07-10').milestone).toBe(0.5);
    
    // 10/12
    expect(savingsProgress(PRODUCT, '2026-10-10').milestone).toBe(0.75);
  });

  it('납입 회차는 총 회차를 넘지 않는다', () => {
    const result = savingsProgress(PRODUCT, '2028-01-10');
    expect(result.paidMonths).toBe(12);
    expect(result.barPct).toBe(100);
  });
});
