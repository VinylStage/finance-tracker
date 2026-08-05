import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { THEMES, DEFAULT_THEME, normalizeTheme, readTheme, saveTheme, toggleTheme, applyTheme } from './theme';

describe('normalizeTheme', () => {
  it('아는 값은 그대로', () => {
    expect(normalizeTheme('dark')).toBe('dark');
    expect(normalizeTheme('light')).toBe('light');
  });

  it('모르는 값·빈 값은 기본값으로 떨어진다', () => {
    expect(normalizeTheme('보라색')).toBe(DEFAULT_THEME);
    expect(normalizeTheme(null)).toBe(DEFAULT_THEME);
    expect(normalizeTheme(undefined)).toBe(DEFAULT_THEME);
    expect(normalizeTheme('')).toBe(DEFAULT_THEME);
    expect(normalizeTheme(0)).toBe(DEFAULT_THEME);
  });
});

describe('toggleTheme', () => {
  it('두 값을 오간다', () => {
    expect(toggleTheme('light')).toBe('dark');
    expect(toggleTheme('dark')).toBe('light');
  });

  it('오염된 현재값에서 토글하면 dark 로 간다', () => {
    expect(toggleTheme('보라색')).toBe('dark');
    expect(toggleTheme(null)).toBe('dark');
  });
});

describe('applyTheme', () => {
  let root;

  beforeEach(() => {
    root = document.createElement('html');
  });

  it('dark 면 data-theme 을 붙인다', () => {
    const result = applyTheme('dark', root);
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(result).toBe('dark');
  });

  it('light 면 속성을 지운다 — 남겨두지 않는다', () => {
    root.setAttribute('data-theme', 'dark');
    const result = applyTheme('light', root);
    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(result).toBe('light');
  });

  it('모르는 값은 light 처럼 다룬다', () => {
    root.setAttribute('data-theme','dark');
    const result = applyTheme('보라색', root);
    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(result).toBe(DEFAULT_THEME);
  });

  it('root 를 안 넘기면 문서 전체에 적용한다 — 이게 실제 호출 경로다', () => {
    // `Settings.jsx` 는 `applyTheme(next)` 로 부른다. root 인자가 없다.
    // 그래서 이 폴백이 예외 처리가 아니라 **운영에서 늘 도는 길**이다.
    // 여기가 깨지면 설정에서 테마를 바꿔도 화면이 그대로다.
    const html = document.documentElement;
    const before = html.getAttribute('data-theme');
    try {
      expect(applyTheme('dark')).toBe('dark');
      expect(html.getAttribute('data-theme')).toBe('dark');

      expect(applyTheme('light')).toBe('light');
      expect(html.hasAttribute('data-theme')).toBe(false);
    } finally {
      // 실제 문서를 건드렸으므로 되돌린다. 안 되돌리면 뒤에 도는 다른 테스트가
      // 다크 상태를 물려받는다.
      if (before === null) html.removeAttribute('data-theme');
      else html.setAttribute('data-theme', before);
    }
  });
});

describe('readTheme / saveTheme', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('저장한 값을 읽는다', () => {
    expect(saveTheme('dark')).toBe(true);
    expect(readTheme()).toBe('dark');
  });

  it('저장한 적 없으면 기본값', () => {
    expect(readTheme()).toBe(DEFAULT_THEME);
  });

  it('오염된 값이 저장돼 있어도 기본값으로 읽는다', () => {
    window.localStorage.setItem('ft.theme', '보라색');
    expect(readTheme()).toBe(DEFAULT_THEME);
  });

  it('localStorage 가 막혀도 화면은 뜬다', () => {
    const spy = vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(readTheme()).toBe(DEFAULT_THEME);
    spy.mockRestore();

    const spy2 = vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    expect(saveTheme('dark')).toBe(false);
    spy2.mockRestore();
  });
});
