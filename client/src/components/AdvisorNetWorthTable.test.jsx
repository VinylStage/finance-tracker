import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import AdvisorNetWorthTable from './AdvisorNetWorthTable';

const ROWS = [
  { month: '2026-10', cash: 1973922, savings: 500000, debt: 99100000, netWorth: -96626078 },
  { month: '2026-11', cash: 2126553, savings: 1000000, debt: 0, netWorth: 3126553 },
];

describe('AdvisorNetWorthTable', () => {
  it('renders table headers correctly', () => {
    render(<AdvisorNetWorthTable rows={ROWS} />);
    const headers = Array.from(screen.getByTestId('networth-table').querySelectorAll('th')).map((th) => th.textContent);
    expect(headers).toEqual(['월', '현금', '적금', '부채', '순자산']);
  });

  it('renders monetary values correctly', () => {
    render(<AdvisorNetWorthTable rows={ROWS} />);
    const tableText = screen.getByTestId('networth-table').textContent;
    expect(tableText).toContain('1,973,922원');
    expect(tableText).toContain('500,000원');
    expect(tableText).toContain('99,100,000원');
    expect(tableText).toContain('-96,626,078원');
  });

  it('renders one row per month', () => {
    render(<AdvisorNetWorthTable rows={ROWS} />);
    const rows = screen.getByTestId('networth-table').querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
  });

  it('negative net worth is emphasized', () => {
    render(<AdvisorNetWorthTable rows={ROWS} />);
    const cell = screen.getByTestId('networth-2026-10');
    expect(cell.className).toContain('text-loss-text');
  });

  it('positive net worth is not emphasized and shows correct value', () => {
    render(<AdvisorNetWorthTable rows={ROWS} />);
    const cell = screen.getByTestId('networth-2026-11');
    expect(cell.className).not.toContain('text-loss-text');
    expect(cell.textContent).toBe('3,126,553원');
  });

  it('returns null for empty or missing rows', () => {
    const { container } = render(<AdvisorNetWorthTable rows={[]} />);
    expect(container.firstChild).toBeNull();

    const { container: container2 } = render(<AdvisorNetWorthTable />);
    expect(container2.firstChild).toBeNull();
  });
});
