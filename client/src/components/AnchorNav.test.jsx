import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AnchorNav from './AnchorNav';

const items = [
  { id: 'a', label: '기본 설정' },
  { id: 'b', label: '카테고리 관리' },
  { id: 'c', label: '위험 구역' },
];

// 관찰 콜백을 테스트가 직접 발화시킬 수 있게 잡아둔다. jsdom 에는 실제 스크롤이
// 없어서, 활성 표시 로직을 검증하려면 관찰 결과를 흉내 내는 수밖에 없다.
let fire;

beforeEach(() => {
  document.body.innerHTML = items.map((i) => `<div id="${i.id}"></div>`).join('');
  // rAF 를 즉시 실행으로 바꿔 스크롤 반영을 동기로 확인한다.
  vi.stubGlobal('requestAnimationFrame', (cb) => { cb(); return 0; });
  fire = null;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb) {
        fire = cb;
      }
      observe() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

const linkOf = (label) => screen.getByRole('link', { name: label });
const barOf = (label) => linkOf(label).querySelector('span[aria-hidden="true"]');

describe('목차 렌더', () => {
  it('항목을 순서대로 그린다', () => {
    render(<AnchorNav items={items} />);
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.textContent.trim())).toEqual([
      '기본 설정',
      '카테고리 관리',
      '위험 구역',
    ]);
  });

  it('href 가 섹션 id 를 가리킨다', () => {
    render(<AnchorNav items={items} />);
    expect(linkOf('카테고리 관리').getAttribute('href')).toBe('#b');
  });

  it('접근성 이름이 붙은 nav 다', () => {
    render(<AnchorNav items={items} />);
    expect(screen.getByRole('navigation', { name: '설정 목차' })).toBeTruthy();
  });
});

describe('활성 표시', () => {
  // 활성 판정은 관찰 결과가 아니라 실제 위치로 한다. 기준선(상단 100px)을 지난
  // 마지막 섹션이 지금 보고 있는 것이다.
  const place = (tops) => {
    for (const [id, top] of Object.entries(tops)) {
      document.getElementById(id).getBoundingClientRect = () => ({ top });
    }
  };

  it('처음에는 첫 항목이 활성이다', () => {
    place({ a: 0, b: 500, c: 900 });
    render(<AnchorNav items={items} />);
    expect(linkOf('기본 설정').getAttribute('aria-current')).toBe('true');
    expect(linkOf('카테고리 관리').getAttribute('aria-current')).toBeNull();
  });

  it('기준선을 지난 마지막 섹션이 활성이 된다', () => {
    place({ a: -300, b: 50, c: 800 });
    render(<AnchorNav items={items} />);
    act(() => { fire([]); });
    expect(linkOf('카테고리 관리').getAttribute('aria-current')).toBe('true');
  });

  it('키 큰 섹션을 지나쳐도 활성이 붙박이지 않는다', () => {
    // 카테고리 목록처럼 화면 몇 개 분량인 섹션은 한참 지나쳐도 교차 상태로 남는다.
    // 교차한 것 중 top 이 가장 작은 것을 고르면 그 섹션에 활성이 붙박인다.
    place({ a: -9000, b: -8000, c: 40 });
    render(<AnchorNav items={items} />);
    act(() => { fire([]); });
    expect(linkOf('위험 구역').getAttribute('aria-current')).toBe('true');
  });

  it('아직 아무 섹션도 기준선을 안 지났으면 첫 항목을 유지한다', () => {
    place({ a: 400, b: 900, c: 1400 });
    render(<AnchorNav items={items} />);
    act(() => { fire([]); });
    expect(linkOf('기본 설정').getAttribute('aria-current')).toBe('true');
  });

  it('스크롤만으로도 따라온다', () => {
    // 관찰은 경계를 넘을 때만 발화한다. 한 섹션 안에서 길게 스크롤하는 동안에도
    // 활성이 갱신되어야 한다.
    place({ a: -300, b: 50, c: 800 });
    render(<AnchorNav items={items} />);
    place({ a: -900, b: -400, c: 60 });
    act(() => { window.dispatchEvent(new Event('scroll')); });
    expect(linkOf('위험 구역').getAttribute('aria-current')).toBe('true');
  });
});

describe('인디케이터', () => {
  // jsdom 의 기본 getBoundingClientRect 는 전부 top 0 이라 모든 섹션이 기준선을
  // 지난 것으로 잡힌다. 첫 항목을 활성으로 만들려면 위치를 심어야 한다.
  const placeAtTop = () => {
    document.getElementById('a').getBoundingClientRect = () => ({ top: 0 });
    document.getElementById('b').getBoundingClientRect = () => ({ top: 600 });
    document.getElementById('c').getBoundingClientRect = () => ({ top: 1200 });
  };

  it('활성 항목만 인디케이터가 보인다', () => {
    placeAtTop();
    render(<AnchorNav items={items} />);
    expect(barOf('기본 설정').className).toContain('opacity-100');
    expect(barOf('카테고리 관리').className).toContain('opacity-0');
  });

  it('인디케이터는 opacity 만 바꾼다', () => {
    // 이동 애니메이션을 넣으면 스크롤 중에 목차가 계속 움직여 읽던 위치를 잃는다.
    placeAtTop();
    render(<AnchorNav items={items} />);
    const cls = barOf('기본 설정').className;
    expect(cls).toContain('transition-opacity');
    expect(cls).not.toMatch(/translate|transition-transform|transition-all/);
  });
});

describe('클릭 이동', () => {
  it('기본 앵커 점프를 막고 부드럽게 스크롤한다', () => {
    const spy = vi.fn();
    document.getElementById('c').scrollIntoView = spy;
    render(<AnchorNav items={items} />);

    const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
    linkOf('위험 구역').dispatchEvent(evt);

    expect(evt.defaultPrevented).toBe(true);
    expect(spy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('클릭 즉시 활성이 옮겨간다', () => {
    // 스크롤이 끝날 때까지 이전 항목을 가리키면 클릭이 먹지 않은 것처럼 보인다.
    document.getElementById('c').scrollIntoView = vi.fn();
    render(<AnchorNav items={items} />);
    fireEvent.click(linkOf('위험 구역'));
    expect(linkOf('위험 구역').getAttribute('aria-current')).toBe('true');
    expect(linkOf('기본 설정').getAttribute('aria-current')).toBeNull();
  });

  it('없는 섹션을 눌러도 터지지 않는다', () => {
    render(<AnchorNav items={[{ id: 'nope', label: '없는 섹션' }]} />);
    expect(() => fireEvent.click(linkOf('없는 섹션'))).not.toThrow();
  });
});
