import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CardBenefitSection from './CardBenefitSection';
import { ConfirmProvider } from './ConfirmProvider';

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

const CARD = { id: 9, issuer: '하나카드', product_name: '테스트카드', is_active: 1 };

// 혜택 목록을 바꿔 끼울 수 있게 해 둔다.
function mockApi(benefits = []) {
  get.mockImplementation((url) => {
    if (url.startsWith('/api/card-products')) return Promise.resolve({ data: [CARD] });
    if (url.startsWith('/api/card-benefits')) return Promise.resolve({ data: benefits });
    return Promise.resolve({ data: [] });
  });
  post.mockResolvedValue({ id: 1, ok: true });
  put.mockResolvedValue({ ok: true });
}

const renderSection = () =>
  render(<ConfirmProvider><CardBenefitSection categories={[]} /></ConfirmProvider>);

// 카드를 고르고 «혜택 추가» 를 눌러 폼을 연다.
async function openForm(user) {
  const select = await screen.findByRole('combobox', { name: '어느 카드의 혜택인가요' });
  await user.selectOptions(select, String(CARD.id));
  await user.click(await screen.findByRole('button', { name: '혜택 추가' }));
}

describe('CardBenefitFlatMonthly', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi();
  });

  it('기본은 요율형이고 비율 칸이 보인다', async () => {
    const user = userEvent.setup();
    renderSection();
    await openForm(user);
    
    expect(screen.getByLabelText('계산 방식')).toHaveProperty('value', 'rate');
    expect(screen.getByLabelText('비율 (%)')).toBeTruthy();
  });

  it('정액구간형으로 바꾸면 비율 칸이 사라진다', async () => {
    const user = userEvent.setup();
    renderSection();
    await openForm(user);
    
    await user.selectOptions(screen.getByLabelText('계산 방식'), 'flat_monthly');
    expect(screen.queryByLabelText('비율 (%)')).toBeNull();
  });

  it('정액구간형은 «한 달에 한 번» 이라고 알린다', async () => {
    const user = userEvent.setup();
    renderSection();
    await openForm(user);
    
    await user.selectOptions(screen.getByLabelText('계산 방식'), 'flat_monthly');
    expect(screen.getByText(/한 달에 한 번/)).toBeTruthy();
  });

  it('구간을 더하면 입력 칸 세 개가 생긴다', async () => {
    const user = userEvent.setup();
    renderSection();
    await openForm(user);
    
    await user.selectOptions(screen.getByLabelText('계산 방식'), 'flat_monthly');
    await user.click(screen.getByRole('button', { name: '+ 구간 추가' }));
    
    expect(screen.getByLabelText('전월 실적 하한')).toBeTruthy();
    expect(screen.getByLabelText('이번 달 정액')).toBeTruthy();
  });

  it('구간 없이 저장하면 막고 서버를 안 부른다', async () => {
    const user = userEvent.setup();
    renderSection();
    await openForm(user);
    
    await user.selectOptions(screen.getByLabelText('계산 방식'), 'flat_monthly');
    await user.click(screen.getByRole('button', { name: '저장' }));
    
    await waitFor(() => expect(screen.getByText(/구간을 하나 이상/)).toBeTruthy());
    expect(post).not.toHaveBeenCalled();
  });

  it('하한이 겹치면 막고 서버를 안 부른다', async () => {
    const user = userEvent.setup();
    renderSection();
    await openForm(user);
    
    await user.selectOptions(screen.getByLabelText('계산 방식'), 'flat_monthly');
    await user.click(screen.getByRole('button', { name: '+ 구간 추가' }));
    await user.click(screen.getByRole('button', { name: '+ 구간 추가' }));
    
    await user.type(screen.getAllByLabelText('전월 실적 하한')[0], '300000');
    await user.type(screen.getAllByLabelText('이번 달 정액')[0], '3000');
    await user.type(screen.getAllByLabelText('전월 실적 하한')[1], '300000');
    await user.type(screen.getAllByLabelText('이번 달 정액')[1], '5000');
    
    await user.click(screen.getByRole('button', { name: '저장' }));
    
    await waitFor(() => expect(screen.getByText(/두 번 있습니다/)).toBeTruthy());
    expect(post).not.toHaveBeenCalled();
  });

  it('저장하면 rule 을 담아 보낸다', async () => {
    const user = userEvent.setup();
    renderSection();
    await openForm(user);
    
    await user.type(screen.getByLabelText('비율 (%)'), '1.5');
    await user.selectOptions(screen.getByLabelText('계산 방식'), 'flat_monthly');
    await user.click(screen.getByRole('button', { name: '+ 구간 추가' }));
    
    await user.type(screen.getAllByLabelText('전월 실적 하한')[0], '300000');
    await user.type(screen.getAllByLabelText('이번 달 정액')[0], '3000');
    await user.type(screen.getAllByLabelText('이름 (선택)')[0], '상위 구간');
    
    await user.click(screen.getByRole('button', { name: '저장' }));
    
    await waitFor(() => expect(post).toHaveBeenCalled());
    const body = post.mock.calls[0][1];
    expect(body.rule).toEqual({
      kind: 'flat_monthly',
      tiers: [{ min_spend: 300000, amount: 3000, label: '상위 구간' }],
    });
    expect(body.rate).toBe(0);
  });

  it('요율형으로 저장하면 rule 을 지우라고 보낸다', async () => {
    const user = userEvent.setup();
    renderSection();
    await openForm(user);
    
    await user.type(screen.getByLabelText('비율 (%)'), '1.5');
    await user.click(screen.getByRole('button', { name: '저장' }));
    
    await waitFor(() => expect(post).toHaveBeenCalled());
    const body = post.mock.calls[0][1];
    expect(body.rule).toBeNull();
    expect(body.rate).toBe(1.5);
  });

  it('저장된 정액 규칙은 목록에 금액으로 보인다', async () => {
    mockApi([{
      id: 1, benefit_type: '할인', rate: 0,
      category_id: null, merchant_pattern: null, monthly_cap: null, min_amount: 0, memo: null,
      rule_json: JSON.stringify({
        kind: 'flat_monthly',
        tiers: [{ min_spend: 300000, amount: 3000 }, { min_spend: 600000, amount: 7000 }],
      }),
    }]);
    
    const user = userEvent.setup();
    renderSection();
    await openForm(user);
    
    const select = await screen.findByRole('combobox', { name: '어느 카드의 혜택인가요' });
    await user.selectOptions(select, String(CARD.id));
    
    expect(screen.getByText(/매달 3,000원~7,000원 할인/)).toBeTruthy();
  });

  it('라벨을 비우면 label 이 null 이다', async () => {
    const user = userEvent.setup();
    renderSection();
    await openForm(user);
    
    await user.selectOptions(screen.getByLabelText('계산 방식'), 'flat_monthly');
    await user.click(screen.getByRole('button', { name: '+ 구간 추가' }));
    
    await user.type(screen.getAllByLabelText('전월 실적 하한')[0], '300000');
    await user.type(screen.getAllByLabelText('이번 달 정액')[0], '3000');
    // 라벨은 비운다
    
    await user.click(screen.getByRole('button', { name: '저장' }));
    
    await waitFor(() => expect(post).toHaveBeenCalled());
    const body = post.mock.calls[0][1];
    expect(body.rule.tiers[0].label).toBeNull();
  });
});
