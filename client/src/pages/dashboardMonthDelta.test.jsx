import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Dashboard from './Dashboard';

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

// 이름은 지어낸 것이다. 실제 가맹점 이름을 쓰지 않는다 — 이 저장소는 공개다.
const dash = (over = {}) => ({
  thisMonth: '2026-08', income: 3000000, expense: 1500000,
  available: 1800000, installmentsDue: 200000,
  budgets: [], categoryBreakdown: [], topMerchants: [],
  dailyTrend: [], weeklyTrend: [],
  monthlyTrend: [
    { month: '2026-07', income: 2000000, expense: 1000000 },
    { month: '2026-08', income: 3000000, expense: 1500000 },
  ],
  ...over,
});

function mockApi(d) {
  get.mockImplementation((url) => {
    if (url.startsWith('/api/recurring-rules/due')) return Promise.resolve({ data: [] });
    if (url.startsWith('/api/transactions/summary/dashboard')) return Promise.resolve(d);
    if (url.startsWith('/api/transactions/summary/category-breakdown')) return Promise.resolve({ data: [] });
    if (url.startsWith('/api/debts')) return Promise.resolve({ data: [], total_balance: 0 });
    return Promise.resolve({ data: [] });
  });
}

async function renderLoaded(d) {
  mockApi(d);
  render(<Dashboard />);
  await screen.findByText('2026-08 대시보드');
}

beforeEach(() => {
  get.mockReset(); post.mockReset(); put.mockReset(); del.mockReset();
});

describe('전월 대비 증감', () => {
  it('수입이 늘면 좋은 색으로 적는다', async () => {
    await renderLoaded(dash());
    const tag = screen.getByText(/\(\+50%\)/, { selector: 'span.text-brand-text' });
    expect(tag).toBeTruthy();
  });

  it('지출이 늘면 나쁜 색으로 적는다 — 수입과 방향이 반대다', async () => {
    await renderLoaded(dash());
    
    // 지출은 1,000,000 → 1,500,000 이라 +50% 이고, 늘었으므로 나쁜 색이다
    const all = screen.getAllByText(/\(\+50%\)/, { selector: 'span.text-loss-text' });
    expect(all.length).toBeGreaterThan(0);
    expect(all[0].className.includes('text-loss-text')).toBe(true);
  });

  it('지출이 줄면 좋은 색으로 적는다', async () => {
    await renderLoaded(dash({
      monthlyTrend: [
        { month: '2026-07', income: 2000000, expense: 2000000 },
        { month: '2026-08', income: 2000000, expense: 1000000 },
      ],
    }));
    const tag = screen.getByText(/\(-50%\)/, { selector: 'span.text-brand-text' });
    expect(tag).toBeTruthy();
  });

  it('지난달이 0 이면 증감률을 말하지 않는다', async () => {
    await renderLoaded(dash({
      monthlyTrend: [
        { month: '2026-07', income: 0, expense: 0 },
        { month: '2026-08', income: 3000000, expense: 1500000 },
      ],
    }));
    expect(screen.getByText('전월 대비')).toBeTruthy();
    expect(screen.queryByText(/%\)/)).toBe(null);
  });

  it('견줄 달이 하나뿐이면 줄을 만들지 않는다', async () => {
    await renderLoaded(dash({
      monthlyTrend: [{ month: '2026-08', income: 3000000, expense: 1500000 }],
    }));
    expect(screen.queryByText('전월 대비')).toBe(null);
  });
});
