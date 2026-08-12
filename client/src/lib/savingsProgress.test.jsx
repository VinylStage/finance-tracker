import { describe, it, expect } from 'vitest';
import { monthsBetween, savingsProgress, MILESTONES } from './savingsProgress';

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

    expect(savingsProgress(PRODUCT, '2026-02-10').milestone).toBeNull(); // 2/12 라 25% 전
    expect(savingsProgress(PRODUCT, '2026-04-10').milestone).toBe(0.25); // 4/12

    // 정각도 반드시 넣는다.
    expect(savingsProgress(PRODUCT, '2026-03-10').milestone).toBe(0.25); // 3/12 **정각**
    expect(savingsProgress(PRODUCT, '2026-06-10').milestone).toBe(0.5); // 6/12 **정각**
    expect(savingsProgress(PRODUCT, '2026-09-10').milestone).toBe(0.75); // 9/12 **정각**

    // 정각을 빼면 `>=` 를 `>` 로 바꿔도 어떤 단언도 안 깨진다.
    expect(savingsProgress(PRODUCT, '2026-07-10').milestone).toBe(0.5); // 7/12
    expect(savingsProgress(PRODUCT, '2026-10-10').milestone).toBe(0.75); // 10/12
  });

  it('납입 회차는 총 회차를 넘지 않는다', () => {
    const result = savingsProgress(PRODUCT, '2028-01-10');
    expect(result.paidMonths).toBe(12);
    expect(result.barPct).toBe(100);
  });
});
