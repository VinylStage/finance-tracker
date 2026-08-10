import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import YearHeatmap from './YearHeatmap';

// SpendHeatmap 을 가짜로 바꿔 **넘어간 props 를 그대로 본다.**
// 진짜를 렌더하면 격자 DOM 에 묻혀 "12개월에 같은 기준선이 갔는가" 를 볼 수 없다.
const calls = [];
vi.mock('./SpendHeatmap', () => ({
  default: (props) => { calls.push(props); return <div data-testid="month" />; },
}));

beforeEach(() => { calls.length = 0; });

describe('12개월 배치', () => {
  it('열두 달을 모두 그린다', () => {
    render(<YearHeatmap year={2026} buckets={[]} monthlyBudgetTotal={3000000} recentDailyAverage={50000} />);
    expect(screen.getAllByTestId('month').length).toBe(12);
  });

  it('1월부터 12월까지 순서대로다', () => {
    render(<YearHeatmap year={2026} buckets={[]} monthlyBudgetTotal={3000000} recentDailyAverage={50000} />);
    expect(calls.map(c => c.month)).toEqual([1,2,3,4,5,6,7,8,9,10,11,12]);
    // 순서가 어긋나면 라벨과 격자가 서로 다른 달을 가리키는데 화면상으론 멀쩡해 보인다
  });

  it('달 라벨이 붙는다', () => {
    render(<YearHeatmap year={2026} buckets={[]} monthlyBudgetTotal={3000000} recentDailyAverage={50000} />);
    expect(screen.getByText('1월')).toBeTruthy();
    expect(screen.getByText('12월')).toBeTruthy();
    // 라벨이 없으면 열두 격자가 어느 달인지 알 수 없다
  });
});

describe('기준선은 한 해 내내 같아야 한다', () => {
  it('열두 달에 같은 monthlyBudgetTotal 이 간다', () => {
    render(<YearHeatmap year={2026} buckets={[]} monthlyBudgetTotal={3000000} recentDailyAverage={50000} />);
    const uniq = [...new Set(calls.map(c => c.monthlyBudgetTotal))];
    expect(uniq).toEqual([3000000]);
    // 달마다 기준선을 다시 계산하면 **같은 색이 달마다 다른 금액을 뜻하게 되어 한 해를 비교할 수 없다.** 히트맵이 존재하는 이유가 사라진다
  });

  it('열두 달에 같은 recentDailyAverage 가 간다', () => {
    render(<YearHeatmap year={2026} buckets={[]} monthlyBudgetTotal={3000000} recentDailyAverage={50000} />);
    const uniq = [...new Set(calls.map(c => c.recentDailyAverage))];
    expect(uniq).toEqual([50000]);
    // 달마다 기준선을 다시 계산하면 **같은 색이 달마다 다른 금액을 뜻하게 되어 한 해를 비교할 수 없다.** 히트맵이 존재하는 이유가 사라진다
  });
});

describe('year 전달', () => {
  it('열두 달 모두 같은 해를 받는다', () => {
    render(<YearHeatmap year={2026} buckets={[]} monthlyBudgetTotal={3000000} recentDailyAverage={50000} />);
    expect([...new Set(calls.map(c => c.year))]).toEqual([2026]);
    // 해가 섞이면 2월 일수가 틀려 격자가 어긋난다
  });
});
