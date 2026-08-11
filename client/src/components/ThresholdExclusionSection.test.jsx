import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ThresholdExclusionSection from './ThresholdExclusionSection';

// 카드별 실적 제외 목록(#526).

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

const PAYLOAD = {
  period: { start: '2026-07-01', end: '2026-07-31' },
  data: [
    {
      cardProductId: 1, issuer: '하나', productName: '①', countedTotal: 300000,
      transactions: [
        { id: 11, date: '2026-07-05', merchant: '가맹A', amount: 150000, excluded: false },
        { id: 12, date: '2026-07-12', merchant: '가맹B', amount: 150000, excluded: false },
        { id: 13, date: '2026-07-20', merchant: '가맹C', amount: 150000, excluded: true },
      ],
    },
    {
      cardProductId: 2, issuer: '삼성', productName: '①', countedTotal: 0,
      transactions: [],
    },
  ],
};

function mockApi(payload = PAYLOAD) {
  get.mockResolvedValue(payload);
  post.mockResolvedValue({ ok: true });
  del.mockResolvedValue({ ok: true, restored: 1 });
}

const openCard = async (user) => {
  const header = await screen.findByRole('button', { name: /하나 ①/ });
  await user.click(header);
};

beforeEach(() => {
  vi.clearAllMocks();
  mockApi();
});

describe('카드별 목록', () => {
  it('거래가 있는 카드만 보여준다', async () => {
    render(<ThresholdExclusionSection />);
    
    await screen.findByRole('button', { name: /하나 ①/ });
    expect(screen.queryByRole('button', { name: /삼성 ①/ })).toBeNull();
  });

  it('카드를 열기 전에는 거래가 안 보인다', async () => {
    render(<ThresholdExclusionSection />);
    
    await screen.findByRole('button', { name: /하나 ①/ });
    expect(screen.queryByText('가맹A')).toBeNull();
  });

  it('카드를 열면 거래가 보인다', async () => {
    const user = userEvent.setup();
    render(<ThresholdExclusionSection />);
    
    await screen.findByRole('button', { name: /하나 ①/ });
    await openCard(user);
    await screen.findByText('가맹A');
  });
});

describe('토글', () => {
  it('빼기를 누르면 POST 한다', async () => {
    const user = userEvent.setup();
    render(<ThresholdExclusionSection />);
    
    await openCard(user);
    const toggleButton = screen.getAllByRole('button', { name: '실적에서 빼기' })[0];
    await user.click(toggleButton);
    
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/api/card-strategy/exclusions', { transaction_id: 11 });
    });
  });

  it('이미 뺀 거래는 다시 넣기를 준다', async () => {
    const user = userEvent.setup();
    render(<ThresholdExclusionSection />);
    
    await openCard(user);
    await screen.findByRole('button', { name: '다시 넣기' });
  });

  it('다시 넣기를 누르면 DELETE 한다', async () => {
    const user = userEvent.setup();
    render(<ThresholdExclusionSection />);
    
    await openCard(user);
    const restoreButton = await screen.findByRole('button', { name: '다시 넣기' });
    await user.click(restoreButton);
    
    await waitFor(() => {
      expect(del).toHaveBeenCalledWith('/api/card-strategy/exclusions/13');
    });
  });
});
