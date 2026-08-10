import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import MonthCalendarGrid from './MonthCalendarGrid';

// 격자 계산은 달마다 틀리기 쉬운 곳이다 — 윤년 2월, 1일이 일요일인 달(빈 칸 0개),
// 1일이 토요일인 달(빈 칸 6개)이 경계다. 세 화면이 이 컴포넌트를 공유하므로
// 여기서 한 번 고정해두면 각자 다시 틀리지 않는다.

function grids(container) {
  return [...container.querySelectorAll('.grid.grid-cols-7')];
}
function cells(container) {
  return [...grids(container)[1].children];
}
function dayCells(container) {
  return cells(container).filter((c) => c.textContent.trim() !== '');
}

const base = { renderCell: (day) => day };

describe('격자 계산', () => {
  it('윤년 2월은 29칸이다 (2024-02)', () => {
    const { container } = render(<MonthCalendarGrid year={2024} month={2} {...base} />);
    expect(dayCells(container).length).toBe(29);
  });

  it('평년 2월은 28칸이다 (2026-02)', () => {
    const { container } = render(<MonthCalendarGrid year={2026} month={2} {...base} />);
    expect(dayCells(container).length).toBe(28);
  });

  it('31일 달은 31칸이다 (2026-07)', () => {
    const { container } = render(<MonthCalendarGrid year={2026} month={7} {...base} />);
    const days = dayCells(container);
    expect(days.length).toBe(31);
    expect(days[0].textContent.trim()).toBe('1');
    expect(days[30].textContent.trim()).toBe('31');
  });

  it('30일 달은 30칸이다 (2026-11)', () => {
    const { container } = render(<MonthCalendarGrid year={2026} month={11} {...base} />);
    expect(dayCells(container).length).toBe(30);
  });

  it('1일이 일요일이면 앞 빈 칸이 없다 (2026-03)', () => {
    const { container } = render(<MonthCalendarGrid year={2026} month={3} {...base} />);
    expect(cells(container)[0].textContent.trim()).toBe('1');
  });

  it('1일이 토요일이면 앞 빈 칸이 여섯 개다 (2026-08)', () => {
    const { container } = render(<MonthCalendarGrid year={2026} month={8} {...base} />);
    const all = cells(container);
    expect(all.slice(0, 6).every((c) => c.textContent.trim() === '')).toBe(true);
    expect(all[6].textContent.trim()).toBe('1');
  });

  it('1일이 수요일이면 앞 빈 칸이 세 개다 (2026-07)', () => {
    const { container } = render(<MonthCalendarGrid year={2026} month={7} {...base} />);
    const all = cells(container);
    expect(all.slice(0, 3).every((c) => c.textContent.trim() === '')).toBe(true);
    expect(all[3].textContent.trim()).toBe('1');
  });
});

describe('레이아웃', () => {
  it('요일 머리글이 일곱 개다', () => {
    const { container } = render(<MonthCalendarGrid year={2026} month={7} {...base} />);
    expect([...grids(container)[0].children].map((c) => c.textContent.trim())).toEqual(
      ['일', '월', '화', '수', '목', '금', '토']
    );
  });

  it('격자는 7열을 유지한다 — 모바일 폭에서도 열 수가 바뀌지 않는다', () => {
    const { container } = render(<MonthCalendarGrid year={2026} month={7} {...base} />);
    for (const g of grids(container)) expect(g.className).toContain('grid-cols-7');
  });

  it('모든 칸이 aspect-square 를 갖는다 — 빈 칸도 자리를 차지한다', () => {
    const { container } = render(<MonthCalendarGrid year={2026} month={8} {...base} />);
    for (const c of cells(container)) expect(c.className).toContain('aspect-square');
  });
});

describe('셀 위임', () => {
  it('renderCell 이 셀 내용을 정한다', () => {
    const { container } = render(
      <MonthCalendarGrid year={2026} month={7} renderCell={(day) => `${day}일`} />
    );
    expect(dayCells(container)[0].textContent.trim()).toBe('1일');
  });

  it('cellProps 가 준 className 이 aspect-square 뒤에 붙는다', () => {
    const { container } = render(
      <MonthCalendarGrid year={2026} month={7} {...base} cellProps={() => ({ className: 'x-mark' })} />
    );
    expect(dayCells(container)[0].className).toBe('aspect-square x-mark');
  });

  it('cellProps 가 임의 속성을 셀에 넘긴다', () => {
    const { container } = render(
      <MonthCalendarGrid
        year={2026}
        month={7}
        {...base}
        cellProps={(day) => ({ title: `${day}번째` })}
      />
    );
    expect(dayCells(container)[0].getAttribute('title')).toBe('1번째');
  });

  it('빈 칸에는 cellProps 를 붙이지 않는다 — 날짜가 없으면 제목도 성립하지 않는다', () => {
    const { container } = render(
      <MonthCalendarGrid
        year={2026}
        month={8}
        {...base}
        cellProps={() => ({ title: '있으면 안 됨', className: 'x-mark' })}
      />
    );
    const blank = cells(container)[0];
    expect(blank.getAttribute('title')).toBe(null);
    expect(blank.className).not.toContain('x-mark');
  });

  it('cellProps 없이도 렌더된다', () => {
    const { container } = render(<MonthCalendarGrid year={2026} month={7} {...base} />);
    expect(dayCells(container).length).toBe(31);
  });
});
