import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Installments from './Installments';
import { ConfirmProvider } from '../components/ConfirmProvider';

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

// 청구월 응답만 갈아 가며 쓴다. 나머지는 빈 목록으로 둔다.
function mockGet(billing) {
  get.mockImplementation((url) => {
    if (url.startsWith('/api/card-products/billing-month')) return Promise.resolve({ data: billing });
    if (url.startsWith('/api/installments/duplicates')) return Promise.resolve({ data: [] });
    if (url.startsWith('/api/installments')) return Promise.resolve({ data: [], this_month_total: 0 });
    if (url === '/api/payment-methods') return Promise.resolve([]);
    if (url === '/api/categories') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
}

// 폼을 열고 구매일을 넣어 청구월 계산을 부른다.
async function openFormWith(billing) {
  mockGet(billing);
  const user = userEvent.setup();
  render(<ConfirmProvider><Installments /></ConfirmProvider>);
  // 접근명으로 정확히 집는다. 이 화면에는 버튼이 여럿이라 role 만으로는 못 고른다.
  await user.click(await screen.findByRole('button', { name: '+ 할부 등록' }));
  return user;
}

beforeEach(() => {
  get.mockReset(); post.mockReset(); put.mockReset(); del.mockReset();
  put.mockResolvedValue({ ok: true });
  post.mockResolvedValue({ ok: true });
  del.mockResolvedValue({ ok: true });
});

describe('청구월 계산 근거 문구', () => {
  it('카드 이름을 넣어 적는다', async () => {
    await openFormWith({
      billing_month: '2026-09', resolved: true, ambiguous: false,
      card_product: { product_name: '예시 신용카드' },
    });
    expect(await screen.findByText('예시 신용카드 청구주기로 계산했어요.')).toBeTruthy();
  });

  it('카드 정보가 없으면 그냥 카드라고 적는다', async () => {
    await openFormWith({ billing_month: '2026-09', resolved: true, ambiguous: false });
    expect(await screen.findByText('카드 청구주기로 계산했어요.')).toBeTruthy();
  });

  it('상품이 여럿이면 확인을 요청한다', async () => {
    await openFormWith({ billing_month: '2026-08', resolved: false, ambiguous: true });
    expect(await screen.findByText(/청구주기가 다른 상품이 여럿이라/)).toBeTruthy();
  });
});
