import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Dashboard from './Dashboard';

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

// 두 해에 걸친 월별 추이. 연 단위로 접으면 2025 한 줄, 2026 한 줄이 된다.
const MONTHLY = [
  { month: '2025-11', income: 1000000, expense: 400000 },
  { month: '2025-12', income: 2000000, expense: 600000 },
  { month: '2026-07', income: 3000000, expense: 1000000 },
  { month: '2026-08', income: 4000000, expense: 1500000 },
];

const DASH = {
  thisMonth: '2026-08', income: 4000000, expense: 1500000,
  available: 1800000, installmentsDue: 200000,
  budgets: [], categoryBreakdown: [], topMerchants: [],
  dailyTrend: [{ date: '2026-08-01', income: 0, expense: 30000 }],
  weeklyTrend: [{ week: '2026-W31', income: 0, expense: 50000 }],
  monthlyTrend: MONTHLY,
};

function mockApi() {
  get.mockImplementation((url) => {
    if (url.startsWith('/api/recurring-rules/due')) return Promise.resolve({ data: [] });
    if (url.startsWith('/api/transactions/summary/dashboard')) return Promise.resolve(DASH);
    if (url.startsWith('/api/transactions/summary/category-breakdown')) return Promise.resolve({ data: [] });
    if (url.startsWith('/api/debts')) return Promise.resolve({ data: [], total_balance: 0 });
    return Promise.resolve({ data: [] });
  });
}

// 흐름 분석 섹션은 접혀 있을 수 있다. 안을 보려면 펼친다.
async function openFlow(user) {
  const details = screen.getByText('흐름 분석').closest('details');
  if (!details.open) await user.click(screen.getByText('흐름 분석'));
  return within(details);
}

// 흐름 분석 쪽 버튼만 고른다. 히트맵 버튼은 aria-pressed 를 가지므로 뺀다.
const flowBtn = (scope, label) => scope.getAllByRole('button', { name: label })
  .filter((b) => !b.hasAttribute('aria-pressed'))[0];

const picked = (btn) => btn.className.includes('bg-brand-tint');

beforeEach(() => {
  get.mockReset(); post.mockReset(); put.mockReset(); del.mockReset();
  mockApi();
});

describe('흐름 분석의 기간 축', () => {
  it('처음에는 월이 골라져 있다', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    await screen.findByText('2026-08 대시보드');
    const flow = await openFlow(user);

    expect(picked(flowBtn(flow, '월'))).toBe(true);
    expect(picked(flowBtn(flow, '주'))).toBe(false);
    expect(picked(flowBtn(flow, '연'))).toBe(false);
  });

  it('주로 바꿀 수 있다', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    await screen.findByText('2026-08 대시보드');
    const flow = await openFlow(user);

    await user.click(flowBtn(flow, '주'));

    expect(picked(flowBtn(flow, '주'))).toBe(true);
    expect(picked(flowBtn(flow, '월'))).toBe(false);
  });

  it('연으로 바꿀 수 있다', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    await screen.findByText('2026-08 대시보드');
    const flow = await openFlow(user);

    await user.click(flowBtn(flow, '연'));

    expect(picked(flowBtn(flow, '연'))).toBe(true);
    expect(picked(flowBtn(flow, '월'))).toBe(false);
  });

  it('일로 바꿨다가 월로 되돌아온다', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    await screen.findByText('2026-08 대시보드');
    const flow = await openFlow(user);

    await user.click(flowBtn(flow, '일'));
    expect(picked(flowBtn(flow, '일'))).toBe(true);

    await user.click(flowBtn(flow, '월'));
    expect(picked(flowBtn(flow, '월'))).toBe(true);
    expect(picked(flowBtn(flow, '일'))).toBe(false);
  });
});
