import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Settings from './Settings';
import { ConfirmProvider } from '../components/ConfirmProvider';
import { describeSample } from '../components/DataIntegritySection';

// 데이터 점검 리포트 화면(#445, #122).
//
// 서버는 `GET /api/data-integrity` 를 이미 갖고 있었는데 **부르는 화면이
// 없었다.** 감사(#444)가 잡은 "만들었는데 쓰는 쪽이 없다" 유형이다.
//
// 여기서 잠그는 것.
//   1. 화면을 열기만 해서는 점검이 안 돈다 — 전체 스캔을 안 볼 사람에게 물리지 않는다
//   2. 걸린 것이 있으면 **어느 건인지**까지 보여준다 — 건수만으로는 못 고친다
//   3. 깨끗한 것과 아직 안 돌린 것을 구분해 보여준다

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

const CLEAN = {
  checks: [
    { name: '비ISO 날짜 형식', count: 0, samples: [] },
    { name: 'payment_style 이상값', count: 0, samples: [] },
  ],
};

const DIRTY = {
  checks: [
    { name: '비ISO 날짜 형식', count: 2, samples: [{ id: 7, date: '20260301' }] },
    { name: 'payment_style 이상값', count: 0, samples: [] },
    {
      name: '중복 승인번호',
      count: 1,
      samples: [{ approval_number: '12345678', count: 2 }],
    },
  ],
};

function mockApi(integrity) {
  get.mockImplementation((url) => {
    if (url.startsWith('/api/data-integrity')) {
      return integrity ? Promise.resolve(integrity) : Promise.reject(new Error('점검 실패'));
    }
    if (url.startsWith('/api/categories')) return Promise.resolve([]);
    if (url.startsWith('/api/payment-methods')) return Promise.resolve([]);
    if (url.startsWith('/api/settings')) return Promise.resolve({ initial_balance: 0, monthly_income: 0 });
    if (url.startsWith('/api/recurring-rules')) return Promise.resolve([]);
    return Promise.resolve([]);
  });
}

const renderSettings = () => render(<ConfirmProvider><Settings /></ConfirmProvider>);

const section = async () => {
  const h = await screen.findByRole('heading', { name: '데이터 점검' });
  return h.closest('div').parentElement;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('데이터 점검 절', () => {
  it('화면을 열기만 해서는 점검을 부르지 않는다', async () => {
    mockApi(CLEAN);
    renderSettings();
    await screen.findByRole('heading', { name: '데이터 점검' });

    const called = get.mock.calls.filter(([url]) => String(url).startsWith('/api/data-integrity'));
    expect(called).toHaveLength(0);
  });

  it('점검하기를 누르면 그때 부른다', async () => {
    mockApi(CLEAN);
    const user = userEvent.setup();
    renderSettings();
    const box = await section();

    await user.click(within(box).getByRole('button', { name: '점검하기' }));

    await waitFor(() => {
      expect(get.mock.calls.some(([url]) => String(url).startsWith('/api/data-integrity'))).toBe(true);
    });
  });

  // 0 건과 "아직 안 돌림" 을 같게 보여주면 점검했다는 사실 자체를 알 수 없다.
  it('깨끗하면 몇 가지를 봤는지 말해 준다', async () => {
    mockApi(CLEAN);
    const user = userEvent.setup();
    renderSettings();
    const box = await section();

    await user.click(within(box).getByRole('button', { name: '점검하기' }));

    expect(await within(box).findByText(/이상한 값이 없어요/)).toBeTruthy();
    expect(within(box).getByText(/2가지를 봤습니다/)).toBeTruthy();
  });

  it('걸린 항목만 보여주고 건수를 적는다', async () => {
    mockApi(DIRTY);
    const user = userEvent.setup();
    renderSettings();
    const box = await section();

    await user.click(within(box).getByRole('button', { name: '점검하기' }));

    expect(await within(box).findByText('비ISO 날짜 형식')).toBeTruthy();
    expect(within(box).getByText('중복 승인번호')).toBeTruthy();
    // count 가 0 인 항목은 목록에 없다.
    expect(within(box).queryByText('payment_style 이상값')).toBeNull();
    expect(within(box).getByText(/3가지 중 2가지에서 걸렸어요/)).toBeTruthy();
  });

  // 건수만으로는 못 고친다. 어느 행인지가 나와야 거래 화면에서 찾아간다.
  it('어느 건인지 표본을 보여준다', async () => {
    mockApi(DIRTY);
    const user = userEvent.setup();
    renderSettings();
    const box = await section();

    await user.click(within(box).getByRole('button', { name: '점검하기' }));

    expect(await within(box).findByText(/id 7 · date 20260301/)).toBeTruthy();
    expect(within(box).getByText(/approval_number 12345678 · count 2/)).toBeTruthy();
  });

  // 서버는 표본을 20건까지만 준다. 그 사실을 안 적으면 "이게 전부" 로 읽힌다.
  it('표본이 잘렸으면 잘렸다고 적는다', async () => {
    mockApi(DIRTY);
    const user = userEvent.setup();
    renderSettings();
    const box = await section();

    await user.click(within(box).getByRole('button', { name: '점검하기' }));

    // count 2 · samples 1 → 잘림
    expect(await within(box).findByText('앞의 1건만 보여요')).toBeTruthy();
    // count 1 · samples 1 → 전부
    expect(within(box).getByText('해당 건')).toBeTruthy();
  });

  it('점검이 실패하면 사유를 보여준다', async () => {
    mockApi(null);
    const user = userEvent.setup();
    renderSettings();
    const box = await section();

    await user.click(within(box).getByRole('button', { name: '점검하기' }));

    expect(await within(box).findByText('점검 실패')).toBeTruthy();
  });
});

describe('describeSample', () => {
  // 점검마다 표본 모양이 다르다. 키를 그대로 훑기 때문에 서버에 점검이 늘어도
  // 화면을 안 고쳐도 된다 — 그 성질을 잠근다.
  it('모양이 다른 표본을 각각 읽는다', () => {
    expect(describeSample({ id: 1, date: 'x' })).toBe('id 1 · date x');
    expect(describeSample({ approval_number: 'a', count: 2 })).toBe('approval_number a · count 2');
    expect(describeSample({ id: 3, category_id: 9 })).toBe('id 3 · category_id 9');
  });

  it('null 값을 빈칸으로 두지 않는다', () => {
    expect(describeSample({ id: 1, memo: null })).toBe('id 1 · memo (없음)');
  });

  it('객체가 아니어도 깨지지 않는다', () => {
    expect(describeSample(null)).toBe('');
    expect(describeSample(undefined)).toBe('');
    expect(describeSample(42)).toBe('42');
  });
});
