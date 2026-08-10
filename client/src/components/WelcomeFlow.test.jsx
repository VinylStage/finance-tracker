import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import WelcomeFlow from './WelcomeFlow';
import { WELCOME_STEPS } from '../lib/onboarding';

function open() {
  const onClose = vi.fn();
  const utils = render(<WelcomeFlow onClose={onClose} />);
  return { onClose, dialog: screen.getByRole('dialog'), ...utils };
}

beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { document.body.style.overflow = ''; });

describe('단계 이동', () => {
  it('첫 단계와 진행 표시를 보여준다', () => {
    const { dialog } = open();
    
    expect(screen.getByText('1/3')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(WELCOME_STEPS[0].title);
  });

  it('첫 단계에는 이전 버튼이 없다', () => {
    open();
    
    expect(screen.queryByRole('button', { name: '이전' })).toBeNull();
  });

  it('다음·이전으로 오간다', () => {
    const { dialog } = open();
    
    // 다음으로 이동
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByText('2/3')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(WELCOME_STEPS[1].title);
    
    // 이전으로 이동
    fireEvent.click(screen.getByRole('button', { name: '이전' }));
    expect(screen.getByText('1/3')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(WELCOME_STEPS[0].title);
  });

  it('마지막 단계에서는 시작하기가 된다', () => {
    const { dialog } = open();
    
    // 두 번 다음으로 이동하여 마지막 단계로
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    
    expect(screen.getByText('3/3')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '다음' })).toBeNull();
    expect(screen.getByRole('button', { name: '시작하기' })).toBeTruthy();
  });
});

describe('닫는 길 — 셋 다 열려 있고 셋 다 완료로 기록된다', () => {
  it('건너뛰기로 닫는다', () => {
    const { onClose } = open();
    
    fireEvent.click(screen.getByRole('button', { name: '건너뛰기' }));
    
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('ft.onboarding.done')).toBe('1');
  });

  it('ESC 로 닫는다', () => {
    const { onClose } = open();
    
    fireEvent.keyDown(document, { key: 'Escape' });
    
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('ft.onboarding.done')).toBe('1');
  });

  it('배경 클릭으로 닫는다', () => {
    const { onClose, dialog } = open();
    
    fireEvent.click(dialog.parentElement);
    
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('ft.onboarding.done')).toBe('1');
  });

  it('마지막의 시작하기로 닫는다', () => {
    const { onClose } = open();
    
    // 두 번 다음으로 이동하여 마지막 단계로
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    
    // 시작하기 클릭
    fireEvent.click(screen.getByRole('button', { name: '시작하기' }));
    
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('ft.onboarding.done')).toBe('1');
  });
});

describe('닫히면 안 되는 경우', () => {
  it('패널 안을 클릭해도 안 닫힌다', () => {
    const { onClose } = open();
    
    fireEvent.click(screen.getByRole('dialog'));
    
    expect(onClose).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('ft.onboarding.done')).toBeNull();
  });
});

describe('문서 상태', () => {
  it('열려 있는 동안 뒤 스크롤을 막고 닫으면 되돌린다', () => {
    document.body.style.overflow = 'auto';
    const { unmount } = open();
    
    expect(document.body.style.overflow).toBe('hidden');
    
    unmount();
    
    expect(document.body.style.overflow).toBe('auto');
  });
});
