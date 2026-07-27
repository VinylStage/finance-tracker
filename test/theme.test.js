const { test, describe, before, beforeEach } = require('node:test');
const assert = require('node:assert');

let normalizeTheme, readTheme, saveTheme, toggleTheme, applyTheme, THEMES, DEFAULT_THEME;
const store = new Map();

function fakeElement() {
  const attrs = new Map();
  return {
    attrs,
    setAttribute: (k, v) => { attrs.set(k, String(v)); },
    removeAttribute: (k) => { attrs.delete(k); },
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
  };
}

before(async () => {
  globalThis.window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
    },
  };
  ({ normalizeTheme, readTheme, saveTheme, toggleTheme, applyTheme, THEMES, DEFAULT_THEME } =
    await import('../client/src/lib/theme.js'));
});

beforeEach(() => { store.clear(); });

describe('theme', () => {
  describe('A. 상수', () => {
    test('THEMES', () => {
      assert.deepStrictEqual(THEMES, ['light', 'dark']);
    });

    test('DEFAULT_THEME', () => {
      assert.strictEqual(DEFAULT_THEME, 'light');
    });
  });

  describe('B. normalizeTheme', () => {
    test('light 입력', () => {
      assert.strictEqual(normalizeTheme('light'), 'light');
    });

    test('dark 입력', () => {
      assert.strictEqual(normalizeTheme('dark'), 'dark');
    });

    test('대문자 Dark 입력', () => {
      assert.strictEqual(normalizeTheme('Dark'), 'light');
    });

    test('blue 입력', () => {
      assert.strictEqual(normalizeTheme('blue'), 'light');
    });

    test('null 입력', () => {
      assert.strictEqual(normalizeTheme(null), 'light');
    });

    test('undefined 입력', () => {
      assert.strictEqual(normalizeTheme(undefined), 'light');
    });

    test('빈 문자열 입력', () => {
      assert.strictEqual(normalizeTheme(''), 'light');
    });

    test('123 입력', () => {
      assert.strictEqual(normalizeTheme(123), 'light');
    });
  });

  describe('C. readTheme / saveTheme 왕복', () => {
    test('저장 전 readTheme() 는 light', () => {
      assert.strictEqual(readTheme(), 'light');
    });

    test('saveTheme("dark") 가 true 를 돌려주고, 이후 readTheme() 는 dark', () => {
      assert.strictEqual(saveTheme('dark'), true);
      assert.strictEqual(readTheme(), 'dark');
    });

    test('saveTheme("light") 후 readTheme() 는 light', () => {
      saveTheme('light');
      assert.strictEqual(readTheme(), 'light');
    });

    test('saveTheme("blue") 는 "light" 로 정규화해 저장하고, 이후 readTheme() 는 light', () => {
      assert.strictEqual(saveTheme('blue'), true);
      assert.strictEqual(readTheme(), 'light');
    });

    test('localStorage 에 직접 오염된 값을 넣어도 readTheme() 는 light', () => {
      store.set('ft.theme', 'purple');
      assert.strictEqual(readTheme(), 'light');
    });
  });

  describe('D. toggleTheme', () => {
    test('light 입력', () => {
      assert.strictEqual(toggleTheme('light'), 'dark');
    });

    test('dark 입력', () => {
      assert.strictEqual(toggleTheme('dark'), 'light');
    });

    test('blue 입력', () => {
      assert.strictEqual(toggleTheme('blue'), 'dark');
    });

    test('null 입력', () => {
      assert.strictEqual(toggleTheme(null), 'dark');
    });
  });

  describe('E. applyTheme', () => {
    test('applyTheme("dark", el) → 반환값 dark, el.getAttribute("data-theme") 는 dark', () => {
      const el = fakeElement();
      const result = applyTheme('dark', el);
      assert.strictEqual(result, 'dark');
      assert.strictEqual(el.getAttribute('data-theme'), 'dark');
    });

    test('applyTheme("light", el) → 반환값 light, 속성이 제거됨', () => {
      const el = fakeElement();
      applyTheme('dark', el);
      const result = applyTheme('light', el);
      assert.strictEqual(result, 'light');
      assert.strictEqual(el.getAttribute('data-theme'), null);
    });

    test('dark 를 적용한 뒤 light 를 적용하면 속성이 남지 않는다', () => {
      const el = fakeElement();
      applyTheme('dark', el);
      applyTheme('light', el);
      assert.strictEqual(el.getAttribute('data-theme'), null);
    });

    test('applyTheme("blue", el) → "light" 로 정규화, 속성 없음', () => {
      const el = fakeElement();
      const result = applyTheme('blue', el);
      assert.strictEqual(result, 'light');
      assert.strictEqual(el.getAttribute('data-theme'), null);
    });
  });
});
