import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AdvisorProjectionChart from './AdvisorProjectionChart';

// 실데이터 전망 섹션. 계산은 서버 몫 — 여기서는 기간·가정이 요청에 실리고,
// 요약 줄이 기본/가정 결과를 섞지 않는지 본다.

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../lib/api', () => ({ api: { get }, ApiError: class extends Error {} }));

const tl = (n, start = 1000000) => Array.from({ length: n }, (_, i) => ({ month: `2026-${String(10 + i).padStart(2, '0')}`.replace(/2026-1[3-9]|2026-2\d/, (m) => m), inflow: 0, outflow: 0, net: 0, balance: start + i * 100000 }));
const RES = { anchor: { month: '2026-10', amount: 600000 }, horizon: 2, simulated: [], base: { timeline: tl(2), minBalance: 1000000, firstNegativeMonth: null }, withSim: null };

beforeEach(() => get.mockReset());

describe('AdvisorProjectionChart', () => {
  it('기본 전망 요약과 앵커 출발점을 보인다', async () => {
    get.mockResolvedValue(RES);
    render(<AdvisorProjectionChart />);
    expect((await screen.findByTestId('projection-summary')).textContent).toContain('첫 적자월 없음');
    expect(screen.getByText(/600,000원?에서 출발/)).toBeTruthy();
    expect(get).toHaveBeenCalledWith('/api/advisor/projection?horizon=24');
  });

  it('기간 버튼과 휴대폰 가정이 요청에 실린다', async () => {
    get.mockResolvedValue(RES);
    render(<AdvisorProjectionChart />);
    await screen.findByTestId('projection-summary');
    await userEvent.click(screen.getByRole('button', { name: '36개월' }));
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/api/advisor/projection?horizon=36'));
    get.mockResolvedValue({ ...RES, withSim: { timeline: tl(2, 900000), minBalance: 900000, firstNegativeMonth: '2027-05' } });
    await userEvent.type(screen.getByPlaceholderText('1500000'), '1500000');
    await userEvent.click(screen.getByRole('button', { name: '반영' }));
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/api/advisor/projection?horizon=36&phone=1500000&phoneMonths=24'));
    expect((await screen.findByTestId('projection-summary')).textContent).toContain('가정 포함');
    expect((screen.getByTestId('projection-summary')).textContent).toContain('2027-05');
  });

  it('예상 밖 응답(다른 페이지 모킹 등)이면 그리지 않는다', async () => {
    get.mockResolvedValue({ available: 1 });
    const { container } = render(<AdvisorProjectionChart />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(container.querySelector('[aria-label="현금흐름 전망"]')).toBeNull();
  });
});
