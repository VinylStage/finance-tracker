import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Settings from './Settings';
import { ConfirmProvider } from '../components/ConfirmProvider';

// 설정 화면의 '결제수단 관리' 절 — 활성 토글과 비활성화·재활성화.
//
// 계좌 연결(#376)은 SettingsPaymentAccount.test.jsx 가 이미 본다. 여기서는
// 그 파일이 다루지 않는 축만 잡는다. 같은 절이라도 축이 다르면 파일을 나눈다.
//
// 핵심은 카테고리 절과 같다 — **PUT 이 부분 갱신이 아니다.** 결제수단 라우트는
// 레코드 전체를 덮으므로(routes/paymentMethods.js:78) 일부만 보내면 name·type 이
// NULL 로 덮이려다 스키마 제약에 걸려 500 이 난다.

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

const ACTIVE = { id: 100, name: '하나카드', type: '신용', is_active: 1, account_id: 10 };
// 활성/비활성은 다른 축이다. 한 픽스처로 겸하면 비활성 분기를 안 밟는다.
const INACTIVE = { id: 101, name: '옛날체크', type: '체크', is_active: 0, account_id: null };
const ACCOUNTS = [{ id: 10, name: '주거래통장', type: '입출금', is_active: 1 }];

function mockApi({ methods = [ACTIVE, INACTIVE] } = {}) {
  get.mockImplementation((url) => {
    if (url.startsWith('/api/categories')) return Promise.resolve([]);
    if (url.startsWith('/api/payment-methods')) return Promise.resolve(methods);
    if (url.startsWith('/api/settings')) return Promise.resolve({ initial_balance: 0, monthly_income: 0 });
    if (url.startsWith('/api/recurring-rules')) return Promise.resolve([]);
    if (url.startsWith('/api/accounts')) return Promise.resolve({ data: ACCOUNTS });
    return Promise.resolve([]);
  });
  post.mockResolvedValue({ id: 999 });
  put.mockResolvedValue({ ok: true });
  del.mockResolvedValue({ ok: true });
}

const renderSettings = () => render(<ConfirmProvider><Settings /></ConfirmProvider>);

const paymentSection = async () => {
  const h = await screen.findByRole('heading', { name: '결제수단 관리' });
  return within(h.closest('section'));
};

const dialog = () => screen.getByRole('dialog');

beforeEach(() => {
  vi.clearAllMocks();
  mockApi();
});

describe('활성 필터', () => {
  it('기본은 활성 항목만 보여준다', async () => {
    renderSettings();
    const pm = await paymentSection();

    expect(pm.getByText('하나카드', { exact: false })).toBeTruthy();
    expect(pm.queryByText('옛날체크', { exact: false })).toBeNull();
  });

  it('비활성 항목 보기로 넘기면 함께 보여준다', async () => {
    renderSettings();
    const pm = await paymentSection();

    await userEvent.click(pm.getByRole('button', { name: '비활성 항목 보기' }));

    expect(pm.getByText('옛날체크', { exact: false })).toBeTruthy();
  });

  it('활성 여부에 따라 다른 버튼을 준다', async () => {
    renderSettings();
    const pm = await paymentSection();
    await userEvent.click(pm.getByRole('button', { name: '비활성 항목 보기' }));

    expect(pm.getAllByRole('button', { name: '비활성화' })).toHaveLength(1);
    expect(pm.getAllByRole('button', { name: '재활성화' })).toHaveLength(1);
  });
});

describe('비활성화', () => {
  it('확인하면 비활성화하고 목록을 다시 읽는다', async () => {
    renderSettings();
    const pm = await paymentSection();
    const before = get.mock.calls.length;

    await userEvent.click(pm.getByRole('button', { name: '비활성화' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));

    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/payment-methods/100'));
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(before));
  });

  it('취소하면 아무것도 하지 않는다', async () => {
    renderSettings();
    const pm = await paymentSection();

    await userEvent.click(pm.getByRole('button', { name: '비활성화' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: '취소' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(del).not.toHaveBeenCalled();
  });

  it('실패하면 사유를 알린다', async () => {
    del.mockRejectedValue(new Error('사용 중인 결제수단입니다'));
    renderSettings();
    const pm = await paymentSection();

    await userEvent.click(pm.getByRole('button', { name: '비활성화' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));

    expect(await screen.findByText('사용 중인 결제수단입니다')).toBeTruthy();
  });
});

describe('재활성화', () => {
  const reactivate = async () => {
    renderSettings();
    const pm = await paymentSection();
    await userEvent.click(pm.getByRole('button', { name: '비활성 항목 보기' }));
    await userEvent.click(pm.getByRole('button', { name: '재활성화' }));
    return pm;
  };

  it('레코드 전체에 is_active 를 얹어 보낸다', async () => {
    await reactivate();
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));

    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/payment-methods/101', {
      ...INACTIVE, is_active: 1,
    }));
  });

  it('이름과 유형이 빠지지 않는다', async () => {
    await reactivate();
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    const sent = put.mock.calls[0][1];
    // 빠지면 서버가 NULL 로 덮으려다 스키마 제약에 걸려 500 을 낸다.
    expect(sent.name).toBe('옛날체크');
    expect(sent.type).toBe('체크');
    expect(sent.is_active).toBe(1);
  });

  it('연결 계좌도 함께 실어 보낸다', async () => {
    mockApi({ methods: [ACTIVE, { ...INACTIVE, account_id: 10 }] });
    await reactivate();
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));

    // 재활성화가 계좌 연결을 끊으면 그 결제수단의 거래가 잔액에서 통째로 빠진다.
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/payment-methods/101',
      expect.objectContaining({ account_id: 10 })));
  });

  it('취소하면 보내지 않는다', async () => {
    await reactivate();
    await userEvent.click(within(dialog()).getByRole('button', { name: '취소' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(put).not.toHaveBeenCalled();
  });

  it('성공하면 목록을 다시 읽는다', async () => {
    renderSettings();
    const pm = await paymentSection();
    await userEvent.click(pm.getByRole('button', { name: '비활성 항목 보기' }));
    const before = get.mock.calls.length;

    await userEvent.click(pm.getByRole('button', { name: '재활성화' }));
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));

    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(before));
  });

  it('실패하면 사유를 알린다', async () => {
    put.mockRejectedValue(new Error('처리 중 문제가 생겼습니다'));
    await reactivate();
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));

    expect(await screen.findByText('처리 중 문제가 생겼습니다')).toBeTruthy();
  });
});

describe('행 안에서 편집', () => {
  it('현재 값을 채운 편집 행으로 바뀐다', async () => {
    renderSettings();
    const pm = await paymentSection();

    await userEvent.click(pm.getByRole('button', { name: '편집' }));

    expect(pm.getByLabelText('하나카드 이름 수정').value).toBe('하나카드');
    expect(pm.getByLabelText('하나카드 유형 수정').value).toBe('신용');
  });

  it('저장하면 바꾼 값만 얹어 전체를 보낸다', async () => {
    renderSettings();
    const pm = await paymentSection();
    await userEvent.click(pm.getByRole('button', { name: '편집' }));

    await userEvent.clear(pm.getByLabelText('하나카드 이름 수정'));
    await userEvent.type(pm.getByLabelText('하나카드 이름 수정'), '하나체크');
    await userEvent.selectOptions(pm.getByLabelText('하나카드 유형 수정'), '체크');
    await userEvent.click(pm.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/payment-methods/100',
      expect.objectContaining({ name: '하나체크', type: '체크', is_active: 1 })));
  });

  it('저장하면 편집 행을 닫고 목록을 다시 읽는다', async () => {
    renderSettings();
    const pm = await paymentSection();
    const before = get.mock.calls.length;
    await userEvent.click(pm.getByRole('button', { name: '편집' }));

    await userEvent.click(pm.getByRole('button', { name: '저장' }));

    // 다시 안 읽으면 목록이 옛 이름을 계속 들고 있고, 다음 편집이 그 값에서 시작한다.
    await waitFor(() => expect(pm.queryByLabelText('하나카드 이름 수정')).toBeNull());
    expect(get.mock.calls.length).toBeGreaterThan(before);
  });

  it('저장이 실패하면 편집 행을 닫지 않는다', async () => {
    put.mockRejectedValue(new Error('같은 이름의 결제수단이 있습니다'));
    renderSettings();
    const pm = await paymentSection();
    await userEvent.click(pm.getByRole('button', { name: '편집' }));

    await userEvent.click(pm.getByRole('button', { name: '저장' }));

    expect(await screen.findByText('같은 이름의 결제수단이 있습니다')).toBeTruthy();
    expect(pm.getByLabelText('하나카드 이름 수정')).toBeTruthy();
  });

  it('취소하면 보내지 않고 닫는다', async () => {
    renderSettings();
    const pm = await paymentSection();
    await userEvent.click(pm.getByRole('button', { name: '편집' }));

    await userEvent.clear(pm.getByLabelText('하나카드 이름 수정'));
    await userEvent.type(pm.getByLabelText('하나카드 이름 수정'), '지워질값');
    await userEvent.click(pm.getByRole('button', { name: '취소' }));

    expect(pm.queryByLabelText('하나카드 이름 수정')).toBeNull();
    expect(put).not.toHaveBeenCalled();
  });
});
