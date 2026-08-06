import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Settings from './Settings';
import { ConfirmProvider } from '../components/ConfirmProvider';

// 설정 화면의 '기본 설정' 절 — 초기 잔액·월 수입, 테마, 시작 안내 재설정.
//
// 절 단위로 파일을 나눈다. 설정 화면은 절이 열두 개고 '저장' 같은 글자가 여러
// 절에 겹친다. 한 파일에 몰면 다른 절 작업과 서로 밟는다.
//
// 테마·온보딩은 lib 를 목으로 바꾸지 않고 실제 구현을 태운다. 이 절의 값어치가
// "버튼이 localStorage 와 <html> 을 실제로 바꾸는가" 에 있기 때문이다.

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

function mockApi({ settings = { initial_balance: 0, monthly_income: 0 } } = {}) {
  get.mockImplementation((url) => {
    if (url.startsWith('/api/categories')) return Promise.resolve([]);
    if (url.startsWith('/api/payment-methods')) return Promise.resolve([]);
    if (url.startsWith('/api/settings')) return Promise.resolve(settings);
    if (url.startsWith('/api/recurring-rules')) return Promise.resolve([]);
    if (url.startsWith('/api/accounts')) return Promise.resolve({ data: [] });
    return Promise.resolve([]);
  });
  put.mockResolvedValue({ ok: true });
}

const renderSettings = () => render(<ConfirmProvider><Settings /></ConfirmProvider>);

const basicsSection = async () => {
  const h = await screen.findByRole('heading', { name: '기본 설정' });
  return within(h.closest('section'));
};

beforeEach(() => {
  vi.clearAllMocks();
  mockApi();
});

afterEach(() => {
  // 테마는 <html> 속성에 남는다. localStorage 만 비우면 다음 테스트가 다크로 시작한다.
  document.documentElement.removeAttribute('data-theme');
});

describe('초기 잔액·월 수입', () => {
  it('서버에서 받은 값을 채워서 연다', async () => {
    mockApi({ settings: { initial_balance: 1500000, monthly_income: 3200000 } });
    renderSettings();
    const basics = await basicsSection();

    expect(basics.getByLabelText('초기 잔액 (원)').value).toBe('1500000');
    expect(basics.getByLabelText('월 수입 기준값 (원)').value).toBe('3200000');
  });

  it('값이 없으면 0 으로 연다', async () => {
    mockApi({ settings: {} });
    renderSettings();
    const basics = await basicsSection();

    // undefined 가 그대로 들어가면 입력이 통제되지 않는 상태가 되고
    // React 가 경고를 낸다.
    expect(basics.getByLabelText('초기 잔액 (원)').value).toBe('0');
    expect(basics.getByLabelText('월 수입 기준값 (원)').value).toBe('0');
  });

  it('저장하면 숫자로 바꿔 보낸다', async () => {
    renderSettings();
    const basics = await basicsSection();

    await userEvent.clear(basics.getByLabelText('초기 잔액 (원)'));
    await userEvent.type(basics.getByLabelText('초기 잔액 (원)'), '500000');
    await userEvent.clear(basics.getByLabelText('월 수입 기준값 (원)'));
    await userEvent.type(basics.getByLabelText('월 수입 기준값 (원)'), '2800000');
    await userEvent.click(basics.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/settings', {
      initial_balance: 500000,
      monthly_income: 2800000,
    }));
    const sent = put.mock.calls[0][1];
    // 문자열로 새면 서버가 숫자 검증을 통과시키거나 조용히 0 으로 저장한다.
    expect(typeof sent.initial_balance).toBe('number');
    expect(typeof sent.monthly_income).toBe('number');
  });

  it('저장하면 저장됐다고 알린다', async () => {
    renderSettings();
    const basics = await basicsSection();

    expect(basics.queryByText('저장됨')).toBeNull();
    await userEvent.click(basics.getByRole('button', { name: '저장' }));

    expect(await basics.findByText('저장됨')).toBeTruthy();
  });

  it('저장하면 화면 전체를 다시 읽는다', async () => {
    renderSettings();
    const basics = await basicsSection();
    const before = get.mock.calls.length;

    await userEvent.click(basics.getByRole('button', { name: '저장' }));

    // 초기 잔액은 잔액 계산의 기준점이라, 저장만 하고 다시 안 읽으면
    // 다른 절과 화면이 옛 값 위에서 논다.
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(before));
  });

  it('저장이 실패하면 사유를 알리고 저장됐다고 하지 않는다', async () => {
    put.mockRejectedValue(new Error('초기 잔액은 숫자여야 합니다'));
    renderSettings();
    const basics = await basicsSection();

    await userEvent.click(basics.getByRole('button', { name: '저장' }));

    expect(await screen.findByText('초기 잔액은 숫자여야 합니다')).toBeTruthy();
    expect(basics.queryByText('저장됨')).toBeNull();
  });
});

describe('테마 전환', () => {
  it('기본은 라이트다', async () => {
    renderSettings();
    const basics = await basicsSection();

    const btn = basics.getByRole('button', { name: '다크 모드로' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  it('누르면 다크로 바꾸고 저장까지 한다', async () => {
    renderSettings();
    const basics = await basicsSection();

    await userEvent.click(basics.getByRole('button', { name: '다크 모드로' }));

    // 셋이 함께 움직여야 한다. 화면만 바뀌고 저장이 빠지면 새로고침에 풀리고,
    // 저장만 되고 적용이 빠지면 지금 화면이 그대로다.
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem('ft.theme')).toBe('dark');
    expect(basics.getByRole('button', { name: '라이트 모드로' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('다시 누르면 라이트로 돌아온다', async () => {
    renderSettings();
    const basics = await basicsSection();

    await userEvent.click(basics.getByRole('button', { name: '다크 모드로' }));
    await userEvent.click(basics.getByRole('button', { name: '라이트 모드로' }));

    // 라이트는 속성을 남기지 않는 것이 규칙이다(lib/theme.js).
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    expect(window.localStorage.getItem('ft.theme')).toBe('light');
  });

  it('저장된 테마가 다크면 다크로 열린다', async () => {
    window.localStorage.setItem('ft.theme', 'dark');
    renderSettings();
    const basics = await basicsSection();

    expect(basics.getByRole('button', { name: '라이트 모드로' }).getAttribute('aria-pressed')).toBe('true');
    expect(basics.getByText('어두운 화면을 쓰고 있어요.')).toBeTruthy();
  });

  it('저장된 값이 오염돼 있으면 라이트로 연다', async () => {
    window.localStorage.setItem('ft.theme', 'sepia');
    renderSettings();
    const basics = await basicsSection();

    expect(basics.getByRole('button', { name: '다크 모드로' })).toBeTruthy();
  });
});

describe('시작 안내 다시 보기', () => {
  it('누르면 완료 표식을 지운다', async () => {
    window.localStorage.setItem('ft.onboarding.done', '1');
    renderSettings();
    const basics = await basicsSection();

    await userEvent.click(basics.getByRole('button', { name: '시작 안내 다시 보기' }));

    expect(window.localStorage.getItem('ft.onboarding.done')).toBeNull();
  });

  it('누르기 전과 후의 안내 문구가 다르다', async () => {
    renderSettings();
    const basics = await basicsSection();

    expect(basics.getByText('처음 실행 때 나오는 3단계 안내를 다시 볼 수 있어요.')).toBeTruthy();

    await userEvent.click(basics.getByRole('button', { name: '시작 안내 다시 보기' }));

    // 이 화면에서는 안내가 바로 뜨지 않는다. 무엇을 더 해야 하는지 말해 주지
    // 않으면 사용자는 버튼이 안 먹은 줄 안다.
    expect(basics.getByText('새로고침하면 시작 안내가 다시 보여요.')).toBeTruthy();
  });
});
