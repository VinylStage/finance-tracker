import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import InstallmentBillingHint from './InstallmentBillingHint';

// #316 — 자동계산 결과를 보여주고 폼 기본값을 채운다.
//
// 여기서 잠그는 것은 "계산이 맞는가" 가 아니다(그건 서버 테스트 몫이다).
// **채우되 가두지 않는가**, 그리고 **단일 값으로 요약하면서 잃은 정보를 밝히는가** 다.

const { post } = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock('../lib/api', () => ({
  api: { post },
  ApiError: class ApiError extends Error {},
}));

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
  basis: {
    policy_type: '유이자', annual_rate: 19.9, free_from_sequence: 0, source: 'base',
    reason: '연 19.9% 수수료가 남은 금액에 붙어요. 갚을수록 수수료가 줄어요.',
  },
  ...over,
});

const PROPS = {
  totalAmount: '1200000', months: '6', paymentMethodId: '1',
  purchaseDate: '2026-07-10', startBillingMonth: '2026-08',
  monthlyAmount: '', feePerMonth: '',
};

beforeEach(() => { post.mockReset(); vi.useRealTimers(); });

describe('계산 호출', () => {
  it('필수값이 차면 계산을 부른다', async () => {
    post.mockResolvedValue({ data: estimate() });
    render(<InstallmentBillingHint {...PROPS} />);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][0]).toBe('/api/installments/billing-estimate');
    expect(post.mock.calls[0][1]).toMatchObject({ total_amount: 1200000, months: 6 });
  });

  it('개월수가 2 미만이면 부르지 않는다', async () => {
    post.mockResolvedValue({ data: estimate() });
    render(<InstallmentBillingHint {...PROPS} months="1" />);
    await new Promise(r => setTimeout(r, 600));
    expect(post).not.toHaveBeenCalled();
  });

  it('총액이 없으면 부르지 않는다', async () => {
    post.mockResolvedValue({ data: estimate() });
    render(<InstallmentBillingHint {...PROPS} totalAmount="" />);
    await new Promise(r => setTimeout(r, 600));
    expect(post).not.toHaveBeenCalled();
  });

  it('결과를 부모에게 넘겨 폼을 채우게 한다', async () => {
    post.mockResolvedValue({ data: estimate() });
    const onEstimate = vi.fn();
    render(<InstallmentBillingHint {...PROPS} onEstimate={onEstimate} />);
    await waitFor(() => expect(onEstimate).toHaveBeenCalled());
    expect(onEstimate.mock.calls[0][0].monthly_amount).toBe(200000);
  });
});

describe('보여주는 것', () => {
  it('1회차 금액과 총 수수료를 보여준다', async () => {
    post.mockResolvedValue({ data: estimate() });
    render(<InstallmentBillingHint {...PROPS} />);
    expect(await screen.findByText('이렇게 청구될 것 같아요')).toBeTruthy();
    expect(screen.getByText(/219,900원/)).toBeTruthy();
    // 정규식으로 찾으면 총 상환액 '1,269,650원' 이 같이 걸린다. 정확 일치로 본다.
    expect(screen.getByText('69,650원')).toBeTruthy();
    expect(screen.getByText('1,269,650원')).toBeTruthy();
  });

  it('수수료가 회차마다 준다는 사실을 알린다', async () => {
    // 대표값만 보여주면 사용자는 2회차 청구서를 보고 앱이 틀렸다고 판단한다.
    post.mockResolvedValue({ data: estimate() });
    render(<InstallmentBillingHint {...PROPS} />);
    expect(await screen.findByText(/회차마다 조금씩 줄어요/)).toBeTruthy();
  });

  it('끝수 때문에 1회차만 큰 경우를 구분해 말한다', async () => {
    post.mockResolvedValue({ data: estimate({
      varies: { principal: true, interest: false },
      rows: [
        { sequence: 1, billing_month: '2026-08', principal: 3334, interest: 0, total: 3334 },
        { sequence: 2, billing_month: '2026-09', principal: 3333, interest: 0, total: 3333 },
      ],
      totals: { principal: 10000, interest: 0, total: 10000 },
    }) });
    render(<InstallmentBillingHint {...PROPS} />);
    expect(await screen.findByText(/1회차만 조금 커요/)).toBeTruthy();
  });

  it('계산 근거를 사용자 말로 적는다', async () => {
    post.mockResolvedValue({ data: estimate() });
    render(<InstallmentBillingHint {...PROPS} />);
    expect(await screen.findByText(/갚을수록 수수료가 줄어요/)).toBeTruthy();
  });

  it('정책이 없으면 그 사실을 밝힌다', async () => {
    post.mockResolvedValue({ data: estimate({
      fee_per_month: 0,
      totals: { principal: 1200000, interest: 0, total: 1200000 },
      varies: { principal: false, interest: false },
      basis: {
        policy_type: null, source: 'none',
        reason: '등록된 카드 할부 정책이 없어 수수료 없이 원금만 나눴어요. 실제 청구액과 다를 수 있어요.',
      },
    }) });
    render(<InstallmentBillingHint {...PROPS} />);
    expect(await screen.findByText(/정책이 없어 수수료 없이/)).toBeTruthy();
  });

  it('내부 필드명이 화면에 나오지 않는다', async () => {
    post.mockResolvedValue({ data: estimate() });
    const { container } = render(<InstallmentBillingHint {...PROPS} />);
    await screen.findByText('이렇게 청구될 것 같아요');
    expect(container.textContent).not.toMatch(/monthly_amount|fee_per_month|free_from_sequence|policy_type|varies/);
  });
});

describe('사용자가 고친 값', () => {
  it('계산과 다르면 그 사실을 알리되 입력값을 지킨다', async () => {
    post.mockResolvedValue({ data: estimate() });
    render(<InstallmentBillingHint {...PROPS} monthlyAmount="250000" />);
    expect(await screen.findByText(/입력한 값이 계산과 달라요/)).toBeTruthy();
    expect(screen.getByText(/입력한 값을 그대로 저장해요/)).toBeTruthy();
  });

  it('계산값과 같으면 경고하지 않는다', async () => {
    post.mockResolvedValue({ data: estimate() });
    render(<InstallmentBillingHint {...PROPS} monthlyAmount="200000" feePerMonth="19900" />);
    await screen.findByText('이렇게 청구될 것 같아요');
    expect(screen.queryByText(/입력한 값이 계산과 달라요/)).toBeNull();
  });
});

describe('계산 실패', () => {
  it('입력을 막지 않고 직접 넣으라고 안내한다', async () => {
    // 기록이 계산에 종속되면 안 된다.
    post.mockRejectedValue(new Error('서버에 연결할 수 없습니다.'));
    render(<InstallmentBillingHint {...PROPS} />);
    expect(await screen.findByText(/직접 입력해 주세요/)).toBeTruthy();
  });
});
