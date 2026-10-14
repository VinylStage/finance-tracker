import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AdvisorProjectionChart from './AdvisorProjectionChart';

// 실데이터 전망 섹션. 계산은 서버 몫 — 여기서는 기간·가정이 요청에 실리고,
// 요약 줄이 기본/가정 결과를 섞지 않는지 본다.

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../lib/api', () => ({ api: { get }, ApiError: class extends Error {} }));

const tl = (n, start = 1000000, net = 250000) => Array.from({ length: n }, (_, i) => ({ month: `2026-${String(10 + i).padStart(2, '0')}`.replace(/2026-1[3-9]|2026-2\d/, (m) => m), inflow: net, outflow: 0, net, balance: start + i * 100000 }));
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

  it('기본은 추가 지출 없는 순수 베이스라인 — 시나리오 입력은 숨겨져 있다', async () => {
    get.mockResolvedValue(RES);
    render(<AdvisorProjectionChart />);
    await screen.findByTestId('projection-summary');
    // 휴대폰 전용 입력 필드가 기본 화면에 있으면 안 된다
    expect(screen.queryByText(/휴대폰 가격/)).toBeNull();
    expect(get).toHaveBeenLastCalledWith('/api/advisor/projection?horizon=24'); // 추가 지출 파라미터 없음
    expect(screen.getByRole('button', { name: /추가 지출 시나리오/ })).toBeTruthy();
  });

  it('기간 버튼과 범용 추가 지출 시나리오(이름·금액·개월)가 요청에 실린다', async () => {
    get.mockResolvedValue(RES);
    render(<AdvisorProjectionChart />);
    await screen.findByTestId('projection-summary');
    await userEvent.click(screen.getByRole('button', { name: '36개월' }));
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/api/advisor/projection?horizon=36'));
    await userEvent.click(screen.getByRole('button', { name: /추가 지출 시나리오/ }));
    get.mockResolvedValue({ ...RES, simulated: [{ label: '노트북' }], withSim: { timeline: tl(2, 900000), minBalance: 900000, firstNegativeMonth: '2027-05' } });
    await userEvent.type(screen.getByPlaceholderText('추가 지출'), '노트북');
    await userEvent.type(screen.getByPlaceholderText('1000000'), '2400000');
    await userEvent.click(screen.getByRole('button', { name: '반영' }));
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/api/advisor/projection?horizon=36&simAmount=2400000&simMonths=12&simLabel=%EB%85%B8%ED%8A%B8%EB%B6%81'));
    // 시나리오 이름이 요약과 표에 쓰인다(‘휴대폰’ 하드코딩 아님)
    expect((await screen.findByTestId('projection-summary')).textContent).toContain('노트북 포함');
    expect(screen.getByTestId('projection-table').textContent).toContain('노트북 잔액');
  });

  it('그래프만이 아니라 월별 금액을 표로 함께 보인다(여유자금·잔액)', async () => {
    get.mockResolvedValue(RES);
    render(<AdvisorProjectionChart />);
    const table = await screen.findByTestId('projection-table');
    // 각 월의 여유자금(net)과 월말 잔액이 금액으로 노출된다
    expect(table.textContent).toContain('250,000'); // net
    expect(table.textContent).toContain('1,000,000'); // 10월 잔액
    expect(table.textContent).toContain('1,100,000'); // 11월 잔액
    expect(table.textContent).toContain('2026-11');
  });

  it('가정 포함 시 표에 가정 잔액 열이 더해진다', async () => {
    get.mockResolvedValue({ ...RES, withSim: { timeline: tl(2, 800000), minBalance: 800000, firstNegativeMonth: null } });
    render(<AdvisorProjectionChart />);
    const table = await screen.findByTestId('projection-table');
    expect(table.textContent).toContain('800,000');  // 가정 10월 잔액
    expect(table.textContent).toContain('900,000');  // 가정 11월 잔액
  });

  it('예상 밖 응답(다른 페이지 모킹 등)이면 그리지 않는다', async () => {
    get.mockResolvedValue({ available: 1 });
    const { container } = render(<AdvisorProjectionChart />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(container.querySelector('[aria-label="현금흐름 전망"]')).toBeNull();
  });
});
