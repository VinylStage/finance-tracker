import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Simulator from './Simulator';

// 예상잔액 시뮬레이터. 테스트가 하나도 없었다.
//
// 이 화면은 서버에 아무것도 저장하지 않는다 — 가정값을 넣으면 그 자리에서
// 계산해 보여줄 뿐이다. 그래서 값어치가 전부 **계산이 맞는가**에 있다.
// 틀려도 아무 오류가 안 나고, 사용자는 그 숫자를 보고 결정을 내린다.

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

const settled = () => waitFor(() => expect(screen.queryByText('로딩 중...')).toBeNull());

// 표에서 그 시점의 예상잔액 칸을 읽는다.
function balanceAt(label) {
  const row = screen.getByRole('cell', { name: label }).closest('tr');
  return within(row).getAllByRole('cell')[1].textContent;
}

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ available: 1000000 });
});

describe('현재 가용현금', () => {
  it('대시보드 집계에서 가져온다', async () => {
    render(<Simulator />);
    await settled();

    expect(get).toHaveBeenCalledWith('/api/transactions/summary/dashboard');
    // 요약 카드와 입력 옆 두 곳에 같은 값이 나온다.
    expect(screen.getAllByText('1,000,000원').length).toBeGreaterThan(0);
  });

  it('못 불러오면 0 기준으로 계산한다고 알리고 재시도를 준다', async () => {
    get.mockRejectedValue(new Error('서버 오류'));
    render(<Simulator />);
    await settled();

    // 조용히 0 으로 계산하면 사용자는 자기 잔액이 0 인 줄 안다.
    expect(screen.getByText(/0원 기준으로 계산합니다/)).toBeTruthy();

    get.mockResolvedValue({ available: 500000 });
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    await waitFor(() => expect(screen.queryByText(/0원 기준으로 계산합니다/)).toBeNull());
  });

  it('available 이 없으면 0 으로 두고 그 위에서 계산한다', async () => {
    get.mockResolvedValue({});
    render(<Simulator />);
    await settled();

    expect(balanceAt('현재')).toBe('0원');

    // 여기까지만 보면 undefined 를 그대로 둬도 통과한다 — formatWon 이
    // undefined 도 '0원' 으로 적기 때문이다. 그 위에 금액을 얹어야 갈린다:
    // 시작값이 undefined 면 더한 순간 NaN 이 되고 이후 전부 '0원' 이 된다.
    await userEvent.type(screen.getByLabelText('월 수입 (원)'), '500000');
    expect(balanceAt('1개월 후')).toBe('500,000원');
  });
});

describe('예상잔액 계산', () => {
  const fill = async ({ income = '', expense = '', debt = '', savings = '' } = {}) => {
    if (income) await userEvent.type(screen.getByLabelText('월 수입 (원)'), income);
    if (expense) await userEvent.type(screen.getByLabelText('월 지출/고정비 (원)'), expense);
    if (debt) await userEvent.type(screen.getByLabelText('부채상환 (원)'), debt);
    if (savings) await userEvent.type(screen.getByLabelText('저축 (원)'), savings);
  };

  it('아무것도 안 넣으면 잔액이 그대로다', async () => {
    render(<Simulator />);
    await settled();

    // 빈 칸을 0 이 아닌 무엇으로 읽으면 여기서 NaN 이 번진다.
    expect(balanceAt('현재')).toBe('1,000,000원');
    expect(balanceAt('12개월 후')).toBe('1,000,000원');
  });

  it('수입에서 지출·부채상환·저축을 모두 뺀다', async () => {
    render(<Simulator />);
    await settled();

    await fill({ income: '3000000', expense: '1500000', debt: '500000', savings: '300000' });

    // 넷 중 하나라도 빠지면 매달 차액이 달라져 12개월 뒤에 크게 벌어진다.
    expect(balanceAt('1개월 후')).toBe('1,700,000원');
    expect(balanceAt('12개월 후')).toBe('9,400,000원');
  });

  it('매달 같은 금액이 쌓인다', async () => {
    render(<Simulator />);
    await settled();

    await fill({ income: '1000000' });

    expect(balanceAt('1개월 후')).toBe('2,000,000원');
    expect(balanceAt('2개월 후')).toBe('3,000,000원');
    expect(balanceAt('3개월 후')).toBe('4,000,000원');
  });

  it('나가는 돈이 더 많으면 잔액이 음수로 간다', async () => {
    render(<Simulator />);
    await settled();

    await fill({ expense: '600000' });

    // 음수를 0 에서 막으면 "언제 바닥나는가" 라는 이 화면의 쓸모가 사라진다.
    expect(balanceAt('2개월 후')).toBe('-200,000원');
  });

  it('기간을 바꾸면 그만큼만 그린다', async () => {
    render(<Simulator />);
    await settled();

    await userEvent.clear(screen.getByLabelText('기간 (개월)'));
    await userEvent.type(screen.getByLabelText('기간 (개월)'), '3');

    expect(screen.getByRole('cell', { name: '3개월 후' })).toBeTruthy();
    expect(screen.queryByRole('cell', { name: '4개월 후' })).toBeNull();
    expect(screen.getByText('3개월 후 예상잔액')).toBeTruthy();
  });

  it('기간을 비우거나 0 으로 두면 최소 1개월은 그린다', async () => {
    render(<Simulator />);
    await settled();

    await userEvent.clear(screen.getByLabelText('기간 (개월)'));
    await userEvent.type(screen.getByLabelText('기간 (개월)'), '0');

    // 0 을 그대로 쓰면 '현재' 한 줄만 남아 화면이 빈 것처럼 보인다.
    expect(screen.getByRole('cell', { name: '1개월 후' })).toBeTruthy();
  });

  it('요약 카드의 예상잔액이 표의 마지막 줄과 같다', async () => {
    render(<Simulator />);
    await settled();
    await userEvent.type(screen.getByLabelText('월 수입 (원)'), '200000');

    const last = balanceAt('12개월 후');
    // 카드와 표가 다른 계산을 쓰면 어느 쪽을 믿어야 할지 알 수 없다.
    expect(screen.getAllByText(last).length).toBeGreaterThanOrEqual(2);
  });
});
