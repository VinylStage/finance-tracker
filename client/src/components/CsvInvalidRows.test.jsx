import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import CsvInvalidRows from './CsvInvalidRows';

const ROWS = [
  { line: 3, raw: '2026.13.45,가상서점,20000', reason: '날짜를 읽을 수 없습니다' },
  { line: 4, raw: '2026.01.16,가상식당,abc', reason: '금액을 읽을 수 없습니다' },
];

describe('CsvInvalidRows', () => {
  it('제외된 행 건수를 요약에 보인다', () => {
    const { container } = render(<CsvInvalidRows rows={ROWS} />);
    const summary = screen.getByText('제외된 행 2건 보기');
    expect(summary).toBeTruthy();
  });

  it('행마다 행 번호와 이유를 보인다', () => {
    const { container } = render(<CsvInvalidRows rows={ROWS} />);
    const list = screen.getByTestId('csv-invalid-rows');
    const textContent = list.textContent;
    expect(textContent).toContain('3행');
    expect(textContent).toContain('날짜를 읽을 수 없습니다');
    expect(textContent).toContain('4행');
    expect(textContent).toContain('금액을 읽을 수 없습니다');
  });

  it('원본 값을 그대로 보인다', () => {
    const { container } = render(<CsvInvalidRows rows={ROWS} />);
    const list = screen.getByTestId('csv-invalid-rows');
    const textContent = list.textContent;
    expect(textContent).toContain('2026.13.45,가상서점,20000');
    expect(textContent).toContain('2026.01.16,가상식당,abc');
  });

  it('행 하나에 항목 하나', () => {
    const { container } = render(<CsvInvalidRows rows={ROWS} />);
    const items = screen.getByTestId('csv-invalid-rows').querySelectorAll('li');
    expect(items.length).toEqual(2);
  });

  it('기본은 접혀 있다', () => {
    const { container } = render(<CsvInvalidRows rows={ROWS} />);
    const details = screen.getByTestId('csv-invalid-rows');
    expect(details.open).toBeFalsy();
  });

  it('제외 행이 없으면 그리지 않는다', () => {
    const { container } = render(<CsvInvalidRows rows={[]} />);
    expect(container.firstChild).toBeNull();

    const { container: container2 } = render(<CsvInvalidRows />);
    expect(container2.firstChild).toBeNull();
  });
});
