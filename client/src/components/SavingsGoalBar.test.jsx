import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SavingsGoalBar from './SavingsGoalBar';

describe('SavingsGoalBar', () => {
  it('shows notice when maturity date is missing', () => {
    const product = {
      name: '적금',
      monthly_contribution: 100000,
      start_date: '2026-01-01'
    };
    
    render(<SavingsGoalBar product={product} today="2026-01-01" />);
    
    expect(screen.getByText('만기일을 입력하면 목표 진행이 표시됩니다')).toBeTruthy();
    expect(screen.queryByText(/남음/)).toBeNull();
  });

  it('renders amount with comma separator and 원', () => {
    const product = {
      monthly_contribution: 100000,
      start_date: '2025-01-15',
      maturity_date: '2026-01-15'
    };
    
    render(<SavingsGoalBar product={product} today="2025-01-15" />);
    
    // [\d,]+ 는 쉼표가 없어도 매치해서 toString() 뮤테이션을 통과시켰다.
    // 세 자리마다 끊기는 형태를 강제한다: 1,000 / 12,345 / 1,234,567
    const text = screen.getByText(/남음/).textContent;
    expect(text).toMatch(/\d{1,3}(,\d{3})+원 남음/);
    // 쉼표 없는 네 자리 이상 숫자가 남아 있으면 포맷이 빠진 것이다.
    expect(text).not.toMatch(/(^|[^\d,])\d{4,}원/);
  });

  it('renders payment count in n/m회 format', () => {
    const product = {
      monthly_contribution: 100000,
      start_date: '2025-01-15',
      maturity_date: '2026-01-15'
    };
    
    render(<SavingsGoalBar product={product} today="2025-01-15" />);
    
    expect(screen.getByText(/\d+\/\d+회/).textContent).toMatch(/\d+\/\d+회/);
  });

  it('shows "목표 달성" when remaining amount is zero', () => {
    const product = {
      monthly_contribution: 100000,
      start_date: '2025-01-15',
      maturity_date: '2026-01-15',
      status: '진행중'
    };
    
    render(<SavingsGoalBar product={product} today="2026-01-15" />);
    
    expect(screen.getByText('목표 달성')).toBeTruthy();
    expect(screen.queryByText(/남음/)).toBeNull();
    expect(screen.queryByText(/돌파/)).toBeNull();
  });

  it('keeps progress percentage within 0-100 range', () => {
    const product = {
      monthly_contribution: 100000,
      start_date: '2025-01-15',
      maturity_date: '2026-01-15',
      status: '진행중'
    };
    
    render(<SavingsGoalBar product={product} today="2027-01-15" />);
    
    const pctText = screen.getByText(/^\d+%$/).textContent;
    const pct = Number(pctText.replace('%', ''));
    
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThanOrEqual(100);
  });
});
