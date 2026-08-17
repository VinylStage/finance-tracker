import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import HeatmapCardPicker from './HeatmapCardPicker';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../lib/api', () => ({
  api: { get },
  ApiError: class ApiError extends Error {},
}));

const CARDS = [
  { id: 3, issuer: '테스트카드사', product_name: '가카드', is_active: 1 },
  { id: 7, issuer: '다른카드사', product_name: '나카드', is_active: 0 },
];

function mockCards(rows = CARDS) {
  get.mockResolvedValue({ data: rows });
}

// 선택 상자를 찾는다. 라벨은 «어느 카드» 다.
const pickerOf = () => screen.findByLabelText('어느 카드');

// 카드 목록이 실제로 붙을 때까지 기다린 선택 상자.
//
// `findByLabelText` 는 선택 상자가 생기자마자 돌아온다. 카드 옵션은 그보다 늦게
// 붙으므로, 카드에 기대는 단언은 이쪽을 써야 한다.
async function pickerWithOption(value) {
  const sel = await pickerOf();
  await waitFor(() => {
    const values = Array.from(sel.options).map((o) => o.value);
    expect(values).toContain(value);
  });
  return sel;
}

describe('HeatmapCardPicker', () => {
  beforeEach(() => { vi.clearAllMocks(); mockCards(); });

  it('renders with "전체" and "미지정" options always', async () => {
    render(<HeatmapCardPicker value="" onChange={() => {}} />);
    
    const sel = await pickerOf();
    const values = Array.from(sel.options).map((o) => o.value);
    expect(values.slice(0, 2)).toEqual(['', 'none']);
  });

  it('renders received cards as options', async () => {
    render(<HeatmapCardPicker value="" onChange={() => {}} />);
    
    const sel = await pickerWithOption('3');
    const values = Array.from(sel.options).map((o) => o.value);
    expect(values).toContain('3');
    expect(values).toContain('7');
  });

  it('renders inactive cards', async () => {
    render(<HeatmapCardPicker value="" onChange={() => {}} />);
    
    const sel = await pickerWithOption('7');
    const values = Array.from(sel.options).map((o) => o.value);
    expect(values).toContain('7');
  });

  it('requests with include_inactive=1', async () => {
    render(<HeatmapCardPicker value="" onChange={() => {}} />);
    
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(get.mock.calls[0][0]).toContain('include_inactive=1');
  });

  it('calls onChange with selected value', async () => {
    const onChange = vi.fn();
    render(<HeatmapCardPicker value="" onChange={onChange} />);
    
    const sel = await pickerWithOption('3');
    await userEvent.setup().selectOptions(sel, '3');
    expect(onChange).toHaveBeenCalledWith('3');
  });

  it('calls onChange with "none" when selected', async () => {
    const onChange = vi.fn();
    render(<HeatmapCardPicker value="" onChange={onChange} />);
    
    await userEvent.setup().selectOptions(await pickerOf(), 'none');
    expect(onChange).toHaveBeenCalledWith('none');
  });

  it('renders only "전체" and "미지정" when card list fails', async () => {
    get.mockRejectedValue(new Error('boom'));
    render(<HeatmapCardPicker value="" onChange={() => {}} />);
    
    await waitFor(() => expect(get).toHaveBeenCalled());

    const sel = await pickerOf();
    await waitFor(() => {
      const values = Array.from(sel.options).map((o) => o.value);
      expect(values).toEqual(['', 'none']);
    });
  });

  it('응답에 목록 칸이 없어도 전체와 미지정은 남는다', async () => {
    get.mockResolvedValue({});
    render(<HeatmapCardPicker value="" onChange={() => {}} />);
    await waitFor(() => expect(get).toHaveBeenCalled());

    const select = screen.getByLabelText('어느 카드');
    await waitFor(() => {
      const values = [...select.querySelectorAll('option')].map((o) => o.value);
      expect(values).toEqual(['', 'none']);
    });
  });
});
