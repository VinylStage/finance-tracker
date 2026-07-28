import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CategorySpendSection from './CategorySpendSection';

describe('CategorySpendSection', () => {
  it('A. 빈 입력 테스트', () => {
    render(<CategorySpendSection rows={[]} />);
    
    const emptyText = screen.getByText('이번 달 지출 내역이 없습니다.');
    expect(emptyText).toBeTruthy();
    
    // 금액이나 퍼센트가 없어야 함
    const amountElements = screen.queryAllByText(/원/);
    expect(amountElements.length).toBe(0);
    
    const percentElements = screen.queryAllByText(/^\d+%$/);
    expect(percentElements.length).toBe(0);
  });

  it('B. 금액 포맷과 점유율 테스트', () => {
    const rows = [
      { category: '식비', total: 500000 },
      { category: '교통', total: 300000 },
      { category: '통신', total: 200000 },
    ];
    
    render(<CategorySpendSection rows={rows} />);
    
    // 카테고리 이름 확인
    expect(screen.getByText('식비')).toBeTruthy();
    expect(screen.getByText('교통')).toBeTruthy();
    expect(screen.getByText('통신')).toBeTruthy();
    
    // 금액 포맷 확인 (천 단위 구분 + '원')
    expect(screen.getByText('500,000원')).toBeTruthy();
    expect(screen.getByText('300,000원')).toBeTruthy();
    expect(screen.getByText('200,000원')).toBeTruthy();
    
    // 점유율 확인 (총합 1000000)
    expect(screen.getByText('50%')).toBeTruthy(); // 500000/1000000 = 0.5
    expect(screen.getByText('30%')).toBeTruthy(); // 300000/1000000 = 0.3
    expect(screen.getByText('20%')).toBeTruthy(); // 200000/1000000 = 0.2
  });

  it('C. 점유율 합이 100% 근처다', () => {
    const rows = [
      { category: 'A', total: 100 },
      { category: 'B', total: 200 },
      { category: 'C', total: 300 },
      { category: 'D', total: 400 },
      { category: 'E', total: 500 },
      { category: 'F', total: 600 },
      { category: 'G', total: 700 },
    ];
    
    render(<CategorySpendSection rows={rows} />);
    
    // 모든 퍼센트 값을 가져옴
    const percentElements = screen.getAllByText(/^\d+%$/);
    const pcts = percentElements.map(el => Number(el.textContent.replace('%', '')));
    const sum = pcts.reduce((a, b) => a + b, 0);
    
    expect(sum).toBeGreaterThanOrEqual(99);
    expect(sum).toBeLessThanOrEqual(101);
  });

  it('D. 캡핑되면 기타로 묶인다', () => {
    // 캡핑 한도는 5개이므로 6개 이상이면 '기타'가 생김
    const rows = [
      { category: 'A', total: 100 },
      { category: 'B', total: 200 },
      { category: 'C', total: 300 },
      { category: 'D', total: 400 },
      { category: 'E', total: 500 },
      { category: 'F', total: 600 },
    ];
    
    render(<CategorySpendSection rows={rows} />);
    
    // 컴포넌트는 라벨과 개수를 한 덩어리로 렌더한다: `기타 (N개)`.
    // 개수는 캡핑 한도에 따라 달라지므로 하드코딩하지 않는다.
    const others = screen.getByText(/기타 \(\d+개\)/);
    expect(others).toBeTruthy();

    // 묶인 카테고리 이름은 쉼표로 이어진 한 덩어리로 나열된다.
    const names = screen.getAllByText(/F/).map((el) => el.textContent).join(' ');
    expect(names).toContain('F');
  });

  it('E. 뷰 전환 버튼 테스트', async () => {
    const user = userEvent.setup();
    const rows = [
      { category: 'A', total: 100 },
      { category: 'B', total: 200 },
    ];
    
    render(<CategorySpendSection rows={rows} />);
    
    // 랭킹과 파이 버튼 확인
    const rankButton = screen.getByRole('button', { name: '랭킹' });
    const pieButton = screen.getByRole('button', { name: '파이' });
    
    expect(rankButton).toBeTruthy();
    expect(pieButton).toBeTruthy();
    
    // 처음에는 랭킹 뷰 (aria-pressed=true)
    expect(rankButton.getAttribute('aria-pressed')).toBe('true');
    expect(pieButton.getAttribute('aria-pressed')).toBe('false');
    
    // 파이 버튼 클릭
    await user.click(pieButton);
    
    // aria-pressed 전환 확인
    expect(rankButton.getAttribute('aria-pressed')).toBe('false');
    expect(pieButton.getAttribute('aria-pressed')).toBe('true');
  });
});
