import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import CashFlowSankey from './CashFlowSankey';

// #241 — 자금흐름 Sankey.
//
// 집계는 cashFlow.js 가 하고 그쪽에 테스트가 있다. 여기서 잠그는 것은 **그리는
// 규칙**이다.
//
//   1. 비율을 왜곡하지 않는가 (작은 갈래에 최소 높이를 주지 않는가)
//   2. 색이 밴드·노드 밖으로 새지 않는가 — 이 차트는 hue 2개 원칙의 예외 구역이고,
//      그 예외는 차트 안에서만 성립한다
//   3. 빈 상태를 화면이 말하는가

const ROWS = [
  { major_type: '고정지출', total: 500000 },
  { major_type: '선택지출', total: 300000 },
  { major_type: '저축', total: 200000 },
];
const INCOME = 1200000;

const svgOf = (c) => c.querySelector('svg');

describe('빈 상태', () => {
  it('그릴 것이 없으면 문구로 알린다', () => {
    render(<CashFlowSankey rows={[]} income={0} />);
    expect(screen.getByText(/그릴 내역이 없습니다/)).toBeTruthy();
  });

  it('수입만 있고 지출이 없어도 남은 돈은 그린다', () => {
    const { container } = render(<CashFlowSankey rows={[]} income={1000000} />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(screen.getByText('남은 돈')).toBeTruthy();
  });
});

describe('노드와 밴드', () => {
  it('갈래마다 노드와 밴드가 하나씩 생긴다', () => {
    // 고정지출 / 선택지출 / 저축 / 남은 돈 = 4
    const { container } = render(<CashFlowSankey rows={ROWS} income={INCOME} />);
    const svg = svgOf(container);
    // 왼쪽 수입 노드 1 + 오른쪽 노드 4
    expect(svg.querySelectorAll('rect').length).toBe(5);
    expect(svg.querySelectorAll('path').length).toBe(4);
  });

  it('노드 높이가 비율에 비례한다 — 작은 갈래에 최소 높이를 주지 않는다', () => {
    // 최소 높이를 주면 작은 갈래가 실제보다 커 보인다. 차트가 조금이라도
    // 거짓말하면 "어디로 갔나" 라는 이 화면의 목적이 무너진다.
    const rows = [
      { major_type: '고정지출', total: 990000 },
      { major_type: '저축', total: 10000 },
    ];
    const { container } = render(<CashFlowSankey rows={rows} income={1000000} height={260} />);
    const rects = [...svgOf(container).querySelectorAll('rect')].slice(1); // 수입 노드 제외
    const heights = rects.map((r) => Number(r.getAttribute('height')));
    const ratio = heights[0] / heights[1];
    expect(ratio).toBeGreaterThan(90);   // 99:1 이므로 최소높이가 없으면 90 이상
  });

  it('금액과 비율을 적는다', () => {
    render(<CashFlowSankey rows={ROWS} income={INCOME} />);
    expect(screen.getByText(/500,000원 · 42%/)).toBeTruthy();
    expect(screen.getByText('고정지출')).toBeTruthy();
  });

  it('초과 지출이면 그 사실을 적는다', () => {
    const rows = [{ major_type: '고정지출', total: 1500000 }];
    render(<CashFlowSankey rows={rows} income={1000000} />);
    expect(screen.getByText(/500,000원 초과/)).toBeTruthy();
  });
});

describe('색 제약 (#241 — hue 2개 원칙의 예외 구역)', () => {
  it('밴드와 노드에만 흐름색을 쓴다', () => {
    const { container } = render(<CashFlowSankey rows={ROWS} income={INCOME} />);
    const svg = svgOf(container);
    const colored = [...svg.querySelectorAll('[fill]')];
    for (const el of colored) {
      const fill = el.getAttribute('fill');
      if (!fill || !fill.includes('--color-flow')) continue;
      expect(['rect', 'path']).toContain(el.tagName.toLowerCase());
    }
  });

  it('라벨 텍스트에는 흐름색을 쓰지 않는다', () => {
    // 라벨에 색을 쓰면 카테고리 색을 되살리는 것과 같다.
    const { container } = render(<CashFlowSankey rows={ROWS} income={INCOME} />);
    for (const t of svgOf(container).querySelectorAll('text')) {
      expect(t.getAttribute('fill')).toBeNull();
      expect(String(t.getAttribute('class') || '')).not.toMatch(/flow/);
    }
  });

  it('밴드는 opacity 토큰으로 채운다', () => {
    // solid 로 채우면 인접 밴드가 서로를 가린다.
    const { container } = render(<CashFlowSankey rows={ROWS} income={INCOME} />);
    const bandGroup = svgOf(container).querySelector('g');
    expect(bandGroup.style.opacity).toBe('var(--flow-band-opacity)');
  });

  it('수입 노드는 무채색이다 — 출발점이지 갈래가 아니다', () => {
    const { container } = render(<CashFlowSankey rows={ROWS} income={INCOME} />);
    const first = svgOf(container).querySelector('rect');
    expect(first.getAttribute('fill')).toContain('--color-flow-source');
  });
});

describe('접근성', () => {
  it('차트 내용을 읽을 수 있는 설명이 붙는다', () => {
    render(<CashFlowSankey rows={ROWS} income={INCOME} />);
    const img = screen.getByRole('img');
    expect(img.getAttribute('aria-label')).toMatch(/자금 흐름/);
    expect(img.getAttribute('aria-label')).toMatch(/고정지출 42퍼센트/);
  });
});
