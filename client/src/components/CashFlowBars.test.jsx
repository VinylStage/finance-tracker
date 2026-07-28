import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import CashFlowBars from './CashFlowBars';

// 대분류색은 hue 2개 원칙의 유일한 예외 구역이다. 그 색이 이 컴포넌트 밖으로
// 새지 않는지, 그리고 색 없이도 의미가 읽히는지가 검증의 핵심이다.

const rows = [
  { major_type: '고정지출', total: 400000 },
  { major_type: '변동필수', total: 200000 },
  { major_type: '저축', total: 100000 },
];

const seg = (container) => [...container.querySelectorAll('div[role="img"] > div')];

describe('막대와 목록', () => {
  it('갈래마다 세그먼트가 하나씩 생긴다', () => {
    const { container } = render(<CashFlowBars rows={rows} income={1000000} />);
    // 지출 3 + 남은 돈 1
    expect(seg(container).length).toBe(4);
  });

  it('목록 순서가 막대 세그먼트 순서와 같다', () => {
    // 눈이 왼쪽에서 오른쪽으로 훑은 순서를 그대로 위에서 아래로 잇는다.
    const { container } = render(<CashFlowBars rows={rows} income={1000000} />);
    const barOrder = seg(container).map((d) => d.getAttribute('title').split(' · ')[0]);
    const listOrder = [...container.querySelectorAll('li')].map(
      (li) => li.querySelector('span').textContent.trim()
    );
    expect(barOrder).toEqual(listOrder);
    expect(barOrder).toEqual(['고정지출', '변동필수', '저축', '남은 돈']);
  });

  it('세그먼트 폭이 비율을 따른다', () => {
    const { container } = render(<CashFlowBars rows={rows} income={1000000} />);
    const widths = seg(container).map((d) => d.style.width);
    expect(widths).toEqual(['40%', '20%', '10%', '30%']);
  });

  it('금액과 비율을 함께 보여준다', () => {
    render(<CashFlowBars rows={rows} income={1000000} />);
    expect(screen.getByText('400,000원')).toBeTruthy();
    expect(screen.getAllByText('40%').length).toBeGreaterThan(0);
  });
});

describe('색 외 채널', () => {
  it('막대에 접근성 이름이 붙는다', () => {
    // 막대만으로는 스크린리더가 아무것도 읽지 못한다.
    render(<CashFlowBars rows={rows} income={1000000} />);
    const bar = screen.getByRole('img');
    expect(bar.getAttribute('aria-label')).toContain('고정지출 40%');
    expect(bar.getAttribute('aria-label')).toContain('남은 돈 30%');
  });

  it('세그먼트 title 에 이름·금액·비율이 들어간다', () => {
    const { container } = render(<CashFlowBars rows={rows} income={1000000} />);
    expect(seg(container)[0].getAttribute('title')).toBe('고정지출 · 400,000원 · 40%');
  });

  it('목록의 색점은 장식이라 스크린리더에서 숨는다', () => {
    const { container } = render(<CashFlowBars rows={rows} income={1000000} />);
    const dots = container.querySelectorAll('li span[aria-hidden="true"]');
    expect(dots.length).toBe(4);
  });
});

describe('대분류색이 밖으로 새지 않는다', () => {
  it('색은 인라인 style 로만 들어가고 클래스에는 없다', () => {
    // 토큰 클래스로 색을 주면 다른 화면 요소가 같은 클래스를 재사용하기 쉬워진다.
    // 이 차트 전용이라는 것을 형태로 강제한다.
    const { container } = render(<CashFlowBars rows={rows} income={1000000} />);
    for (const d of seg(container)) {
      expect(d.style.background).toBeTruthy();
      expect(d.className).not.toMatch(/bg-flow-/);
    }
  });

  it('모든 갈래가 flow 토큰을 참조한다', () => {
    const { container } = render(<CashFlowBars rows={rows} income={1000000} />);
    for (const d of seg(container)) {
      expect(d.getAttribute('style')).toMatch(/var\(--color-flow-/);
    }
  });
});

describe('지출이 수입을 넘긴 달', () => {
  it('남은 돈 대신 초과 금액을 말한다', () => {
    render(
      <CashFlowBars
        rows={[{ major_type: '고정지출', total: 800000 }, { major_type: '선택지출', total: 400000 }]}
        income={1000000}
      />
    );
    expect(screen.getByText(/200,000원 초과/)).toBeTruthy();
    expect(screen.queryByText(/남은 돈/)).toBeNull();
  });

  it('남은 돈 세그먼트를 그리지 않는다', () => {
    const { container } = render(
      <CashFlowBars rows={[{ major_type: '고정지출', total: 1200000 }]} income={1000000} />
    );
    const names = seg(container).map((d) => d.getAttribute('title').split(' · ')[0]);
    expect(names).not.toContain('남은 돈');
  });
});

describe('빈 상태', () => {
  it('그릴 것이 없으면 이유를 말한다', () => {
    render(<CashFlowBars rows={[]} income={0} />);
    expect(screen.getByText(/그릴 내역이 없습니다/)).toBeTruthy();
  });

  it('수입만 있고 지출이 없으면 남은 돈만 그린다', () => {
    const { container } = render(<CashFlowBars rows={[]} income={500000} />);
    const names = seg(container).map((d) => d.getAttribute('title').split(' · ')[0]);
    expect(names).toEqual(['남은 돈']);
  });
});
