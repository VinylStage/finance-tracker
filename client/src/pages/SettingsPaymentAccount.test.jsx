import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Settings from './Settings';
import { ConfirmProvider } from '../components/ConfirmProvider';

// 결제수단을 계좌에 잇는 화면(#376).
//
// 서버 쪽은 test/paymentMethodAccountLink.test.js 가 본다. 여기서는 **무엇을
// 보내는가**와 **무엇을 보여주는가**만 고정한다.
//
// PaymentMethodSection 이 export 되지 않아 Settings 전체를 렌더한다. 오히려
// 그게 맞다 — 이 변경의 절반이 로더에서 계좌를 실어 프롭으로 내리는 배선이고,
// 컴포넌트만 떼어 테스트하면 그 배선이 빠진 채로 통과한다.

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

const CATEGORIES = [{ id: 1, major_type: '변동필수', name: '식비', is_active: 1 }];
const ACCOUNTS = [
  { id: 10, name: '주거래통장', type: '입출금', is_active: 1 },
  { id: 11, name: '비상금통장', type: '입출금', is_active: 1 },
];
const PMS = [
  { id: 100, name: '하나카드', type: '신용', is_active: 1, account_id: null },
  { id: 101, name: '체크카드', type: '체크', is_active: 1, account_id: 11 },
];

function mockApi({ accounts = ACCOUNTS } = {}) {
  get.mockImplementation((url) => {
    if (url.startsWith('/api/categories')) return Promise.resolve(CATEGORIES);
    if (url.startsWith('/api/payment-methods')) return Promise.resolve(PMS);
    if (url.startsWith('/api/settings')) return Promise.resolve({ initial_balance: 0, monthly_income: 0 });
    if (url.startsWith('/api/recurring-rules')) return Promise.resolve([]);
    if (url.startsWith('/api/accounts')) return Promise.resolve({ data: accounts });
    return Promise.resolve([]);
  });
  post.mockResolvedValue({ id: 999 });
  put.mockResolvedValue({ ok: true });
}

const renderSettings = () => render(
  <ConfirmProvider><Settings /></ConfirmProvider>
);

// 이 화면에는 절이 여럿이고 '추가'·'저장' 같은 글자가 여러 절에 있다.
// 결제수단 절 안으로 범위를 좁히지 않으면 엉뚱한 버튼을 누른다.
const paymentSection = async () => {
  const h = await screen.findByRole('heading', { name: '결제수단 관리' });
  return within(h.closest('section'));
};

beforeEach(() => {
  vi.clearAllMocks();
  mockApi();
});

describe('계좌 목록을 불러온다', () => {
  it('설정 화면이 계좌를 조회한다', async () => {
    renderSettings();
    await screen.findByRole('heading', { name: '결제수단 관리' });
    expect(get).toHaveBeenCalledWith('/api/accounts');
  });
});

describe('추가 폼', () => {
  it('연결 계좌 드롭다운에 계좌가 나온다', async () => {
    renderSettings();
    await screen.findByRole('heading', { name: '결제수단 관리' });

    await userEvent.click((await paymentSection()).getByText('+ 추가'));

    const select = await screen.findByLabelText('연결 계좌');
    expect(within(select).getByRole('option', { name: '주거래통장' })).toBeTruthy();
    expect(within(select).getByRole('option', { name: '비상금통장' })).toBeTruthy();
    // 계좌를 안 고를 수 있어야 한다. 현금처럼 계좌가 없는 결제수단이 있다.
    expect(within(select).getByRole('option', { name: '연결 안 함' })).toBeTruthy();
  });

  it('고른 계좌를 account_id 로 보낸다', async () => {
    renderSettings();
    await screen.findByRole('heading', { name: '결제수단 관리' });
    await userEvent.click((await paymentSection()).getByText('+ 추가'));

    await userEvent.type((await paymentSection()).getByLabelText('이름'), '새카드');
    await userEvent.selectOptions(await screen.findByLabelText('연결 계좌'), '10');
    await userEvent.click((await paymentSection()).getByRole('button', { name: '추가' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    const [url, body] = post.mock.calls[0];
    expect(url).toBe('/api/payment-methods');
    expect(body.account_id).toBe('10');
    expect(body.name).toBe('새카드');
  });
});

describe('편집', () => {
  it('기존 연결이 선택된 상태로 열린다', async () => {
    renderSettings();
    await screen.findByRole('heading', { name: '결제수단 관리' });

    await userEvent.click((await paymentSection()).getAllByLabelText('편집')[1]); // 체크카드(account_id=11)

    const select = await screen.findByLabelText('체크카드 연결 계좌 수정');
    expect(select.value).toBe('11');
  });

  it('계좌를 바꿔 저장하면 그 값을 보낸다', async () => {
    renderSettings();
    await screen.findByRole('heading', { name: '결제수단 관리' });
    await userEvent.click((await paymentSection()).getAllByLabelText('편집')[0]); // 하나카드(연결 없음)

    await userEvent.selectOptions(await screen.findByLabelText('하나카드 연결 계좌 수정'), '10');
    await userEvent.click((await paymentSection()).getByText('저장'));

    await waitFor(() => expect(put).toHaveBeenCalled());
    const [url, body] = put.mock.calls[0];
    expect(url).toBe('/api/payment-methods/100');
    expect(body.account_id).toBe('10');
  });

  it('연결을 끊으면 빈 값을 보낸다', async () => {
    renderSettings();
    await screen.findByRole('heading', { name: '결제수단 관리' });
    await userEvent.click((await paymentSection()).getAllByLabelText('편집')[1]);

    await userEvent.selectOptions(await screen.findByLabelText('체크카드 연결 계좌 수정'), '');
    await userEvent.click((await paymentSection()).getByText('저장'));

    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0][1].account_id).toBe('');
  });
});

describe('계좌가 하나도 없을 때', () => {
  it('무엇을 먼저 해야 하는지 알린다', async () => {
    mockApi({ accounts: [] });
    renderSettings();
    await screen.findByRole('heading', { name: '결제수단 관리' });

    // 빈 드롭다운만 보여주면 사용자가 왜 고를 게 없는지 모른다.
    expect(await screen.findByText(/계좌를 먼저 등록하면/)).toBeTruthy();
  });
});
