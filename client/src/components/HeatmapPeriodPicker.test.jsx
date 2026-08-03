import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import HeatmapPeriodPicker from './HeatmapPeriodPicker';

// 이 컨트롤은 히트맵만 움직인다. 대시보드 기간 필터와 라벨이 겹치므로(둘 다 월/연)
// 자기 것을 정확히 집어낼 수 있는지가 화면에서 실제로 문제가 됐다 — aria-pressed 와
// aria-label 로 구분된다.

const base = {
  mode: 'month', year: 2026, month: 8, onChange: () => {},
};

describe('A. 표시', () => {
  it('A-1. 월 모드에서 연·월을 함께 보여준다', () => {
    render(<HeatmapPeriodPicker {...base} />);
    expect(screen.getByText('2026년 8월')).toBeTruthy();
  });

  it('A-2. 연 모드에서는 연도만 보여준다', () => {
    render(<HeatmapPeriodPicker {...base} mode="year" />);
    expect(screen.getByText('2026년')).toBeTruthy();
  });

  it('A-3. 선택된 모드가 aria-pressed 로 드러난다', () => {
    render(<HeatmapPeriodPicker {...base} />);
    expect(screen.getByText('월').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('연').getAttribute('aria-pressed')).toBe('false');
  });

  it('A-4. 이 그래프 전용임을 라벨로 밝힌다', () => {
    // 화면에 기간 컨트롤이 둘 보이므로 어느 쪽인지 구분돼야 한다.
    render(<HeatmapPeriodPicker {...base} />);
    expect(screen.getByText('이 그래프만')).toBeTruthy();
  });
});

describe('B. 이동', () => {
  it('B-1. 월 모드에서 이전 달로 간다', () => {
    const onChange = vi.fn();
    render(<HeatmapPeriodPicker {...base} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('이전 달'));
    expect(onChange).toHaveBeenCalledWith({ mode: 'month', year: 2026, month: 7 });
  });

  it('B-2. 1월에서 이전으로 가면 전년 12월이다', () => {
    const onChange = vi.fn();
    render(<HeatmapPeriodPicker {...base} month={1} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('이전 달'));
    expect(onChange).toHaveBeenCalledWith({ mode: 'month', year: 2025, month: 12 });
  });

  it('B-3. 12월에서 다음으로 가면 다음해 1월이다', () => {
    const onChange = vi.fn();
    render(<HeatmapPeriodPicker {...base} month={12} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('다음 달'));
    expect(onChange).toHaveBeenCalledWith({ mode: 'month', year: 2027, month: 1 });
  });

  it('B-4. 연 모드에서는 해 단위로 움직인다', () => {
    const onChange = vi.fn();
    render(<HeatmapPeriodPicker {...base} mode="year" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('이전 해'));
    expect(onChange).toHaveBeenCalledWith({ mode: 'year', year: 2025, month: 8 });
  });

  it('B-5. 연 모드에서도 월 값은 보존된다', () => {
    // 월 모드로 돌아왔을 때 보던 달이 유지돼야 한다.
    const onChange = vi.fn();
    render(<HeatmapPeriodPicker {...base} mode="year" month={3} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('다음 해'));
    expect(onChange).toHaveBeenCalledWith({ mode: 'year', year: 2027, month: 3 });
  });
});

describe('C. 모드 전환', () => {
  it('C-1. 연 버튼이 모드만 바꾸고 연·월은 유지한다', () => {
    const onChange = vi.fn();
    render(<HeatmapPeriodPicker {...base} onChange={onChange} />);
    fireEvent.click(screen.getByText('연'));
    expect(onChange).toHaveBeenCalledWith({ mode: 'year', year: 2026, month: 8 });
  });

  it('C-2. 월 버튼이 모드만 바꾼다', () => {
    const onChange = vi.fn();
    render(<HeatmapPeriodPicker {...base} mode="year" onChange={onChange} />);
    fireEvent.click(screen.getByText('월'));
    expect(onChange).toHaveBeenCalledWith({ mode: 'month', year: 2026, month: 8 });
  });
});

describe('D. 접근성', () => {
  it('D-1. 이동 버튼에 무엇이 바뀌는지 담긴 라벨이 있다', () => {
    render(<HeatmapPeriodPicker {...base} />);
    expect(screen.getByLabelText('이전 달')).toBeTruthy();
    expect(screen.getByLabelText('다음 달')).toBeTruthy();
  });

  it('D-2. 바뀐 기간이 스크린리더에 읽히도록 aria-live 가 붙는다', () => {
    const { container } = render(<HeatmapPeriodPicker {...base} />);
    expect(container.querySelector('[aria-live="polite"]').textContent).toBe('2026년 8월');
  });
});
