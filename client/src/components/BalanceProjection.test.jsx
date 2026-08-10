import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import BalanceProjection from './BalanceProjection';

const PROJECTION = {
  asOf: '2026-08-04',
  start: 1000000,
  months: [
    { month: '2026-09', change: 0,       balance: 1000000 },
    { month: '2026-10', change: -700000, balance: 300000  },
    { month: '2026-11', change: -600000, balance: -300000 }
  ],
  negativeFrom: '2026-11',
  includes: ['scheduled', 'card-unpaid']
};

describe('BalanceProjection', () => {
  it('renders projection with all data', () => {
    render(<BalanceProjection projection={PROJECTION} />);
    
    // 제목 확인
    expect(screen.getByText('앞으로의 잔액')).toBeTruthy();
    
    // 월 라벨 확인
    expect(screen.getByText('9월')).toBeTruthy();
    expect(screen.getByText('10월')).toBeTruthy();
    expect(screen.getByText('11월')).toBeTruthy();
    
    // 변동액 및 잔액 확인
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText('-700,000원')).toBeTruthy();
    expect(screen.getByText('-600,000원')).toBeTruthy();
    expect(screen.getByText('1,000,000원')).toBeTruthy();
    expect(screen.getByText('300,000원')).toBeTruthy();
    expect(screen.getByText('-300,000원')).toBeTruthy();
    
    // 마이너스 전환 문구 확인
    expect(screen.getByText('11월에 잔액이 -300,000원이 돼요.')).toBeTruthy();
    
    // 반영 범위 문구 확인
    expect(screen.getByText('예정된 인출과 카드값만 반영했어요. 앞으로의 지출은 포함되지 않았어요.')).toBeTruthy();
  });

  it('shows empty message when projection is null', () => {
    render(<BalanceProjection projection={null} />);
    
    expect(screen.getByText('앞으로 예정된 내역이 없어요.')).toBeTruthy();
  });

  it('shows empty message when months array is empty', () => {
    const emptyProjection = { ...PROJECTION, months: [] };
    render(<BalanceProjection projection={emptyProjection} />);
    
    expect(screen.getByText('앞으로 예정된 내역이 없어요.')).toBeTruthy();
  });

  it('does not show negative turn message when negativeFrom is null', () => {
    const noNegativeProjection = { ...PROJECTION, negativeFrom: null };
    render(<BalanceProjection projection={noNegativeProjection} />);
    
    expect(screen.queryByText('11월에 잔액이 -300,000원이 돼요.')).toBeFalsy();
  });

  it('renders correctly with different includes', () => {
    const differentIncludes = { ...PROJECTION, includes: ['scheduled'] };
    render(<BalanceProjection projection={differentIncludes} />);
    
    expect(screen.getByText('예정된 인출만 반영했어요. 앞으로의 지출은 포함되지 않았어요.')).toBeTruthy();
  });
});
