import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DerivedTransactions from './DerivedTransactions';

// 부채관리 화면에서 "원본을 고치면 거래가 따라 바뀐다" 를 눈에 보이게 하는 목록(#270).

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../lib/api', () => ({
  api: { get },
  ApiError: class ApiError extends Error {},
}));

const row = (over = {}) => ({
  id: 1, date: '2026-03-01', amount: 100000,
  memo: '1/3회차 · 원금 100,000원', merchant: '노트북',
  origin: 'installment', ...over,
});

beforeEach(() => { get.mockReset(); });

describe('조회', () => {
  it('종류에 맞는 주소를 부른다', async () => {
    get.mockResolvedValue({ data: [] });
    render(<DerivedTransactions kind="installment" id={7} />);
    await screen.findByText(/아직 만들어진 거래가 없어요/);
    expect(get).toHaveBeenCalledWith('/api/installments/7/derived');
  });

  it('리볼빙·부채도 각자 주소를 부른다', async () => {
    get.mockResolvedValue({ data: [] });
    render(<DerivedTransactions kind="revolving" id={4} />);
    await screen.findByText(/아직 만들어진 거래가 없어요/);
    expect(get).toHaveBeenCalledWith('/api/revolving/4/derived');
  });
});

describe('표시', () => {
  it('건수와 합계를 함께 보여준다', async () => {
    get.mockResolvedValue({
      data: [row({ id: 1 }), row({ id: 2, amount: 50000 })],
    });
    render(<DerivedTransactions kind="installment" id={7} />);
    expect(await screen.findByText(/2건 · 합계 150,000원/)).toBeTruthy();
  });

  it('여기서 고칠 수 없다는 것과 어떻게 되는지를 알린다', async () => {
    get.mockResolvedValue({ data: [row()] });
    render(<DerivedTransactions kind="installment" id={7} />);
    expect(await screen.findByText(/거래내역에서 직접 고칠 수 없어요/)).toBeTruthy();
    expect(screen.getByText(/원본을 고치면 함께 바뀝니다/)).toBeTruthy();
  });

  it('빈 상태가 다음에 무슨 일이 생기는지 말한다', async () => {
    get.mockResolvedValue({ data: [] });
    render(<DerivedTransactions kind="installment" id={7} />);
    expect(await screen.findByText(/거래내역에 자동으로 들어가요/)).toBeTruthy();
  });

  it('조회가 실패하면 조용히 비어 보이지 않는다', async () => {
    // 빈 목록과 실패를 구분 못 하면 사용자가 "거래가 없다" 로 잘못 읽는다.
    get.mockRejectedValue(new Error('서버에 연결할 수 없습니다.'));
    render(<DerivedTransactions kind="installment" id={7} />);
    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('내부 필드명이 노출되지 않는다', async () => {
    get.mockResolvedValue({ data: [row()] });
    const { container } = render(<DerivedTransactions kind="installment" id={7} />);
    await screen.findByText(/1건/);
    expect(container.textContent).not.toMatch(/origin|derived|installment_id/);
  });
});
