import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Settings from './Settings';
import { ConfirmProvider } from '../components/ConfirmProvider';

// #681 — 규칙을 끌 때 그 규칙이 만든 거래가 있으면 함께 지울지 한 번 더 묻는다.

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

const RULE = {
  id: 20, category_id: 1, category_name: '구독료', merchant: '넷플릭스',
  amount: 17000, freq: 'monthly', interval: 1, day_of_month: 15,
  month_of_year: null, starts_on: '2026-01-15', ends_on: null,
  payment_method_id: 5, payment_style: '일시불', memo: '', is_active: 1,
};

function mockApi({ generatedCount = 3, generatedTotal = 51000 } = {}) {
  get.mockImplementation((url) => {
    if (url === '/api/recurring-rules/20/delete-preview') {
      return Promise.resolve({ rule_id: 20, generated_count: generatedCount, generated_total: generatedTotal });
    }
    if (url.startsWith('/api/categories')) return Promise.resolve([{ id: 1, major_type: '고정지출', name: '구독료', is_active: 1 }]);
    if (url.startsWith('/api/payment-methods')) return Promise.resolve([{ id: 5, name: '하나카드', type: '신용', is_active: 1 }]);
    if (url.startsWith('/api/settings')) return Promise.resolve({ initial_balance: 0, monthly_income: 0 });
    if (url.startsWith('/api/recurring-rules')) return Promise.resolve([RULE]);
    return Promise.resolve([]);
  });
  del.mockResolvedValue({ ok: true, deleted_transactions: 0 });
}

const renderSettings = () => render(<ConfirmProvider><Settings /></ConfirmProvider>);

const ruleSection = async () => {
  const h = await screen.findByRole('heading', { name: '반복 거래 관리' });
  return within(h.closest('section'));
};

// 첫 확인(비활성화)을 통과시킨다.
async function passFirstConfirm(sec) {
  await userEvent.click(sec.getByRole('button', { name: '비활성화' }));
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '확인' }));
}

const previewCalls = () => get.mock.calls.filter(([url]) => url.endsWith('/delete-preview'));

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

describe('규칙을 끌 때 만든 거래 (#681)', () => {
  it('만든 거래가 있으면 건수·합계를 묻고, 거래도 지우기를 고르면 함께 지운다', async () => {
    mockApi();
    renderSettings();
    const sec = await ruleSection();
    await passFirstConfirm(sec);
    await screen.findByText('이 규칙이 만든 거래 3건(합계 51,000원)도 지울까요?');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '거래도 지우기' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/recurring-rules/20?withTransactions=1'));
  });

  it('규칙만 끄기를 고르면 거래는 남긴다', async () => {
    mockApi();
    renderSettings();
    const sec = await ruleSection();
    await passFirstConfirm(sec);
    await screen.findByText(/이 규칙이 만든 거래 3건/);
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '규칙만 끄기' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/recurring-rules/20'));
  });

  it('만든 거래가 없으면 두 번째 확인 없이 끈다', async () => {
    mockApi({ generatedCount: 0, generatedTotal: 0 });
    renderSettings();
    const sec = await ruleSection();
    await passFirstConfirm(sec);
    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/recurring-rules/20'));
    expect(screen.queryByText(/이 규칙이 만든 거래/)).toBeNull();
  });

  it('첫 확인을 취소하면 미리보기도 삭제도 하지 않는다', async () => {
    mockApi();
    renderSettings();
    const sec = await ruleSection();
    await userEvent.click(sec.getByRole('button', { name: '비활성화' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }));
    expect(previewCalls()).toHaveLength(0);
    expect(del).not.toHaveBeenCalled();
  });
});
