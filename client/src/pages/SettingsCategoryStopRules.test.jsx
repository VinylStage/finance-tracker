import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Settings from './Settings';
import { ConfirmProvider } from '../components/ConfirmProvider';

// #677 — 분류를 끌 때 그 분류를 쓰는 반복규칙이 있으면 함께 끌지 한 번 더 묻는다.

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

const ACTIVE = { id: 11, major_type: '선택지출', name: '커피', monthly_budget: 50000, is_active: 1 };

function mockApi({ activeRules = 2, transactions = 5 } = {}) {
  get.mockImplementation((url) => {
    if (url === '/api/categories/11/delete-preview') return Promise.resolve({ id: 11, active_rules: activeRules, transactions });
    if (url.startsWith('/api/categories')) return Promise.resolve([ACTIVE]);
    if (url.startsWith('/api/payment-methods')) return Promise.resolve([]);
    if (url.startsWith('/api/settings')) return Promise.resolve({ initial_balance: 0, monthly_income: 0 });
    if (url.startsWith('/api/recurring-rules')) return Promise.resolve([]);
    return Promise.resolve([]);
  });
  del.mockResolvedValue({ ok: true, stopped_rules: 0 });
}

const renderSettings = () => render(<ConfirmProvider><Settings /></ConfirmProvider>);

const categorySection = async () => {
  const h = await screen.findByRole('heading', { name: '카테고리 관리' });
  return within(h.closest('section'));
};

async function passFirstConfirm(sec) {
  await userEvent.click(sec.getByRole('button', { name: '비활성화' }));
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '확인' }));
}

const previewCalls = () => get.mock.calls.filter(([url]) => url.endsWith('/delete-preview'));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('분류를 끌 때 쓰는 규칙 (#677)', () => {
  it('쓰는 규칙이 있으면 건수를 묻고, 규칙도 끄기를 고르면 함께 끈다', async () => {
    mockApi();
    renderSettings();
    const sec = await categorySection();
    passFirstConfirm(sec);
    await screen.findByText('이 분류를 쓰는 반복 규칙 2건이 계속 거래를 만듭니다(지난 거래 5건은 그대로 남아요). 규칙도 함께 끌까요?');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '규칙도 끄기' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/categories/11?stopRules=1'));
  });

  it('분류만 끄기를 고르면 규칙은 둔다', async () => {
    mockApi();
    renderSettings();
    const sec = await categorySection();
    passFirstConfirm(sec);
    await screen.findByText(/반복 규칙 2건/);
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '분류만 끄기' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/categories/11'));
  });

  it('쓰는 규칙이 없으면 두 번째 확인 없이 끈다', async () => {
    mockApi({ activeRules: 0, transactions: 3 });
    renderSettings();
    const sec = await categorySection();
    passFirstConfirm(sec);
    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/categories/11'));
    expect(screen.queryByText(/규칙도 함께 끌까요/)).toBeNull();
  });

  it('첫 확인을 취소하면 미리보기도 삭제도 하지 않는다', async () => {
    mockApi();
    renderSettings();
    const sec = await categorySection();
    await userEvent.click(sec.getByRole('button', { name: '비활성화' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }));
    expect(previewCalls()).toHaveLength(0);
    expect(del).not.toHaveBeenCalled();
  });
});
