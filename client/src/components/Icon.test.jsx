import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Icon from './Icon';
import { ICON_PATH, ICON_VIEWBOX } from './icons/paths';

// 아이콘은 카테고리 구분을 혼자 짊어진다(색을 쓰지 않기로 했으므로). 그래서
// "안 그려지는" 실패가 조용히 지나가면 안 된다. 여기서 막는다.

function svgOf(container) {
  return container.querySelector('svg');
}

describe('Icon 렌더', () => {
  it('svg 를 그리고 좌표계는 데이터가 정한 것을 쓴다', () => {
    const { container } = render(<Icon name="home" />);
    const svg = svgOf(container);
    expect(svg).toBeTruthy();
    // 좌표계를 하드코딩하면 데이터가 바뀔 때 아이콘이 화면 밖으로 나간다.
    expect(svg.getAttribute('viewBox')).toBe(ICON_VIEWBOX);
  });

  it('path 는 데이터의 좌표를 그대로 쓴다', () => {
    const { container } = render(<Icon name="payments" />);
    expect(svgOf(container).querySelector('path').getAttribute('d')).toBe(ICON_PATH.payments);
  });

  it('색은 부모의 글자색을 상속한다', () => {
    // currentColor 라야 토큰 색이 그대로 내려온다. 고정 hex 면 다크에서 안 바뀐다.
    const { container } = render(<Icon name="home" />);
    expect(svgOf(container).getAttribute('fill')).toBe('currentColor');
  });

  it('스크린리더에서 숨고 탭 순서에 끼지 않는다', () => {
    // 아이콘 옆에는 항상 텍스트 이름이 함께 나온다. 아이콘을 따로 읽으면 잡음이다.
    const { container } = render(<Icon name="home" />);
    const svg = svgOf(container);
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
  });

  it('size 가 가로세로에 함께 적용되고 기본값이 있다', () => {
    const { container: a } = render(<Icon name="home" />);
    expect(svgOf(a).getAttribute('width')).toBe('20');
    expect(svgOf(a).getAttribute('height')).toBe('20');

    const { container: b } = render(<Icon name="home" size={44} />);
    expect(svgOf(b).getAttribute('width')).toBe('44');
    expect(svgOf(b).getAttribute('height')).toBe('44');
  });

  it('className 이 전달된다', () => {
    const { container } = render(<Icon name="home" className="text-caption" />);
    expect(svgOf(container).getAttribute('class')).toContain('text-caption');
  });
});

describe('채움 변형', () => {
  it('채움 변형이 있으면 그 좌표를 쓴다', () => {
    const { container } = render(<Icon name="space_dashboard" filled />);
    expect(svgOf(container).querySelector('path').getAttribute('d'))
      .toBe(ICON_PATH.space_dashboard_fill);
  });

  it('채움 변형이 없으면 조용히 기본형으로 돌아간다', () => {
    // payments 에는 _fill 이 없다. 여기서 터지면 화면 하나가 통째로 죽는다.
    const { container } = render(<Icon name="payments" filled />);
    expect(svgOf(container).querySelector('path').getAttribute('d')).toBe(ICON_PATH.payments);
  });

  it('filled 없이 부르면 기본형이다', () => {
    const { container } = render(<Icon name="space_dashboard" />);
    expect(svgOf(container).querySelector('path').getAttribute('d'))
      .toBe(ICON_PATH.space_dashboard);
  });
});

describe('모르는 이름', () => {
  it('예외를 던지지 않고 아무것도 그리지 않는다', () => {
    // 아이콘 하나 때문에 화면 전체가 죽으면 안 된다.
    for (const name of ['없는아이콘', '', undefined, null]) {
      const { container } = render(<Icon name={name} />);
      expect(svgOf(container)).toBeNull();
    }
  });

  it('모르는 이름에 filled 를 줘도 마찬가지다', () => {
    const { container } = render(<Icon name="없는아이콘" filled />);
    expect(svgOf(container)).toBeNull();
  });
});

describe('데이터 무결성', () => {
  it('모든 아이콘이 같은 좌표계를 쓴다', () => {
    // 좌표계가 섞이면 획 두께가 어긋나 한 화면에서 아이콘이 따로 논다.
    expect(ICON_VIEWBOX).toBe('0 -960 960 960');
  });

  it('빈 path 가 없다', () => {
    const empty = Object.entries(ICON_PATH).filter(([, d]) => !d || !d.trim());
    expect(empty).toEqual([]);
  });

  it('모든 아이콘이 실제로 그려진다', () => {
    for (const name of Object.keys(ICON_PATH)) {
      const { container } = render(<Icon name={name} />);
      expect(svgOf(container), `${name} 이 그려지지 않았다`).toBeTruthy();
    }
  });
});
