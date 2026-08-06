import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Modal from './Modal';

// 모달의 잠금 동작(#196). 커버리지가 2.7% 였다 — 렌더만 되고 동작은 한 번도
// 안 돌아 봤다.
//
// 여기서 잠그는 것은 두 가지다.
//
//  1. **`busy` 가 닫기 경로를 전부 막는가.** 저장 중에 모달이 닫히면 사용자는
//     저장이 됐는지 알 수 없고, 실패했을 때 입력을 되찾을 방법도 없다.
//     경로가 셋(Escape · 배경 클릭 · 닫기 버튼)이라 하나만 빠뜨려도 구멍이 난다.
//  2. **Tab 이 모달 밖으로 새지 않는가.** 새면 키보드 사용자가 보이지 않는
//     배경 요소를 조작하게 된다.

// jsdom 은 `offsetParent` 를 구현하지 않아 항상 null 이다. Modal 이 "화면에
// 보이는 요소만" 고르는 데 이 값을 쓰므로, 그대로 두면 후보가 0~1개로 줄어
// 포커스 트랩을 검사할 수 없다. 레이아웃이 없는 환경에서 "다 보인다" 로 둔다.
let originalOffsetParent;
beforeAll(() => {
  originalOffsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() { return this.parentNode; },
  });
});
afterAll(() => {
  if (originalOffsetParent) Object.defineProperty(HTMLElement.prototype, 'offsetParent', originalOffsetParent);
  else delete HTMLElement.prototype.offsetParent;
});

function open(props = {}) {
  const onClose = vi.fn();
  const utils = render(
    <Modal title="거래 추가" onClose={onClose} {...props}>
      <input aria-label="금액" />
      <button type="button">저장</button>
    </Modal>
  );
  return { onClose, panel: screen.getByRole('dialog'), ...utils };
}

describe('busy 가 아닐 때 — 닫는 길 세 개가 다 열려 있다', () => {
  it('Escape 로 닫는다', () => {
    const { onClose, panel } = open();

    fireEvent.keyDown(panel, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('배경을 누르면 닫는다', () => {
    const { onClose, panel } = open();

    fireEvent.mouseDown(panel.parentElement);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('닫기 버튼으로 닫는다', () => {
    const { onClose } = open();

    fireEvent.click(screen.getByLabelText('닫기'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('패널 안에서 누른 건 닫지 않는다 — 드래그가 배경에서 끝나도 마찬가지', () => {
    // 입력값을 드래그로 선택하다 손을 배경에서 떼는 건 흔한 동작이다.
    // 여기서 닫히면 쓰던 내용이 사라진다.
    const { onClose, panel } = open();

    fireEvent.mouseDown(panel);

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('busy 일 때 — 세 경로가 모두 막힌다', () => {
  it('Escape 를 무시한다', () => {
    const { onClose, panel } = open({ busy: true });

    fireEvent.keyDown(panel, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('배경 클릭을 무시한다', () => {
    const { onClose, panel } = open({ busy: true });

    fireEvent.mouseDown(panel.parentElement);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('닫기 버튼이 잠긴다', () => {
    open({ busy: true });

    expect(screen.getByLabelText('닫기').disabled).toBe(true);
  });

  it('보조기술에도 진행 중이라고 알린다', () => {
    const { panel } = open({ busy: true });

    // 버튼만 잠그면 화면을 못 보는 사용자는 왜 안 눌리는지 알 수 없다.
    expect(panel.getAttribute('aria-busy')).toBe('true');
  });
});

describe('포커스 트랩', () => {
  it('열면 포커스가 모달 안으로 들어온다', () => {
    const { panel } = open();

    // 배경에 포커스가 남아 있으면 키보드 사용자는 모달이 열린 줄 모르고
    // 뒤 화면을 계속 조작한다.
    expect(panel.contains(document.activeElement)).toBe(true);
    // DOM 순서상 첫 포커스 대상은 헤더의 닫기 버튼이다(헤더가 본문보다 앞).
    expect(document.activeElement).toBe(screen.getByLabelText('닫기'));
  });

  it('마지막에서 Tab 하면 처음으로 돌아온다 — 밖으로 안 샌다', () => {
    const { panel } = open();
    const save = screen.getByRole('button', { name: '저장' });
    save.focus();

    fireEvent.keyDown(panel, { key: 'Tab' });

    // 저장 → 닫기 → (순환) 금액. 여기서 순환이 없으면 브라우저 주소창으로 나간다.
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  it('처음에서 Shift+Tab 하면 마지막으로 간다', () => {
    const { panel } = open();
    const amount = screen.getByLabelText('금액');
    amount.focus();

    fireEvent.keyDown(panel, { key: 'Shift', shiftKey: true });
    fireEvent.keyDown(panel, { key: 'Tab', shiftKey: true });

    expect(panel.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(amount);
  });

  it('Tab·Escape 가 아닌 키는 가로채지 않는다', () => {
    const { onClose, panel } = open();
    const amount = screen.getByLabelText('금액');
    amount.focus();

    fireEvent.keyDown(panel, { key: 'a' });

    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(amount);
  });
});

describe('열고 닫을 때 문서 상태', () => {
  it('열려 있는 동안 뒤 스크롤을 막고 닫으면 되돌린다', () => {
    // 안 되돌리면 모달을 한 번 연 뒤로 페이지 전체가 스크롤되지 않는다.
    document.body.style.overflow = 'auto';

    const { unmount } = open();
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('닫으면 원래 있던 곳으로 포커스를 돌려준다', () => {
    // 안 돌려주면 키보드 사용자는 모달을 닫은 뒤 문서 맨 위에서 다시 시작한다.
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = open();
    expect(document.activeElement).not.toBe(opener);

    unmount();
    expect(document.activeElement).toBe(opener);

    opener.remove();
  });
});
