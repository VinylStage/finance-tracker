import { describe, it, expect, beforeEach } from 'vitest';
import {
  THEMES,
  DEFAULT_THEME,
  normalizeTheme,
  readTheme,
  saveTheme,
  toggleTheme,
  applyTheme,
} from './theme';

// 테마 상태(#201). 분기 8.3% 였다.
//
// 이 모듈이 조용히 틀리면 앱이 죽지는 않고 **색만 잘못 뜬다.** 저장된 값이 오염됐을
// 때 기본으로 떨어뜨리는 처리와, 라이트일 때 속성을 지우는 처리가 특히 그렇다.

const KEY = 'ft.theme';

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

function denyStorage() {
  const orig = Object.getOwnPropertyDescriptor(window, 'localStorage');
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() { throw new DOMException('denied', 'SecurityError'); },
  });
  return () => { if (orig) Object.defineProperty(window, 'localStorage', orig); };
}

describe('normalizeTheme', () => {
  it('아는 값은 그대로 둔다', () => {
    for (const t of THEMES) expect(normalizeTheme(t)).toBe(t);
  });

  it('오염된 값은 기본값으로 떨어뜨린다', () => {
    // 손으로 편집했거나 구버전이 남긴 값. 그대로 쓰면 CSS 선택자에 없는 값이
    // data-theme 에 들어간다.
    for (const bad of ['Dark', 'DARK', 'sepia', '', null, undefined, 0, {}]) {
      expect(normalizeTheme(bad)).toBe(DEFAULT_THEME);
    }
  });

  it('기본값은 라이트다', () => {
    // 다크는 옵트인이라는 것이 인수기준이다(#201).
    expect(DEFAULT_THEME).toBe('light');
  });
});

describe('readTheme / saveTheme', () => {
  it('저장한 값을 읽는다', () => {
    expect(saveTheme('dark')).toBe(true);
    expect(window.localStorage.getItem(KEY)).toBe('dark');
    expect(readTheme()).toBe('dark');
  });

  it('저장 안 했으면 기본값이다', () => {
    expect(readTheme()).toBe(DEFAULT_THEME);
  });

  it('오염된 값이 저장돼 있어도 기본값으로 읽는다', () => {
    window.localStorage.setItem(KEY, 'sepia');
    expect(readTheme()).toBe(DEFAULT_THEME);
  });

  it('모르는 값은 저장 단계에서 정규화한다', () => {
    // 오염된 값이 저장소에 들어가면 다음 기기 동기화나 수동 확인 때 헷갈린다.
    expect(saveTheme('sepia')).toBe(true);
    expect(window.localStorage.getItem(KEY)).toBe(DEFAULT_THEME);
  });

  it('저장소가 막혀도 화면은 떠야 한다', () => {
    const restore = denyStorage();
    try {
      expect(readTheme()).toBe(DEFAULT_THEME);
      expect(saveTheme('dark')).toBe(false);
      expect(() => saveTheme('dark')).not.toThrow();
    } finally {
      restore();
    }
  });
});

describe('toggleTheme', () => {
  it('라이트와 다크를 오간다', () => {
    expect(toggleTheme('light')).toBe('dark');
    expect(toggleTheme('dark')).toBe('light');
  });

  it('오염된 현재값은 라이트로 보고 다크로 간다', () => {
    // 기본이 라이트이므로 모르는 값에서 누르면 다크가 되는 것이 맞다.
    for (const bad of ['sepia', null, undefined, '']) {
      expect(toggleTheme(bad)).toBe('dark');
    }
  });

  it('두 번 누르면 제자리로 돌아온다', () => {
    for (const start of ['light', 'dark']) {
      expect(toggleTheme(toggleTheme(start))).toBe(start);
    }
  });
});

describe('applyTheme', () => {
  it('다크는 data-theme 을 붙인다', () => {
    expect(applyTheme('dark')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('라이트는 속성을 지운다', () => {
    // 남겨두면 나중에 라이트 전용 오버라이드가 생겼을 때 어느 쪽이 기본인지
    // 헷갈린다는 것이 코드 주석의 판단이다.
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(applyTheme('light')).toBe('light');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('오염된 값은 라이트로 적용한다', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(applyTheme('sepia')).toBe(DEFAULT_THEME);
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('대상 요소를 직접 줄 수 있다', () => {
    const el = document.createElement('div');
    expect(applyTheme('dark', el)).toBe('dark');
    expect(el.getAttribute('data-theme')).toBe('dark');
    // 직접 준 요소에만 적용되고 문서 루트는 건드리지 않는다.
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('붙였다 지우는 왕복이 남기지 않는다', () => {
    applyTheme('dark');
    applyTheme('light');
    applyTheme('dark');
    applyTheme('light');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});

describe('THEMES', () => {
  it('기본값이 목록에 있다', () => {
    // 목록에 없으면 normalizeTheme 이 기본값조차 거부한다.
    expect(THEMES).toContain(DEFAULT_THEME);
  });
});
