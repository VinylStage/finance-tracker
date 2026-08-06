import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import WelcomeGate from './WelcomeGate';

// 웰컴을 띄울지 **말지** 판정하는 래퍼(#197). 커버리지가 0% 였다.
//
// 이 컴포넌트가 하는 일은 거의 전부 "안 띄우는 조건" 이다. 첫 화면에서 모달이
// 잘못 뜨면 기존 사용자가 자기 데이터가 사라진 줄 안다 — 그래서 판정이 틀렸을 때
// 피해가 한쪽으로 크게 쏠린다. 안 뜨는 실수는 설정에서 되돌릴 수 있다.
//
// `lib/onboarding.js` 의 판정 함수는 따로 단위 테스트가 있다. 여기서는 **그
// 판정을 이 컴포넌트가 실제로 부르고 결과를 따르는가** 를 본다 — 만들어 놓고
// 안 쓰는 것이 이 저장소의 지배적 결함 유형이다.

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
const { isOnboardingDone } = vi.hoisted(() => ({ isOnboardingDone: vi.fn() }));

vi.mock('../lib/api', () => ({
  api: { get, post: vi.fn(), put: vi.fn(), del: vi.fn(), raw: vi.fn() },
}));

// 판정 함수는 실물을 쓰고 플래그 읽기만 가로챈다. 판정까지 가짜로 만들면
// "컴포넌트가 판정을 따르는가" 를 검사할 수 없게 된다.
vi.mock('../lib/onboarding', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, isOnboardingDone };
});

beforeEach(() => {
  vi.clearAllMocks();
  isOnboardingDone.mockReturnValue(false);
  window.localStorage.clear();
});

afterEach(() => {
  document.body.style.overflow = '';
});

describe('띄우는 경우', () => {
  it('처음 쓰는 사람(거래 0건)에게는 뜬다', async () => {
    get.mockResolvedValue({ total: 0, data: [] });

    render(<WelcomeGate />);

    expect(await screen.findByRole('dialog')).toBeTruthy();
  });
});

describe('안 띄우는 경우 — 여기가 본체다', () => {
  it('이미 봤으면 조회조차 하지 않는다', async () => {
    isOnboardingDone.mockReturnValue(true);

    render(<WelcomeGate />);

    // 안 띄우는 것만으로는 부족하다. 매 첫 화면에서 쓸데없는 요청이 나가면
    // 느려지고, 서버가 없는 환경에서 콘솔이 오류로 덮인다.
    expect(get).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('거래가 이미 있으면 안 뜬다 — 플래그가 지워진 기존 사용자', async () => {
    // 브라우저 데이터를 지웠거나 새 기기에서 연 경우다. 여기서 웰컴이 뜨면
    // 사용자는 자기 가계부가 초기화된 줄 안다.
    get.mockResolvedValue({ total: 546, data: [] });

    render(<WelcomeGate />);

    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('조회에 실패하면 안 뜬다 — 모르면 안 띄운다', async () => {
    // 실패를 0건으로 해석하면 서버가 잠깐 죽었을 때 모든 사용자에게 웰컴이 뜬다.
    get.mockRejectedValue(new Error('offline'));

    render(<WelcomeGate />);

    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('응답이 오기 전에는 안 뜬다 — 깜빡이지 않는다', () => {
    // 로딩 중을 0건으로 보면 거래가 많은 사용자에게도 웰컴이 한 번 번쩍인다.
    get.mockReturnValue(new Promise(() => {})); // 영원히 대기

    render(<WelcomeGate />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('total 이 없는 응답도 0 으로 보되 그 판정은 한 곳에서만 한다', async () => {
    // `d.total ?? 0` — 서버가 total 을 빠뜨리면 처음 쓰는 사람으로 본다.
    get.mockResolvedValue({ data: [] });

    render(<WelcomeGate />);

    expect(await screen.findByRole('dialog')).toBeTruthy();
  });
});

describe('닫은 뒤', () => {
  it('닫으면 사라지고 다시 조회하지 않는다', async () => {
    get.mockResolvedValue({ total: 0, data: [] });
    render(<WelcomeGate />);
    const dialog = await screen.findByRole('dialog');
    const callsBefore = get.mock.calls.length;

    // 건너뛰기가 WelcomeFlow 의 onClose 를 부른다.
    screen.getByRole('button', { name: '건너뛰기' }).click();

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(dialog).toBeTruthy();
    // done 이 true 가 되면 effect 의 이른 반환에 걸려 재조회가 없어야 한다.
    expect(get.mock.calls.length).toBe(callsBefore);
  });
});
