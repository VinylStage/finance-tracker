import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DerivedTransactions from './DerivedTransactions';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../lib/api', () => ({
  api: { get },
  ApiError: class ApiError extends Error {},
}));

// 이름은 지어낸 것이다. 실제 가맹점 이름을 쓰지 않는다 — 이 저장소는 공개다.
const row = (over = {}) => ({
  id: 1, date: '2026-03-01', amount: 100000,
  memo: '1/3회차 · 원금 100,000원', merchant: '예시물품 갑',
  origin: 'installment', ...over,
});

beforeEach(() => { get.mockReset(); });

describe('건수를 부모에게 알린다', () => {
  it('받은 만큼 알린다', async () => {
    get.mockResolvedValue({ data: [row(), row({ id: 2 })] });
    const onLoaded = vi.fn();

    render(<DerivedTransactions kind="installment" id={7} onLoaded={onLoaded} />);

    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(2));
  });

  it('목록 칸이 없으면 0 을 알린다', async () => {
    get.mockResolvedValue({});
    const onLoaded = vi.fn();

    render(<DerivedTransactions kind="installment" id={7} onLoaded={onLoaded} />);

    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(0));
  });

  it('알릴 곳이 없어도 터지지 않는다', async () => {
    get.mockResolvedValue({ data: [row()] });

    render(<DerivedTransactions kind="installment" id={7} />);

    await waitFor(() => expect(get).toHaveBeenCalled());
    // 내용 칸은 메모를 먼저 쓴다. 픽스처에 메모가 있으므로 그것이 보인다.
    expect(await screen.findByText('1/3회차 · 원금 100,000원')).toBeTruthy();
    expect(screen.getByText(/이 항목이 만든 거래 1건/)).toBeTruthy();
  });
});

describe('못 읽었을 때', () => {
  it('이유를 화면에 남기고 건수는 알리지 않는다', async () => {
    get.mockRejectedValue(new Error('조회 실패'));
    const onLoaded = vi.fn();

    render(<DerivedTransactions kind="installment" id={7} onLoaded={onLoaded} />);

    expect(await screen.findByText('조회 실패')).toBeTruthy();
    expect(onLoaded).not.toHaveBeenCalled();
  });
});

describe('목록 칸이 없어도 화면이 선다', () => {
  it('거래가 없다고 말한다', async () => {
    get.mockResolvedValue({});

    render(<DerivedTransactions kind="installment" id={7} />);

    expect(await screen.findByText(/아직 만들어진 거래가 없어요/)).toBeTruthy();
  });
});
