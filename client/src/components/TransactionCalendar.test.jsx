import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TransactionCalendar from './TransactionCalendar';

// 달력뷰의 핵심은 두 가지다. 거래 없는 날과 0원인 날이 구분되는지, 그리고 월 이동이
// 이 화면 안에서만 일어나는지(콜백으로 위임).

const buckets = {
  '2026-08-03': { income: 0, expense: 12000, count: 1 },
  '2026-08-05': { income: 500000, expense: 0, count: 1 },
  '2026-08-07': { income: 1000, expense: 2000, count: 3 },
};

const base = {
  year: 2026,
  month: 8,
  buckets,
  onPrev: () => {},
  onNext: () => {},
  onSelectDay: () => {},
  selectedDay: null,
};

function cellFor(container, day) {
  const grids = [...container.querySelectorAll('.grid.grid-cols-7')];
  return [...grids[1].children].find(
    (c) => c.querySelector('span')?.textContent.trim() === String(day)
  );
}

describe('셀 표시', () => {
  it('지출이 있는 날은 금액을 음수 표기로 보여준다', () => {
    const { container } = render(<TransactionCalendar {...base} />);
    expect(cellFor(container, 3).textContent).toContain('-12,000');
  });

  it('수입이 있는 날은 양수 표기로 보여준다', () => {
    const { container } = render(<TransactionCalendar {...base} />);
    expect(cellFor(container, 5).textContent).toContain('+500,000');
  });

  it('수입과 지출이 같은 날 함께 나온다', () => {
    const { container } = render(<TransactionCalendar {...base} />);
    const t = cellFor(container, 7).textContent;
    expect(t).toContain('-2,000');
    expect(t).toContain('+1,000');
  });

  it('거래 없는 날은 숫자를 그리지 않는다 — 0 원과 구분된다', () => {
    const { container } = render(<TransactionCalendar {...base} />);
    // 4일은 buckets 에 없다. 날짜 숫자 말고는 아무것도 없어야 한다.
    expect(cellFor(container, 4).textContent.trim()).toBe('4');
  });

  it('지출 0 원인 날은 지출 줄을 그리지 않는다', () => {
    const { container } = render(<TransactionCalendar {...base} />);
    expect(cellFor(container, 5).textContent).not.toContain('-0');
  });
});

describe('월 이동', () => {
  it('제목에 연·월이 나온다', () => {
    render(<TransactionCalendar {...base} />);
    expect(screen.getByText('2026년 8월')).toBeTruthy();
  });

  it('이전/다음 버튼이 콜백을 부른다 — 이동 자체는 호출부가 정한다', () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(<TransactionCalendar {...base} onPrev={onPrev} onNext={onNext} />);
    fireEvent.click(screen.getByLabelText('이전 달'));
    fireEvent.click(screen.getByLabelText('다음 달'));
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});

describe('날짜 선택', () => {
  it('셀을 누르면 그 날짜로 콜백이 온다', () => {
    const onSelectDay = vi.fn();
    const { container } = render(<TransactionCalendar {...base} onSelectDay={onSelectDay} />);
    fireEvent.click(cellFor(container, 3));
    expect(onSelectDay).toHaveBeenCalledWith('2026-08-03');
  });

  it('키보드 Enter 로도 선택된다', () => {
    const onSelectDay = vi.fn();
    const { container } = render(<TransactionCalendar {...base} onSelectDay={onSelectDay} />);
    fireEvent.keyDown(cellFor(container, 5), { key: 'Enter' });
    expect(onSelectDay).toHaveBeenCalledWith('2026-08-05');
  });

  it('선택된 날짜가 시각적으로 구분된다', () => {
    const { container } = render(<TransactionCalendar {...base} selectedDay="2026-08-03" />);
    expect(cellFor(container, 3).className).toContain('border-accent');
    expect(cellFor(container, 5).className).not.toContain('border-accent');
  });
});

describe('접근성', () => {
  it('셀에 금액과 건수가 읽히는 라벨이 붙는다', () => {
    const { container } = render(<TransactionCalendar {...base} />);
    expect(cellFor(container, 7).getAttribute('aria-label')).toBe(
      '8월 7일 · 지출 2,000원 · 수입 1,000원 · 3건'
    );
  });

  it('거래 없는 날도 라벨로 상태를 말한다', () => {
    const { container } = render(<TransactionCalendar {...base} />);
    expect(cellFor(container, 4).getAttribute('aria-label')).toBe('8월 4일 · 거래 없음');
  });

  it('모든 날짜 셀이 키보드 초점을 받는다', () => {
    const { container } = render(<TransactionCalendar {...base} />);
    expect(cellFor(container, 1).getAttribute('tabindex')).toBe('0');
  });
});
