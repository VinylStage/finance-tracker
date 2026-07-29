import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SpendHeatmap from './SpendHeatmap';

// 히트맵은 색으로 강도를 말한다. 그래서 "색만으로 전달하지 않는" 채널이 실제로
// 붙어 있는지가 가장 중요한 검증 대상이다. 셀 안의 날짜 숫자와 title 의 배수 표기,
// 그리고 범례 세 가지다.

const props = (over = {}) => ({
  year: 2026,
  month: 7,
  dailyTotals: {},
  monthlyBudgetTotal: 310000, // 31일 기준 하루 10,000원
  recentDailyAverage: 0,
  ...over,
});

function cells(container) {
  // 날짜 칸은 숫자를 담고 있고 빈 칸은 비어 있다.
  return [...container.querySelectorAll('.grid.grid-cols-7')][1].children;
}

describe('격자 구성', () => {
  it('그 달의 날짜 수만큼 숫자 칸이 생긴다', () => {
    const { container } = render(<SpendHeatmap {...props()} />);
    const nums = [...cells(container)].filter((c) => c.textContent.trim() !== '');
    expect(nums.length).toBe(31); // 2026-07 은 31일
    expect(nums[0].textContent.trim()).toBe('1');
    expect(nums[30].textContent.trim()).toBe('31');
  });

  it('1일의 요일만큼 앞에 빈 칸이 붙는다', () => {
    // 2026-07-01 은 수요일(getDay 3)
    const { container } = render(<SpendHeatmap {...props()} />);
    const all = [...cells(container)];
    const blanks = all.slice(0, 3);
    expect(blanks.every((c) => c.textContent.trim() === '')).toBe(true);
    expect(all[3].textContent.trim()).toBe('1');
  });

  it('요일 머리글이 일곱 개다', () => {
    const { container } = render(<SpendHeatmap {...props()} />);
    const head = [...container.querySelectorAll('.grid.grid-cols-7')][0];
    expect([...head.children].map((c) => c.textContent.trim())).toEqual(
      ['일', '월', '화', '수', '목', '금', '토']
    );
  });
});

describe('색 외 채널 (WCAG SC 1.4.1)', () => {
  it('모든 날짜 칸에 날짜 숫자가 들어 있다', () => {
    const { container } = render(<SpendHeatmap {...props()} />);
    const nums = [...cells(container)].filter((c) => c.textContent.trim() !== '');
    for (const c of nums) expect(c.textContent.trim()).toMatch(/^\d+$/);
  });

  it('title 에 날짜·금액·기준 대비 배수가 들어간다', () => {
    const { container } = render(
      <SpendHeatmap {...props({ dailyTotals: { '2026-07-03': 14000 } })} />
    );
    const cell = [...cells(container)].find((c) => c.textContent.trim() === '3');
    expect(cell.getAttribute('title')).toBe('7월 3일 · 14,000원 · 기준의 1.4배');
  });

  it('지출이 없는 날은 배수 대신 지출 없음이라고 말한다', () => {
    const { container } = render(<SpendHeatmap {...props()} />);
    const cell = [...cells(container)].find((c) => c.textContent.trim() === '5');
    expect(cell.getAttribute('title')).toContain('지출 없음');
  });
});

describe('범례', () => {
  it('기준 금액을 정수로 보여준다', () => {
    // basis 는 310000/31 = 10000. 나누어떨어지지 않는 달에도 소수점이 새면 안 된다.
    render(<SpendHeatmap {...props()} />);
    expect(screen.getByText(/하루 기준 10,000원/)).toBeTruthy();
  });

  it('기준 금액에 소수점이 새지 않는다', () => {
    // 30일 달에 예산 310000 이면 10333.33... 이 된다.
    render(<SpendHeatmap {...props({ month: 6 })} />);
    const text = screen.getByText(/하루 기준/).textContent;
    expect(text).not.toMatch(/\d\.\d/);
    expect(text).toContain('10,333원');
  });

  it('예산이 있으면 근거를 예산으로 밝힌다', () => {
    render(<SpendHeatmap {...props()} />);
    expect(screen.getByText(/월 예산 ÷ 일수/)).toBeTruthy();
  });

  it('예산이 없으면 일평균 폴백임을 밝힌다', () => {
    render(<SpendHeatmap {...props({ monthlyBudgetTotal: 0, recentDailyAverage: 8500 })} />);
    expect(screen.getByText(/최근 3개월 일평균/)).toBeTruthy();
    expect(screen.getByText(/하루 기준 8,500원/)).toBeTruthy();
  });

  it('기준을 세울 수 없으면 색을 칠하지 않는다고 말한다', () => {
    const { container } = render(
      <SpendHeatmap {...props({ monthlyBudgetTotal: 0, recentDailyAverage: 0 })} />
    );
    expect(screen.getByText(/기준을 정할 수 없어/)).toBeTruthy();
    // 근거 없는 강도를 보여주지 않는다 — 채움 클래스가 하나도 없어야 한다.
    expect(container.querySelectorAll('[class*="bg-heat-"]').length).toBe(0);
  });
});

describe('강도 단계', () => {
  it('금액이 커질수록 높은 단계 클래스를 받는다', () => {
    const { container } = render(
      <SpendHeatmap
        {...props({
          dailyTotals: {
            '2026-07-01': 0,
            '2026-07-02': 4000, // 기준의 0.4배 → 1단계
            '2026-07-03': 9000, // 기준 이내 → 2단계
            '2026-07-04': 15000, // 기준 초과 → 3단계
            '2026-07-05': 30000, // 2배 초과 → 4단계
          },
        })}
      />
    );
    const find = (d) => [...cells(container)].find((c) => c.textContent.trim() === d).className;
    expect(find('1')).toContain('border');
    expect(find('2')).toContain('bg-heat-1');
    expect(find('3')).toContain('bg-heat-2');
    expect(find('4')).toContain('bg-heat-3');
    expect(find('5')).toContain('bg-heat-4');
  });
});
