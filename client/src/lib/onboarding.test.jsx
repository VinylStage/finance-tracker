import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WELCOME_STEPS, isOnboardingDone, markOnboardingDone, resetOnboarding, shouldShowWelcome } from './onboarding';

beforeEach(() => {
  window.localStorage.clear();
});

describe('WELCOME_STEPS', () => {
  it('세 단계가 순서대로 있다', () => {
    expect(WELCOME_STEPS).toHaveLength(3);
    expect(WELCOME_STEPS.map(s => s.id)).toEqual(['what', 'first-tx', 'budget']);
    for (const step of WELCOME_STEPS) {
      expect(step.title).toBeTruthy();
      expect(step.body).toBeTruthy();
    }
  });

  it('cta 가 있는 단계는 갈 곳이 있다', () => {
    for (const step of WELCOME_STEPS) {
      if (step.cta) {
        expect(step.cta.label).toBeTruthy();
        expect(step.cta.href).toMatch(/^\/.*/);
      }
    }
  });
});

describe('플래그 읽고 쓰기', () => {
  it('처음에는 완료가 아니다', () => {
    expect(isOnboardingDone()).toBe(false);
  });

  it('표시하면 완료로 읽힌다', () => {
    expect(markOnboardingDone()).toBe(true);
    expect(isOnboardingDone()).toBe(true);
  });

  it('되돌리면 다시 미완료다', () => {
    markOnboardingDone();
    expect(resetOnboarding()).toBe(true);
    expect(isOnboardingDone()).toBe(false);
  });

  it("'1' 이 아닌 값은 완료로 안 본다", () => {
    window.localStorage.setItem('ft.onboarding.done', 'true');
    expect(isOnboardingDone()).toBe(false);
    
    window.localStorage.setItem('ft.onboarding.done', '0');
    expect(isOnboardingDone()).toBe(false);
  });
});

describe('localStorage 가 막힌 환경', () => {
  it('읽기가 막히면 완료로 본다 — 매번 뜨는 것보다 낫다', () => {
    const spy = vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(isOnboardingDone()).toBe(true);
    spy.mockRestore();
  });

  it('쓰기가 막히면 false 를 돌려주고 죽지 않는다', () => {
    const setItemSpy = vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    expect(markOnboardingDone()).toBe(false);
    setItemSpy.mockRestore();
    
    const removeItemSpy = vi.spyOn(window.localStorage.__proto__, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    expect(resetOnboarding()).toBe(false);
    removeItemSpy.mockRestore();
  });
});

describe('shouldShowWelcome', () => {
  it('처음 쓰는 사람에게만 띄운다', () => {
    expect(shouldShowWelcome({ done: false, transactionTotal: 0 })).toBe(true);
  });

  it('이미 봤으면 안 띄운다', () => {
    expect(shouldShowWelcome({ done: true, transactionTotal: 0 })).toBe(false);
  });

  it('거래가 이미 있으면 안 띄운다 — 처음 쓰는 사람이 아니다', () => {
    expect(shouldShowWelcome({ done: false, transactionTotal: 1 })).toBe(false);
    expect(shouldShowWelcome({ done: false, transactionTotal: 546 })).toBe(false);
  });

  it('아직 로딩 중이면 판정을 미룬다', () => {
    expect(shouldShowWelcome({ done: false, transactionTotal: null })).toBe(false);
    expect(shouldShowWelcome({ done: false, transactionTotal: undefined })).toBe(false);
  });
});

describe('WELCOME_STEPS', () => {
  it('세 단계가 순서대로 있다', () => {
    expect(WELCOME_STEPS).toHaveLength(3);
    expect(WELCOME_STEPS.map(s => s.id)).toEqual(['what', 'first-tx', 'budget']);
    for (const step of WELCOME_STEPS) {
      expect(step.title).toBeTruthy();
      expect(step.body).toBeTruthy();
    }
  });

  it('cta 가 있는 단계는 갈 곳이 있다', () => {
    for (const step of WELCOME_STEPS) {
      if (step.cta) {
        expect(step.cta.label).toBeTruthy();
        expect(step.cta.href).toMatch(/^\/.*/);
      }
    }
  });
});

describe('플래그 읽고 쓰기', () => {
  it('처음에는 완료가 아니다', () => {
    expect(isOnboardingDone()).toBe(false);
  });

  it('표시하면 완료로 읽힌다', () => {
    expect(markOnboardingDone()).toBe(true);
    expect(isOnboardingDone()).toBe(true);
  });

  it('되돌리면 다시 미완료다', () => {
    markOnboardingDone();
    expect(resetOnboarding()).toBe(true);
    expect(isOnboardingDone()).toBe(false);
  });

  it("'1' 이 아닌 값은 완료로 안 본다", () => {
    window.localStorage.setItem('ft.onboarding.done', 'true');
    expect(isOnboardingDone()).toBe(false);
    
    window.localStorage.setItem('ft.onboarding.done', '0');
    expect(isOnboardingDone()).toBe(false);
  });
});

describe('localStorage 가 막힌 환경', () => {
  it('읽기가 막히면 완료로 본다 — 매번 뜨는 것보다 낫다', () => {
    const spy = vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(isOnboardingDone()).toBe(true);
    spy.mockRestore();
  });

  it('쓰기가 막히면 false 를 돌려주고 죽지 않는다', () => {
    const setItemSpy = vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    expect(markOnboardingDone()).toBe(false);
    setItemSpy.mockRestore();
    
    const removeItemSpy = vi.spyOn(window.localStorage.__proto__, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    expect(resetOnboarding()).toBe(false);
    removeItemSpy.mockRestore();
  });
});

describe('shouldShowWelcome', () => {
  it('처음 쓰는 사람에게만 띄운다', () => {
    expect(shouldShowWelcome({ done: false, transactionTotal: 0 })).toBe(true);
  });

  it('이미 봤으면 안 띄운다', () => {
    expect(shouldShowWelcome({ done: true, transactionTotal: 0 })).toBe(false);
  });

  it('거래가 이미 있으면 안 띄운다 — 처음 쓰는 사람이 아니다', () => {
    expect(shouldShowWelcome({ done: false, transactionTotal: 1 })).toBe(false);
    expect(shouldShowWelcome({ done: false, transactionTotal: 546 })).toBe(false);
  });

  it('아직 로딩 중이면 판정을 미룬다', () => {
    expect(shouldShowWelcome({ done: false, transactionTotal: null })).toBe(false);
    expect(shouldShowWelcome({ done: false, transactionTotal: undefined })).toBe(false);
  });
});
