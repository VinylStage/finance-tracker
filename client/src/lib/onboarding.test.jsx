import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  WELCOME_STEPS,
  isOnboardingDone,
  markOnboardingDone,
  resetOnboarding,
  shouldShowWelcome,
} from './onboarding';

// 최초 실행 온보딩(#197). 분기 0% 였다.
//
// 여기가 조용히 깨지면 **기존 사용자에게 웰컴이 반복해서 뜬다.** 화면이 죽는 것이
// 아니라 성가신 방향으로 틀리는 것이라, 테스트 없이는 배포 후에야 알게 된다.

const KEY = 'ft.onboarding.done';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('플래그 읽고 쓰기', () => {
  it('처음에는 완료가 아니다', () => {
    expect(isOnboardingDone()).toBe(false);
  });

  it('완료 표시를 하면 완료로 읽힌다', () => {
    expect(markOnboardingDone()).toBe(true);
    expect(isOnboardingDone()).toBe(true);
    expect(window.localStorage.getItem(KEY)).toBe('1');
  });

  it('다시 보기는 플래그만 지운다', () => {
    markOnboardingDone();
    window.localStorage.setItem('ft.other', 'keep');

    expect(resetOnboarding()).toBe(true);
    expect(isOnboardingDone()).toBe(false);
    expect(window.localStorage.getItem('ft.other')).toBe('keep');
  });

  it("'1' 이 아닌 값은 완료로 보지 않는다", () => {
    // 예전 값이나 손으로 넣은 값이 남아 있을 수 있다.
    for (const v of ['0', 'true', 'yes', '']) {
      window.localStorage.setItem(KEY, v);
      expect(isOnboardingDone()).toBe(false);
    }
  });
});

describe('저장소 접근이 막힌 환경', () => {
  // 사파리 프라이빗 모드 등에서 localStorage 접근 자체가 던진다.
  //
  // `vi.spyOn(window.localStorage, 'getItem')` 은 jsdom 에서 먹지 않는다 —
  // 스파이는 붙지만 실제 호출이 원본으로 간다(직접 확인). 접근자를 통째로
  // 바꿔야 던지는 상황이 재현된다.
  function denyStorage() {
    const orig = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('denied', 'SecurityError'); },
    });
    return () => {
      if (orig) Object.defineProperty(window, 'localStorage', orig);
    };
  }

  it('읽기가 막히면 완료로 본다', () => {
    // 매번 웰컴이 뜨는 것보다 안 뜨는 쪽이 덜 성가시다는 판단이 코드 주석에 있다.
    const restore = denyStorage();
    try {
      expect(isOnboardingDone()).toBe(true);
    } finally {
      restore();
    }
  });

  it('쓰기가 막히면 false 를 주되 던지지 않는다', () => {
    const restore = denyStorage();
    try {
      expect(() => markOnboardingDone()).not.toThrow();
      expect(markOnboardingDone()).toBe(false);
    } finally {
      restore();
    }
  });

  it('삭제가 막혀도 던지지 않는다', () => {
    const restore = denyStorage();
    try {
      expect(() => resetOnboarding()).not.toThrow();
      expect(resetOnboarding()).toBe(false);
    } finally {
      restore();
    }
  });

  it('막힌 뒤 복구되면 정상 동작한다', () => {
    // 복구를 확인하지 않으면 이 묶음이 뒤 테스트를 오염시킨다.
    const restore = denyStorage();
    isOnboardingDone();
    restore();
    expect(markOnboardingDone()).toBe(true);
    expect(isOnboardingDone()).toBe(true);
  });
});

describe('shouldShowWelcome', () => {
  it('완료했으면 띄우지 않는다', () => {
    expect(shouldShowWelcome({ done: true, transactionTotal: 0 })).toBe(false);
  });

  it('거래가 없고 처음이면 띄운다', () => {
    expect(shouldShowWelcome({ done: false, transactionTotal: 0 })).toBe(true);
  });

  it('거래가 이미 있으면 띄우지 않는다', () => {
    // 플래그가 지워진 브라우저(데이터 삭제, 새 브라우저)에서 기존 사용자에게
    // 웰컴이 뜨는 걸 막는 자리다.
    expect(shouldShowWelcome({ done: false, transactionTotal: 1 })).toBe(false);
    expect(shouldShowWelcome({ done: false, transactionTotal: 500 })).toBe(false);
  });

  it('건수를 아직 모르면 판정을 미룬다', () => {
    // 로딩 중에 0 으로 보면 기존 사용자에게 웰컴이 깜빡 떴다 사라진다.
    for (const total of [null, undefined]) {
      expect(shouldShowWelcome({ done: false, transactionTotal: total })).toBe(false);
    }
  });

  it("문자열 '0' 도 없는 것으로 센다", () => {
    // 응답이 문자열로 오는 경우. `=== 0` 만 보면 웰컴이 안 뜬다.
    expect(shouldShowWelcome({ done: false, transactionTotal: '0' })).toBe(true);
  });
});

describe('WELCOME_STEPS', () => {
  it('단계마다 id·제목·본문이 있다', () => {
    expect(WELCOME_STEPS.length).toBeGreaterThan(0);
    for (const s of WELCOME_STEPS) {
      expect(s.id).toBeTruthy();
      expect(s.title).toBeTruthy();
      expect(s.body).toBeTruthy();
    }
  });

  it('id 가 겹치지 않는다', () => {
    // React key 로 쓰인다. 겹치면 단계가 섞인다.
    const ids = WELCOME_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('행동 유도는 앱 안 경로를 가리킨다', () => {
    // 외부 링크나 절대 URL 이 섞이면 온보딩에서 앱 밖으로 나간다.
    for (const s of WELCOME_STEPS) {
      if (!s.cta) continue;
      expect(s.cta.label).toBeTruthy();
      expect(s.cta.href.startsWith('/')).toBe(true);
      expect(s.cta.href).not.toMatch(/^https?:/);
    }
  });

  it('문구가 목소리 기준을 따른다', () => {
    // docs/VOICE_TONE_GUIDE.md — 질문은 '~까요?', 서술은 '~요/~니다'.
    // 여기서는 내부 용어가 새지 않는 것만 기계적으로 본다.
    for (const s of WELCOME_STEPS) {
      for (const internal of ['localStorage', 'API', 'null', 'undefined']) {
        expect(s.body).not.toContain(internal);
      }
    }
  });
});
