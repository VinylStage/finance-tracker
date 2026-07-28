const { test, describe, before, beforeEach } = require('node:test');
const assert = require('node:assert');

let isOnboardingDone, markOnboardingDone, resetOnboarding, shouldShowWelcome, WELCOME_STEPS;
const store = new Map();

before(async () => {
  globalThis.window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
    },
  };
  ({ isOnboardingDone, markOnboardingDone, resetOnboarding, shouldShowWelcome, WELCOME_STEPS } =
    await import('../client/src/lib/onboarding.js'));
});

beforeEach(() => { store.clear(); });

describe('onboarding', () => {
  describe('플래그 왕복', () => {
    test('초기 상태에서 isOnboardingDone()은 false', () => {
      assert.strictEqual(isOnboardingDone(), false);
    });

    test('markOnboardingDone()이 true를 돌려주고, 이후 isOnboardingDone()은 true', () => {
      const result = markOnboardingDone();
      assert.strictEqual(result, true);
      assert.strictEqual(isOnboardingDone(), true);
    });

    test('resetOnboarding()이 true를 돌려주고, 이후 isOnboardingDone()은 다시 false', () => {
      markOnboardingDone();
      const result = resetOnboarding();
      assert.strictEqual(result, true);
      assert.strictEqual(isOnboardingDone(), false);
    });

    test('두 번 연속 markOnboardingDone()을 불러도 isOnboardingDone()은 true', () => {
      markOnboardingDone();
      markOnboardingDone();
      assert.strictEqual(isOnboardingDone(), true);
    });
  });

  describe('shouldShowWelcome 조건 조합 전수', () => {
    const testCases = [
      { done: false, transactionTotal: 0, expected: true },
      { done: false, transactionTotal: 1, expected: false },
      { done: false, transactionTotal: 12, expected: false },
      { done: true, transactionTotal: 0, expected: false },
      { done: true, transactionTotal: 5, expected: false },
      { done: false, transactionTotal: null, expected: false },
      { done: false, transactionTotal: undefined, expected: false },
      { done: true, transactionTotal: null, expected: false },
      { done: false, transactionTotal: '0', expected: true },
    ];

    for (const { done, transactionTotal, expected } of testCases) {
      test(`done: ${done}, transactionTotal: ${transactionTotal} => ${expected}`, () => {
        const result = shouldShowWelcome({ done, transactionTotal });
        assert.strictEqual(result, expected);
      });
    }
  });

  describe('WELCOME_STEPS', () => {
    test('정확히 3개다', () => {
      assert.strictEqual(WELCOME_STEPS.length, 3);
    });

    test('각 단계에 id, title, body가 있고 전부 빈 문자열이 아니다', () => {
      for (const step of WELCOME_STEPS) {
        assert.ok(step.id);
        assert.ok(step.title);
        assert.ok(step.body);
      }
    });

    test('id는 서로 중복되지 않는다', () => {
      const ids = WELCOME_STEPS.map(s => s.id);
      assert.strictEqual(new Set(ids).size, ids.length);
    });

    test('2번째·3번째 단계에는 cta가 있고, 각 cta에 label과 href가 있다', () => {
      for (let i = 1; i < WELCOME_STEPS.length; i++) {
        const step = WELCOME_STEPS[i];
        assert.ok(step.cta);
        assert.ok(step.cta.label);
        assert.ok(step.cta.href);
      }
    });

    test('모든 cta.href는 /로 시작한다', () => {
      for (let i = 1; i < WELCOME_STEPS.length; i++) {
        const step = WELCOME_STEPS[i];
        assert.ok(step.cta.href.startsWith('/'));
      }
    });
  });
});
