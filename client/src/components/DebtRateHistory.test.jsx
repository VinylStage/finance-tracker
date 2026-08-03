import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DebtRateHistory from './DebtRateHistory';
import DebtInterestProjection from './DebtInterestProjection';
import { ConfirmProvider } from './ConfirmProvider';

// #329 — 변동금리 이력과 기간 이자 계산 화면.

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('../lib/api', () => ({
  api: { get, post },
  ApiError: class ApiError extends Error {},
}));

const rateRow = (over = {}) => ({
  id: 1, debt_id: 3, annual_rate: 4.17,
  effective_from: '2026-01-01', effective_to: null, memo: null, ...over,
});

beforeEach(() => { get.mockReset(); post.mockReset(); });

describe('금리 이력', () => {
  it('적용 기간과 함께 보여준다', async () => {
    get.mockResolvedValue({ data: [rateRow({ effective_to: '2026-03-31' }), rateRow({ id: 2, annual_rate: 4.55, effective_from: '2026-04-01' })] });
    render(<ConfirmProvider><DebtRateHistory debtId={3} /></ConfirmProvider>);

    expect(await screen.findByText('연 4.17%')).toBeTruthy();
    expect(screen.getByText('2026-01-01 ~ 2026-03-31')).toBeTruthy();
    expect(screen.getByText('연 4.55%')).toBeTruthy();
    // 종료일이 없으면 "부터" 로 끝낸다 — 내부적으로 무기한을 어떻게 다루든
    // 그건 화면에 나올 것이 아니다.
    expect(screen.getByText('2026-04-01부터')).toBeTruthy();
  });

  it('이력이 없으면 왜 필요한지 알린다', async () => {
    get.mockResolvedValue({ data: [] });
    render(<ConfirmProvider><DebtRateHistory debtId={3} /></ConfirmProvider>);
    expect(await screen.findByText(/그 시점 기준으로 이자를 계산/)).toBeTruthy();
  });

  it('소수 금리를 시작일과 함께 보낸다', async () => {
    // 실제 금리가 연 4.17% 다. 정수만 받으면 등록 자체가 안 된다.
    const user = userEvent.setup();
    get.mockResolvedValue({ data: [] });
    post.mockResolvedValue({ ok: true });
    render(<ConfirmProvider><DebtRateHistory debtId={3} /></ConfirmProvider>);

    await user.click(await screen.findByText('+ 금리 변경'));
    await user.type(screen.getByLabelText('연이율 (%)'), '4.55');
    await user.type(screen.getByLabelText('적용 시작일'), '2026-04-01');
    await user.type(screen.getByLabelText('메모'), '3개월 재산정');
    await user.click(screen.getByText('저장'));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/debts/3/rates', {
      annual_rate: 4.55, effective_from: '2026-04-01', memo: '3개월 재산정',
    }));
  });

  it('이전 금리가 어떻게 되는지 미리 알린다', async () => {
    const user = userEvent.setup();
    get.mockResolvedValue({ data: [] });
    render(<ConfirmProvider><DebtRateHistory debtId={3} /></ConfirmProvider>);
    await user.click(await screen.findByText('+ 금리 변경'));
    expect(screen.getByText(/이전 금리는 전날까지로 닫히고/)).toBeTruthy();
  });

  it('저장 오류를 폼 옆에 남긴다', async () => {
    const user = userEvent.setup();
    get.mockResolvedValue({ data: [] });
    // 입력값 자체는 브라우저 검증을 통과해야 서버 응답을 볼 수 있다. max 를 넘는
    // 값을 넣으면 폼이 제출되지 않아 이 테스트가 아무것도 증명하지 못한다.
    post.mockRejectedValue(new Error('같은 시작일 이력이 이미 있습니다. 날짜를 확인해 주세요.'));
    render(<ConfirmProvider><DebtRateHistory debtId={3} /></ConfirmProvider>);

    await user.click(await screen.findByText('+ 금리 변경'));
    await user.type(screen.getByLabelText('연이율 (%)'), '4.55');
    await user.type(screen.getByLabelText('적용 시작일'), '2026-04-01');
    await user.click(screen.getByText('저장'));

    const alertNode = await screen.findByRole('alert');
    expect(alertNode.textContent).toMatch(/날짜를 확인해 주세요/);
    // 폼이 남아 있어야 값을 보면서 고칠 수 있다
    expect(screen.getByLabelText('연이율 (%)')).toBeTruthy();
  });

  it('화면에 내부 필드명이 나오지 않는다', async () => {
    get.mockResolvedValue({ data: [rateRow()] });
    const { container } = render(<ConfirmProvider><DebtRateHistory debtId={3} /></ConfirmProvider>);
    await screen.findByText('연 4.17%');
    expect(container.textContent).not.toMatch(/annual_rate|effective_from|effective_to|debt_id/);
  });
});

describe('기간 이자 계산', () => {
  const creditLineDebt = { id: 3, interest_settings: { interest_basis: 'daily' } };

  it('지원하지 않는 유형이면 사유를 알린다', () => {
    // 없는 정밀도를 만들어 내지 않는다.
    render(<DebtInterestProjection debt={{ id: 1, interest_settings: { interest_basis: 'monthly' } }} />);
    expect(screen.getByText(/기간별 이자 계산을 지원하지 않아요/)).toBeTruthy();
  });

  it('계산만 하고 기록하지 않는다는 것을 먼저 알린다', () => {
    render(<DebtInterestProjection debt={creditLineDebt} />);
    expect(screen.getByText(/이자가 기록되거나 잔액이 바뀌지는 않아요/)).toBeTruthy();
  });

  it('회차별 이자와 잔액 변화를 보여준다', async () => {
    const user = userEvent.setup();
    get.mockResolvedValue({
      data: {
        postings: [
          {
            date: '2026-05-30', from: '2026-04-30', to: '2026-05-30',
            interest: 12222, balance_before: 3566196, balance_after: 3578418,
            over_limit: false, segments: [],
          },
          {
            date: '2026-06-30', from: '2026-05-30', to: '2026-06-30',
            interest: 12673, balance_before: 3578418, balance_after: 3591091,
            over_limit: false, segments: [],
          },
        ],
        total_interest: 24895, accrued_since_last_posting: 0,
        capitalized: 24895, final_balance: 3591091,
      },
    });
    render(<DebtInterestProjection debt={creditLineDebt} />);
    await user.click(screen.getByText('계산'));

    expect(await screen.findByText('12,222원')).toBeTruthy();
    expect(screen.getByText('12,673원')).toBeTruthy();
    expect(screen.getByText(/3,566,196원 → 3,578,418원/)).toBeTruthy();
    expect(screen.getByText(/이 기간 이자/)).toBeTruthy();
  });

  it('구간이 갈린 이유를 함께 보여준다', async () => {
    // 숫자만 보면 왜 그 값인지 알 수 없다 — 상환 시점과 금리 변경 시점이 근거다.
    const user = userEvent.setup();
    get.mockResolvedValue({
      data: {
        postings: [{
          date: '2026-05-30', from: '2026-04-30', to: '2026-05-30',
          interest: 11252, balance_before: 3566196, balance_after: 3577448, over_limit: false,
          segments: [
            { from: '2026-04-30', to: '2026-05-15', days: 15, balance: 3566196, annual_rate: 4.17, interest: 6111 },
            { from: '2026-05-15', to: '2026-05-30', days: 15, balance: 3000000, annual_rate: 4.17, interest: 5141 },
          ],
        }],
        total_interest: 11252, accrued_since_last_posting: 0, capitalized: 11252, final_balance: 3577448,
      },
    });
    render(<DebtInterestProjection debt={creditLineDebt} />);
    await user.click(screen.getByText('계산'));

    expect(await screen.findByText(/2026-04-30~ 15일 · 잔액 3,566,196원/)).toBeTruthy();
    expect(screen.getByText(/2026-05-15~ 15일 · 잔액 3,000,000원/)).toBeTruthy();
  });

  it('한도를 넘는 시점을 알린다', async () => {
    const user = userEvent.setup();
    get.mockResolvedValue({
      data: {
        postings: [{
          date: '2026-05-30', from: '2026-04-30', to: '2026-05-30',
          interest: 100, balance_before: 4799000, balance_after: 4801000,
          over_limit: true, segments: [],
        }],
        total_interest: 100, accrued_since_last_posting: 0, capitalized: 100, final_balance: 4801000,
      },
    });
    render(<DebtInterestProjection debt={creditLineDebt} />);
    await user.click(screen.getByText('계산'));
    expect(await screen.findByText(/한도를 넘습니다/)).toBeTruthy();
  });

  it('금리 이력이 없는 구간은 0원으로 보여주지 않고 사유를 알린다', async () => {
    const user = userEvent.setup();
    get.mockRejectedValue(new Error('2026-01-01 구간에 적용할 금리가 없습니다. 금리 이력을 먼저 입력해 주세요.'));
    render(<DebtInterestProjection debt={creditLineDebt} />);
    await user.click(screen.getByText('계산'));

    const alertNode = await screen.findByRole('alert');
    expect(alertNode.textContent).toMatch(/금리 이력을 먼저 입력/);
    expect(screen.queryByText('0원')).toBeNull();
  });
});
