import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DebtInterestProjection from './DebtInterestProjection';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../lib/api', () => ({
  api: { get },
  ApiError: class ApiError extends Error {},
}));

// 계산 UI 가 나오는 조건은 `debt.interest_settings.interest_basis` 가 정확히
// 문자열 'daily' 인 것이다. `loan_type` 은 판정에 쓰이지 않는다.
const CREDIT_LINE = {
  id: 3,
  name: '주거래 마이너스',
  loan_type: 'credit_line',
  interest_settings: { interest_basis: 'daily' },
};

// interest_settings 가 없으면 지원하지 않는 부채다.
const GENERAL = { id: 4, name: '학자금 대출', loan_type: 'general' };

const RESULT = {
  total_interest: 12345,
  capitalized: 0,
  accrued_since_last_posting: 0,
  postings: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: RESULT });
});

describe('DebtInterestProjection', () => {
  it('지원하지 않는 부채는 계산 UI 를 안 그린다', async () => {
    render(<DebtInterestProjection debt={GENERAL} />);

    expect(screen.queryByRole('button', { name: '계산' })).toBeNull();
    expect(screen.getByText(/기간별 이자 계산을 지원하지 않아요/)).toBeTruthy();
  });

  it('마이너스통장이면 계산 버튼이 나온다', async () => {
    render(<DebtInterestProjection debt={CREDIT_LINE} />);

    expect(screen.getByRole('button', { name: '계산' })).toBeTruthy();
    expect(screen.getByLabelText('시작')).toBeTruthy();
    expect(screen.getByLabelText('종료')).toBeTruthy();
  });

  it('그리기만 해서는 서버를 안 부른다', async () => {
    render(<DebtInterestProjection debt={CREDIT_LINE} />);

    expect(get).not.toHaveBeenCalled();
  });

  it('계산을 누르면 기간을 담아 부른다', async () => {
    const user = userEvent.setup();
    render(<DebtInterestProjection debt={CREDIT_LINE} />);
    await user.click(screen.getByRole('button', { name: '계산' }));

    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(get.mock.calls[0][0]).toContain('/api/debts/3/interest-projection');
    expect(get.mock.calls[0][0]).toContain('from=');
    expect(get.mock.calls[0][0]).toContain('to=');
  });

  it('이자 합계를 보여준다', async () => {
    const user = userEvent.setup();
    render(<DebtInterestProjection debt={CREDIT_LINE} />);
    await user.click(screen.getByRole('button', { name: '계산' }));

    expect(await screen.findByText('12,345원')).toBeTruthy();
  });

  it('서버가 오류를 주면 사유를 보여주고 결과는 안 남긴다', async () => {
    get.mockRejectedValue(new Error('금리 이력이 없어요'));
    const user = userEvent.setup();
    render(<DebtInterestProjection debt={CREDIT_LINE} />);
    await user.click(screen.getByRole('button', { name: '계산' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('12,345원')).toBeNull();
  });

  it('구간이 하나면 구간 내역을 안 편다', async () => {
    get.mockResolvedValue({ data: { ...RESULT, postings: [{
      date: '2026-03-25', interest: 500, balance_before: 1000000, balance_after: 1000500,
      over_limit: false,
      segments: [{ from: '2026-03-01', days: 25, balance: 1000000, annual_rate: 7.3, interest: 500 }],
    }] } });
    const user = userEvent.setup();
    render(<DebtInterestProjection debt={CREDIT_LINE} />);
    await user.click(screen.getByRole('button', { name: '계산' }));

    await screen.findByText('2026-03-25');
    expect(screen.queryByText(/25일 · 잔액/)).toBeNull();
  });

  it('구간이 둘이면 구간 내역을 편다', async () => {
    get.mockResolvedValue({ data: { ...RESULT, postings: [{
      date: '2026-03-26', interest: 900, balance_before: 1000000, balance_after: 1000900,
      over_limit: false,
      segments: [
        { from: '2026-03-01', days: 10, balance: 1000000, annual_rate: 7.3, interest: 200 },
        { from: '2026-03-11', days: 15, balance: 1200000, annual_rate: 8.1, interest: 700 },
      ],
    }] } });
    const user = userEvent.setup();
    render(<DebtInterestProjection debt={CREDIT_LINE} />);
    await user.click(screen.getByRole('button', { name: '계산' }));

    expect(await screen.findByText(/10일 · 잔액/)).toBeTruthy();
  });

  it('한도 초과와 미청구 이자를 각각 알린다', async () => {
    get.mockResolvedValue({ data: {
      total_interest: 700, capitalized: 300, accrued_since_last_posting: 450,
      postings: [{
        date: '2026-04-25', interest: 700, balance_before: 2000000, balance_after: 2000700,
        over_limit: true,
        segments: [{ from: '2026-04-01', days: 25, balance: 2000000, annual_rate: 7.3, interest: 700 }],
      }],
    } });
    const user = userEvent.setup();
    render(<DebtInterestProjection debt={CREDIT_LINE} />);
    await user.click(screen.getByRole('button', { name: '계산' }));

    expect(await screen.findByText('이 시점에 한도를 넘습니다')).toBeTruthy();
    expect(screen.getByText(/잔액에 더해진 이자 300원/)).toBeTruthy();
    expect(screen.getByText(/아직 청구되지 않은 이자 450원/)).toBeTruthy();
  });

  it('성공한 뒤 실패하면 앞의 결과가 남지 않는다', async () => {
    const user = userEvent.setup();
    render(<DebtInterestProjection debt={CREDIT_LINE} />);
    await user.click(screen.getByRole('button', { name: '계산' }));
    await screen.findByText('12,345원');

    get.mockRejectedValue(new Error('금리 이력이 끊겼어요'));
    await user.click(screen.getByRole('button', { name: '계산' }));

    expect(await screen.findByText('금리 이력이 끊겼어요')).toBeTruthy();
    expect(screen.queryByText('12,345원')).toBeNull();
  });
});
