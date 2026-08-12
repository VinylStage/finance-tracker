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

const CARD = { id: 9, issuer: '테스트카드사', product_name: '테스트카드', is_active: 1 };

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

async function openForm(user) {
  const select = await screen.findByLabelText('어느 카드의 혜택인가요');
  await user.selectOptions(select, String(CARD.id));
  await user.click(await screen.findByRole('button', { name: '혜택 추가' }));
}

// 요율형 혜택 하나를 채워 저장한다. 결제방식만 바꿔 가며 쓴다.
async function fillRateAndSave(user) {
  await user.type(screen.getByLabelText('비율 (%)'), '1.5');
  await user.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(post).toHaveBeenCalled());
  return post.mock.calls[0][1];
}

describe('CardBenefitPaymentStyle', () => {
  beforeEach(() => { vi.clearAllMocks(); mockApi(); });
  
  it('기본은 결제방식을 가리지 않는다', async () => {
    const user = userEvent.setup();
    renderSection();
    await openForm(user);
    
    expect(screen.getByLabelText('이 결제방식일 때만 (선택)')).toHaveProperty('value', '');
  });
  
  it('고를 수 있는 것은 일시불 할부 리볼빙 셋뿐이다', async () => {
    const user = userEvent.setup();
    renderSection();
    await openForm(user);
    
    const sel = screen.getByLabelText('이 결제방식일 때만 (선택)');
    const values = Array.from(sel.options).map((o) => o.value);
    expect(values).toEqual(['', '일시불', '할부', '리볼빙']);
  });
  
  it('고른 결제방식이 저장 요청에 실린다', async () => {
    const user = userEvent.setup();
    renderSection();
    await openForm(user);
    
    await user.selectOptions(screen.getByLabelText('이 결제방식일 때만 (선택)'), '일시불');
    const body = await fillRateAndSave(user);
    expect(body.payment_style).toBe('일시불');
  });
  
  it('비워 두면 null 로 보낸다', async () => {
    const user = userEvent.setup();
    renderSection();
    await openForm(user);
    
    const body = await fillRateAndSave(user);
    expect(body.payment_style).toBeNull();
  });
  
  it('저장된 제약이 수정 폼에 되돌아온다', async () => {
    const user = userEvent.setup();
    mockApi([{
      id: 1, benefit_type: '할인', rate: 1.5, payment_style: '할부',
      category_id: null, merchant_pattern: null, monthly_cap: null,
      min_amount: 0, memo: null, rule_json: null,
    }]);
    renderSection();
    
    const select = await screen.findByLabelText('어느 카드의 혜택인가요');
    await user.selectOptions(select, String(CARD.id));
    await user.click(await screen.findByRole('button', { name: '수정' }));
    
    expect(screen.getByLabelText('이 결제방식일 때만 (선택)')).toHaveProperty('value', '할부');
  });
  
  it('할부가 빠질 수 있다는 것을 알린다', async () => {
    const user = userEvent.setup();
    renderSection();
    await openForm(user);
    
    // Find the paragraph containing the text about installment payments
    const paragraph = screen.getByText(/카드사 상당수가 할부를 혜택에서 뺍니다/);
    expect(paragraph).toBeTruthy();
  });
});
