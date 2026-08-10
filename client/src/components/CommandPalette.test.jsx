import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CommandPalette from './CommandPalette';

// #281 — 메뉴·화면 검색 팔레트.
//
// 검색 로직은 lib/commandSearch 에 테스트가 있다. 여기서 잠그는 것은 **조작**이다.
//   - 키보드로만 끝까지 갈 수 있는가 (위아래·엔터·ESC)
//   - 결과 없음을 말하는가
//   - 고르면 그 경로로 이동하는가

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock('wouter', () => ({
  useLocation: () => ['/', navigate],
}));

vi.mock('./Icon', () => ({
  default: ({ name }) => <span data-icon={name} />,
}));

beforeEach(() => { navigate.mockReset(); });

const open = (props = {}) =>
  render(<CommandPalette open onClose={vi.fn()} {...props} />);

describe('열림 상태', () => {
  it('닫혀 있으면 아무것도 그리지 않는다', () => {
    const { container } = render(<CommandPalette open={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('열리면 입력이 포커스를 받는다', async () => {
    // 열자마자 칠 수 있어야 한다. 한 번 더 눌러야 하면 단축키의 의미가 없다.
    open();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('화면 검색')));
  });

  it('처음에는 전체 목록을 보여준다', () => {
    open();
    expect(screen.getByText('홈')).toBeTruthy();
    expect(screen.getByText('할부')).toBeTruthy();
  });
});

describe('검색', () => {
  it('치면 걸러진다', async () => {
    const user = userEvent.setup();
    open();
    await user.type(screen.getByLabelText('화면 검색'), '할부');
    expect(screen.getByText('할부')).toBeTruthy();
    expect(screen.queryByText('설정')).toBeNull();
  });

  it('초성으로도 걸러진다', async () => {
    const user = userEvent.setup();
    open();
    await user.type(screen.getByLabelText('화면 검색'), 'ㅂㅊ');
    expect(screen.getByText('부채')).toBeTruthy();
  });

  it('하위 화면은 속한 그룹을 함께 보여준다', async () => {
    // '할부' 만 보여주면 어디에 있는 화면인지 알 수 없다.
    const user = userEvent.setup();
    open();
    await user.type(screen.getByLabelText('화면 검색'), '할부');
    expect(screen.getByText('자산·부채')).toBeTruthy();
  });

  it('맞는 것이 없으면 그렇게 말한다', async () => {
    const user = userEvent.setup();
    open();
    await user.type(screen.getByLabelText('화면 검색'), '없는화면이름');
    expect(screen.getByText(/찾는 화면이 없어요/)).toBeTruthy();
  });
});

describe('키보드 조작', () => {
  it('엔터로 첫 결과에 간다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    open({ onClose });
    await user.type(screen.getByLabelText('화면 검색'), '할부');
    await user.keyboard('{Enter}');
    expect(navigate).toHaveBeenCalledWith('/assets/installments');
    expect(onClose).toHaveBeenCalled();
  });

  it('아래 화살표로 다음 항목을 고른다', async () => {
    const user = userEvent.setup();
    open();
    await user.keyboard('{ArrowDown}');
    const opts = screen.getAllByRole('option');
    expect(opts[1].getAttribute('aria-selected')).toBe('true');
    expect(opts[0].getAttribute('aria-selected')).toBe('false');
  });

  it('위 화살표는 끝에서 감싼다', async () => {
    const user = userEvent.setup();
    open();
    await user.keyboard('{ArrowUp}');
    const opts = screen.getAllByRole('option');
    expect(opts[opts.length - 1].getAttribute('aria-selected')).toBe('true');
  });

  it('ESC 로 닫는다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    open({ onClose });
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('결과가 없을 때 엔터를 눌러도 이동하지 않는다', async () => {
    const user = userEvent.setup();
    open();
    await user.type(screen.getByLabelText('화면 검색'), '없는화면이름');
    await user.keyboard('{Enter}');
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('마우스·터치 조작 (모바일 진입 경로)', () => {
  it('눌러서 이동한다 — 키보드 없이도 끝까지 간다', async () => {
    // 모바일에는 Cmd+K 도 화살표도 없다. 탭만으로 완결돼야 한다.
    const user = userEvent.setup();
    const onClose = vi.fn();
    open({ onClose });
    await user.click(screen.getByText('할부'));
    expect(navigate).toHaveBeenCalledWith('/assets/installments');
    expect(onClose).toHaveBeenCalled();
  });

  it('바깥을 누르면 닫힌다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(<CommandPalette open onClose={onClose} />);
    await user.click(container.firstChild);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('접근성', () => {
  it('대화상자로 표시된다', () => {
    open();
    const dlg = screen.getByRole('dialog');
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    expect(dlg.getAttribute('aria-label')).toBe('메뉴 검색');
  });

  it('결과가 listbox/option 으로 노출된다', () => {
    open();
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
  });
});
