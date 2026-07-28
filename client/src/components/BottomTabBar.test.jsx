import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import BottomTabBar from './BottomTabBar';
import { ICON_PATH } from './icons/paths';

// 탭바는 활성 상태를 색으로만 말하면 안 된다. 채움과 굵기가 함께 바뀌는지,
// 그리고 라벨 굵기 변화가 탭을 흔들지 않는지가 검증의 핵심이다.

function renderAt(path) {
  const { hook } = memoryLocation({ path });
  return render(
    <Router hook={hook}>
      <BottomTabBar />
    </Router>
  );
}

const tabs = () => within(screen.getByRole('navigation', { name: '주요 화면' }));

describe('탭 구성', () => {
  it('핵심 3개와 더보기만 상시 노출한다', () => {
    renderAt('/');
    const nav = tabs();
    expect(nav.getByRole('link', { name: /홈/ })).toBeTruthy();
    expect(nav.getByRole('link', { name: /거래/ })).toBeTruthy();
    expect(nav.getByRole('link', { name: /분석/ })).toBeTruthy();
    expect(nav.getByRole('button', { name: /더보기/ })).toBeTruthy();
    // 자산·부채와 설정은 더보기 안으로 내려갔다.
    expect(nav.queryByRole('link', { name: /자산/ })).toBeNull();
    expect(nav.queryByRole('link', { name: /설정/ })).toBeNull();
  });

  it('탭마다 아이콘이 그려진다', () => {
    const { container } = renderAt('/');
    const nav = container.querySelector('nav[aria-label="주요 화면"]');
    expect(nav.querySelectorAll('svg').length).toBe(4);
  });

  it('히트 타깃이 44px 하한을 지킨다', () => {
    const { container } = renderAt('/');
    const nav = container.querySelector('nav[aria-label="주요 화면"]');
    for (const item of nav.children) {
      expect(item.className, item.textContent).toContain('min-h-11');
    }
  });
});

describe('활성 표시', () => {
  it('현재 화면 탭에 aria-current 가 붙는다', () => {
    renderAt('/transactions');
    expect(tabs().getByRole('link', { name: /거래/ }).getAttribute('aria-current')).toBe('page');
    expect(tabs().getByRole('link', { name: /홈/ }).getAttribute('aria-current')).toBeNull();
  });

  it('활성 탭만 채운 아이콘을 쓴다', () => {
    // 색을 못 보는 사람도 어느 탭에 있는지 알 수 있어야 한다.
    const { container } = renderAt('/');
    const nav = container.querySelector('nav[aria-label="주요 화면"]');
    const paths = [...nav.querySelectorAll('svg path')].map((p) => p.getAttribute('d'));
    expect(paths[0]).toBe(ICON_PATH.space_dashboard_fill);
    expect(paths[1]).toBe(ICON_PATH.receipt_long);
    expect(paths[2]).toBe(ICON_PATH.analytics);
  });

  it('활성 탭 색만 액센트다', () => {
    const { container } = renderAt('/');
    const nav = container.querySelector('nav[aria-label="주요 화면"]');
    expect(nav.children[0].className).toContain('text-brand-text');
    expect(nav.children[1].className).toContain('text-caption');
  });

  it('별도 인디케이터 막대를 두지 않는다', () => {
    // 채움·굵기·색 세 채널이면 충분하다. 막대를 더하면 탭바 높이만 먹는다.
    const { container } = renderAt('/');
    const nav = container.querySelector('nav[aria-label="주요 화면"]');
    expect(nav.querySelectorAll('.bg-brand-fill').length).toBe(0);
  });
});

describe('라벨 흔들림 방지', () => {
  it('굵은 사본을 겹쳐 두 상태의 폭을 같게 만든다', () => {
    // font-weight 400 -> 600 이면 폭이 늘어 탭이 좌우로 흔들린다.
    const { container } = renderAt('/');
    const nav = container.querySelector('nav[aria-label="주요 화면"]');
    const first = nav.children[0];
    const ghost = first.querySelector('span.invisible');
    expect(ghost).toBeTruthy();
    expect(ghost.className).toContain('font-semibold');
    expect(ghost.getAttribute('aria-hidden')).toBe('true');
  });

  it('보이는 라벨은 활성일 때만 굵어진다', () => {
    const { container } = renderAt('/');
    const nav = container.querySelector('nav[aria-label="주요 화면"]');
    const visible = (el) => el.querySelector('span.absolute');
    expect(visible(nav.children[0]).className).toContain('font-semibold');
    expect(visible(nav.children[1]).className).not.toContain('font-semibold');
  });
});

describe('더보기 시트', () => {
  beforeEach(() => renderAt('/'));

  it('처음에는 닫혀 있다', () => {
    expect(tabs().getByRole('button', { name: /더보기/ }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('link', { name: /가이드/ })).toBeNull();
  });

  it('열면 나머지 그룹과 가이드가 나온다', () => {
    fireEvent.click(tabs().getByRole('button', { name: /더보기/ }));
    expect(screen.getByRole('link', { name: /자산·부채/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /설정/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /가이드/ })).toBeTruthy();
  });

  it('시트 항목에도 아이콘이 붙는다', () => {
    fireEvent.click(tabs().getByRole('button', { name: /더보기/ }));
    const sheetLink = screen.getByRole('link', { name: /가이드/ });
    expect(sheetLink.querySelector('svg')).toBeTruthy();
  });
});

describe('더보기 안 화면에 있을 때', () => {
  it('더보기 탭이 활성으로 보인다', () => {
    // 설정 화면에 있는데 어느 탭도 활성이 아니면 지금 위치를 알 수 없다.
    const { container } = renderAt('/settings');
    const nav = container.querySelector('nav[aria-label="주요 화면"]');
    const more = nav.children[3];
    expect(more.className).toContain('text-brand-text');
    expect(more.querySelector('svg path').getAttribute('d')).toBe(ICON_PATH.more_horiz_fill);
  });
});
