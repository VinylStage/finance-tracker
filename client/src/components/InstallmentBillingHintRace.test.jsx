import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import InstallmentBillingHint from './InstallmentBillingHint';

// #737 — 디바운스는 기다리는 호출만 끊고 이미 나간 요청은 못 막는다. 빠르게 두 번
// 바꾸면 첫 응답이 늦게 와 화면과 폼 기본값(onEstimate)을 옛 값으로 덮을 수 있었다.

const { post } = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock('../lib/api', () => ({
  api: { post },
  ApiError: class ApiError extends Error {},
}));

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const estimate = (over = {}) => ({
  rows: [
    { sequence: 1, billing_month: '2026-08', principal: 200000, interest: 19900, total: 219900 },
    { sequence: 2, billing_month: '2026-09', principal: 200000, interest: 16583, total: 216583 },
  ],
  monthly_amount: 200000,
  fee_per_month: 19900,
  first_total: 219900,
  totals: { principal: 1200000, interest: 69650, total: 1269650 },
  varies: { principal: false, interest: true },
  basis: { policy_type: '유이자', annual_rate: 19.9, free_from_sequence: 0, source: 'base', reason: '연 19.9%' },
  ...over,
});

const NEWER = estimate({ monthly_amount: 400000, totals: { principal: 2400000, interest: 139300, total: 2539300 } });

const PROPS = {
  totalAmount: '1200000', months: '6', paymentMethodId: '1',
  purchaseDate: '2026-07-10', startBillingMonth: '2026-08',
  monthlyAmount: '', feePerMonth: '',
};

beforeEach(() => { post.mockReset(); });

describe('늦게 온 옛 계산', () => {
  it('늦게 온 첫 계산이 새 계산을 덮지 않는다', async () => {
    const first = deferred();
    post.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => Promise.resolve({ data: NEWER }));
    const onEstimate = vi.fn();
    const { rerender } = render(<InstallmentBillingHint {...PROPS} onEstimate={onEstimate} />);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    rerender(<InstallmentBillingHint {...PROPS} totalAmount="2400000" onEstimate={onEstimate} />);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('2,539,300원')).toBeTruthy());
    await act(async () => { first.resolve({ data: estimate() }); await first.promise; });
    expect(screen.queryByText('1,269,650원')).toBe(null);
    expect(screen.getByText('2,539,300원')).toBeTruthy();
    expect(onEstimate).toHaveBeenCalledTimes(1);
    expect(onEstimate.mock.calls[0][0].monthly_amount).toBe(400000);
  });

  it('늦게 온 첫 계산의 실패도 새 계산을 덮지 않는다', async () => {
    const first = deferred();
    post.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => Promise.resolve({ data: NEWER }));
    const { rerender } = render(<InstallmentBillingHint {...PROPS} />);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    rerender(<InstallmentBillingHint {...PROPS} totalAmount="2400000" />);
    await waitFor(() => expect(screen.getByText('2,539,300원')).toBeTruthy());
    await act(async () => { first.reject(new Error('늦은 실패')); await first.promise.catch(() => {}); });
    expect(screen.queryByText(/청구액을 계산하지 못했어요/)).toBe(null);
    expect(screen.getByText('2,539,300원')).toBeTruthy();
  });

  it('언마운트 뒤에는 계산을 부르지 않는다', async () => {
    post.mockResolvedValue({ data: estimate() });
    const { unmount } = render(<InstallmentBillingHint {...PROPS} />);
    unmount();
    await new Promise((r) => setTimeout(r, 600));
    expect(post).not.toHaveBeenCalled();
  });
});

// 아래 둘은 위임 산출이 아니라 사람이 더한 것이다. useLoader 로 옮기며 디바운스와
// «입력이 다시 모자라면 지운다» 를 새로 썼는데, 돌연변이로 둘 다 빼 봐도 기존
// 테스트 16개가 다 통과했다 — 옮기기 전부터 아무도 지키지 않던 동작이다.
describe('옮기며 다시 쓴 동작', () => {
  it('연달아 바꾸면 마지막 입력으로 한 번만 부른다', async () => {
    post.mockResolvedValue({ data: estimate() });
    const { rerender } = render(<InstallmentBillingHint {...PROPS} />);
    rerender(<InstallmentBillingHint {...PROPS} totalAmount="1300000" />);
    rerender(<InstallmentBillingHint {...PROPS} totalAmount="1400000" />);
    await new Promise((r) => setTimeout(r, 700));
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][1].total_amount).toBe(1400000);
  });

  it('입력이 다시 모자라면 보이던 계산을 지운다', async () => {
    post.mockResolvedValue({ data: estimate() });
    const { rerender } = render(<InstallmentBillingHint {...PROPS} />);
    await waitFor(() => expect(screen.getByText('1,269,650원')).toBeTruthy());
    rerender(<InstallmentBillingHint {...PROPS} months="1" />);
    await waitFor(() => expect(screen.queryByText('1,269,650원')).toBe(null));
  });
});
