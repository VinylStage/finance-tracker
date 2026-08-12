import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ThresholdExclusionSection from './ThresholdExclusionSection';

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

// 이름은 지어낸 것이다. 실제 카드·가맹점 이름을 쓰지 않는다 — 이 저장소는 공개다.
const payload = (txOver = {}) => ({
  period: { start: '2026-07-01', end: '2026-07-31' },
  data: [
    {
      cardProductId: 1, issuer: '예시카드사', productName: '예시 신용카드',
      countedTotal: 300000,
      transactions: [
        { id: 11, date: '2026-07-05', merchant: '예시가맹점 갑', amount: 150000, excluded: false, ...txOver },
      ],
    },
  ],
});

const cardButton = () => screen.getByRole('button', { name: /예시 신용카드/ });

beforeEach(() => {
  get.mockReset(); post.mockReset(); put.mockReset(); del.mockReset();
});

describe('카드 접기', () => {
  it('누르면 펼쳐지고 다시 누르면 접힌다', async () => {
    get.mockResolvedValue(payload());
    const user = userEvent.setup();
    render(<ThresholdExclusionSection />);

    const btn = await screen.findByRole('button', { name: /예시 신용카드/ });
    expect(btn.getAttribute('aria-expanded')).toBe('false');

    await user.click(btn);
    expect(cardButton().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/예시가맹점 갑/)).toBeTruthy();

    await user.click(cardButton());
    expect(cardButton().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/예시가맹점 갑/)).toBe(null);
  });

  it('가맹점이 비었으면 괄호 붙은 표기로 자리를 지킨다', async () => {
    get.mockResolvedValue(payload({ merchant: null }));
    const user = userEvent.setup();
    render(<ThresholdExclusionSection />);

    await user.click(await screen.findByRole('button', { name: /예시 신용카드/ }));

    expect(screen.getByText('(가맹점 없음)')).toBeTruthy();
  });
});

describe('실패했을 때', () => {
  it('조회가 이유 없이 실패하면 기본 문구를 적는다', async () => {
    get.mockRejectedValue(new Error(''));
    render(<ThresholdExclusionSection />);

    expect(await screen.findByText('거래를 불러오지 못했습니다.')).toBeTruthy();
  });

  it('조회 실패에 이유가 있으면 그것을 적는다', async () => {
    get.mockRejectedValue(new Error('서버가 끊겼어요'));
    render(<ThresholdExclusionSection />);

    expect(await screen.findByText('서버가 끊겼어요')).toBeTruthy();
  });

  it('제외하다 이유 없이 실패하면 기본 문구를 적는다', async () => {
    get.mockResolvedValue(payload());
    post.mockRejectedValue(new Error(''));
    const user = userEvent.setup();
    render(<ThresholdExclusionSection />);

    await user.click(await screen.findByRole('button', { name: /예시 신용카드/ }));
    await user.click(screen.getByRole('button', { name: '실적에서 빼기' }));

    expect(await screen.findByText('바꾸지 못했습니다.')).toBeTruthy();
  });
});
