import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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

// 이름은 지어낸 것이다. 실제 카드·가맹점 이름을 쓰지 않는다 — 이 저장소는 공개다.
const row = (over = {}) => ({
  id: 3, merchant: '예시물품 갑', total_amount: 1200000, monthly_amount: 200000,
  months: 6, billed_months: 2, remaining_months: 4, status: '진행중',
  payment_method_name: '예시카드사',
  ...over,
});

function mockGet(rows) {
  get.mockImplementation((url) => {
    if (url.startsWith('/api/installments/duplicates')) return Promise.resolve({ data: [] });
    if (url.startsWith('/api/installments')) {
      return Promise.resolve({ data: rows, this_month_total: 200000 });
    }
    if (url === '/api/payment-methods') return Promise.resolve([]);
    if (url === '/api/categories') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
}

async function renderLoaded(rows) {
  mockGet(rows);
  render(<ConfirmProvider><Installments /></ConfirmProvider>);
  await screen.findByText('예시물품 갑');
}

beforeEach(() => {
  get.mockReset(); post.mockReset(); put.mockReset(); del.mockReset();
  put.mockResolvedValue({ ok: true });
  post.mockResolvedValue({ ok: true });
  del.mockResolvedValue({ ok: true });
});

describe('요율 미입력 경고', () => {
  it('요율을 안 넣어 0 이면 그 사실을 알린다', async () => {
    await renderLoaded([row({ basis: { source: 'none', reason: '카드 정책이 없어요' } })]);
    expect(screen.getByText('요율 미입력')).toBeTruthy();
  });

  it('왜 그런지를 붙여 둔다', async () => {
    await renderLoaded([row({ basis: { source: 'none', reason: '카드 정책이 없어요' } })]);
    expect(screen.getByText('요율 미입력').getAttribute('title')).toBe('카드 정책이 없어요');
  });

  it('근거가 있는 계산이면 경고하지 않는다', async () => {
    await renderLoaded([row({ basis: { source: 'policy', reason: '무이자' } })]);
    expect(screen.queryByText('요율 미입력')).toBe(null);
  });

  it('근거 정보 자체가 없으면 경고하지 않는다', async () => {
    await renderLoaded([row()]);
    expect(screen.queryByText('요율 미입력')).toBe(null);
  });
});
