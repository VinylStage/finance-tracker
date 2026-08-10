import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CardTierSection, { duplicateMinSpend } from './CardTierSection';
import { ConfirmProvider } from './ConfirmProvider';

// 카드 실적 구간 편집(#526).

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

const CARDS = [{ id: 7, issuer: '하나', product_name: 'A' }];
const TIERS = [
  { id: 1, min_spend: 0, rate: 0.5, label: null },
  { id: 2, min_spend: 400000, rate: 1.5, label: '40만' },
];

function mockApi({ tiers = TIERS } = {}) {
  get.mockImplementation((url) => {
    if (url.startsWith('/api/card-products')) return Promise.resolve({ data: CARDS });
    if (url.startsWith('/api/card-strategy/tiers/')) return Promise.resolve({ data: tiers });
    return Promise.resolve({ data: [] });
  });
  put.mockResolvedValue({ ok: true, data: tiers });
}

const renderSection = () => render(<ConfirmProvider><CardTierSection /></ConfirmProvider>);

const pickCard = async (user) => {
  const select = await screen.findByLabelText('카드');
  await user.selectOptions(select, '7');
};

beforeEach(() => {
  vi.clearAllMocks();
  mockApi();
});

describe('duplicateMinSpend', () => {
  it('중복이 없으면 null 이다', () => {
    const result = duplicateMinSpend([{ min_spend: '0' }, { min_spend: '400000' }]);
    expect(result).toBeNull();
  });

  it('같은 하한이 두 번이면 그 값을 돌려준다', () => {
    const result = duplicateMinSpend([{ min_spend: '0' }, { min_spend: '0' }]);
    expect(result).toBe(0);
  });

  it('빈 하한은 세지 않는다', () => {
    const result = duplicateMinSpend([{ min_spend: '' }, { min_spend: '' }]);
    expect(result).toBeNull();
  });
});

describe('구간 편집', () => {
  it('카드를 고르면 그 카드의 구간을 불러온다', async () => {
    const user = userEvent.setup();
    renderSection();
    await pickCard(user);
    
    await waitFor(() => {
      expect(get).toHaveBeenCalledWith('/api/card-strategy/tiers/7');
    });
  });

  it('구간 추가를 누르면 행이 는다', async () => {
    const user = userEvent.setup();
    renderSection();
    await pickCard(user);
    
    const initialInputs = screen.getAllByLabelText('실적 하한');
    expect(initialInputs).toHaveLength(2);
    
    const addButton = screen.getByText('+ 구간 추가');
    await user.click(addButton);
    
    const newInputs = screen.getAllByLabelText('실적 하한');
    expect(newInputs).toHaveLength(3);
  });

  it('저장을 누르면 구간 전체를 PUT 한다', async () => {
    const user = userEvent.setup();
    renderSection();
    await pickCard(user);
    
    const saveButton = screen.getByText('저장');
    await user.click(saveButton);
    
    await waitFor(() => {
      expect(put).toHaveBeenCalledWith('/api/card-strategy/tiers/7', expect.anything());
    });
  });
});
