import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AdvisorHeadroomCard from './AdvisorHeadroomCard';

// 이번 주기 여윳돈 위젯. 숫자 계산은 서버 몫이고, 여기서 지키는 것은:
//   - 신용/즉시 두 한도를 섞지 않고 각자 자리에 보인다
//   - 앵커가 없으면(409) 잔액 입력부터 받는다
//   - 미결제 카드 선택이 요청에 실리고 저장된다
//   - 예상 밖 응답이면 대시보드를 막지 않고 조용히 빠진다

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../lib/api', () => ({ api: { get, post }, ApiError: class extends Error {} }));

const HEAD = {
  asOf: '2026-10-13', anchorAmount: 600000, spendDate: '2026-11-14', target: '2026-11-24',
  capacity: 1196064, capacityImmediate: 567000, minDate: '2026-10-24',
  scheduled: [{ date: '2026-10-25', amount: 78600, label: '삼성카드 청구(일시불)' }], warnings: [],
};
const PMS = [{ name: '삼성카드', type: '신용' }, { name: '현대카드', type: '신용' }, { name: '현금', type: '현금성' }];

function mock({ head = HEAD, headErr = null } = {}) {
  get.mockImplementation((url) => {
    if (url.startsWith('/api/payment-methods')) return Promise.resolve(PMS);
    if (url.startsWith('/api/advisor/headroom')) return headErr ? Promise.reject(headErr) : Promise.resolve(head);
    return Promise.resolve({});
  });
}

beforeEach(() => { get.mockReset(); post.mockReset(); window.localStorage.clear(); });

describe('AdvisorHeadroomCard', () => {
  it('신용카드 한도와 체크·현금 한도를 따로 보인다', async () => {
    mock();
    render(<AdvisorHeadroomCard />);
    expect((await screen.findByTestId('headroom-credit')).textContent).toContain('1,196,064');
    expect((screen.getByTestId('headroom-immediate')).textContent).toContain('567,000');
    expect(screen.getByText(/11\/14 결제 후 11\/24까지/)).toBeTruthy();
  });

  it('앵커가 없으면(409) 잔액 입력을 받고 저장 후 다시 계산한다', async () => {
    const e = Object.assign(new Error('no anchor'), { status: 409 });
    mock({ headErr: e });
    post.mockResolvedValue({ id: 1 });
    render(<AdvisorHeadroomCard />);
    const amount = await screen.findByPlaceholderText('예: 1000000');
    await userEvent.type(amount, '600000');
    mock();
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(post).toHaveBeenCalledWith('/api/advisor/anchor', expect.objectContaining({ amount: 600000 }));
    expect(await screen.findByTestId('headroom-credit')).toBeTruthy();
  });

  it('미결제 카드를 고르면 요청에 실리고 로컬에 남는다(신용카드만 보인다)', async () => {
    mock();
    render(<AdvisorHeadroomCard />);
    await screen.findByTestId('headroom-credit');
    expect(screen.queryByRole('button', { name: '현금' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '삼성카드' }));
    await waitFor(() => expect(get).toHaveBeenCalledWith(`/api/advisor/headroom?unpaid=${encodeURIComponent('삼성카드')}`));
    expect(JSON.parse(window.localStorage.getItem('advisor.unpaidCards'))).toEqual(['삼성카드']);
  });

  it('예상 밖 응답이면 아무것도 그리지 않는다', async () => {
    mock({ head: { data: [] } });
    const { container } = render(<AdvisorHeadroomCard />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(container.querySelector('[aria-label="이번 주기 여윳돈"]')).toBeNull();
  });
});
