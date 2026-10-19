import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AdvisorProjectionChart from './AdvisorProjectionChart';

// 전망 응답에 netWorth 가 있으면 순자산 표를 함께 보인다(#770).

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../lib/api', () => ({ api: { get }, ApiError: class extends Error {} }));

const TL = [
  { month: '2026-10', inflow: 0, outflow: 0, net: 0, balance: 600000, partial: true },
  { month: '2026-11', inflow: 0, outflow: 0, net: 0, balance: 700000, partial: false },
];
const RES = { anchor: { month: '2026-10', amount: 600000 }, horizon: 2, simulated: [], base: { timeline: TL, minBalance: 600000, firstNegativeMonth: null }, withSim: null };
const NW = { timeline: [
  { month: '2026-10', cash: 600000, savings: 500000, debt: 99100000, netWorth: -98000000 },
  { month: '2026-11', cash: 700000, savings: 1000000, debt: 99100000, netWorth: -97400000 },
] };

beforeEach(() => get.mockReset());

describe('AdvisorProjectionChart 순자산 표', () => {
  it('netWorth 가 있으면 순자산 표를 함께 그린다', async () => {
    get.mockResolvedValue({ ...RES, netWorth: NW });
    render(<AdvisorProjectionChart />);
    const t = await screen.findByTestId('networth-table');
    expect(t.textContent).toContain('-98,000,000원');
    expect(t.textContent).toContain('-97,400,000원');
  });

  it('netWorth 가 없으면 순자산 표를 그리지 않는다', async () => {
    get.mockResolvedValue(RES);
    render(<AdvisorProjectionChart />);
    await screen.findByTestId('projection-table');
    expect(screen.queryByTestId('networth-table')).toBeNull();
  });

  it('순자산 표는 현금흐름 표를 바꾸지 않는다', async () => {
    get.mockResolvedValue({ ...RES, netWorth: NW });
    render(<AdvisorProjectionChart />);
    const p = await screen.findByTestId('projection-table');
    expect(p.textContent).toContain('700,000원');
    expect(p.textContent.includes('-97,400,000원')).toBe(false);
  });
});
