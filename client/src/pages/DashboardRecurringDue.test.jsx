import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Dashboard from './Dashboard';

// 대시보드의 **반복 거래 확인**과 **섹션 접힘 상태**. Dashboard.jsx 는 691줄인데
// 전용 테스트 파일이 없었고 페이지 스모크로만 스쳐 지나갔다.
//
// 이 두 축을 먼저 잡는 이유:
//
// 반복 거래는 **등록해도 자동으로 거래가 생기지 않는다.** 매달 여기서 확인해야
// 비로소 장부에 들어간다(#279). 이 자리가 조용히 사라지면 사용자는 등록만 해
// 두고 몇 달치를 통째로 빠뜨린다 — 그리고 화면에는 아무 표시도 안 난다.
//
// 접힘 상태는 sessionStorage 에 남는다. 안 남으면 매번 펼쳐야 하고, 잘못
// 남으면 사용자가 접어 둔 것이 자꾸 열린다.

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

const DASH = {
  thisMonth: '2026-08', income: 3000000, expense: 1200000,
  available: 1800000, installmentsDue: 200000,
  budgets: [], categoryBreakdown: [], topMerchants: [],
  dailyTrend: [], weeklyTrend: [], monthlyTrend: [],
};

const DUE = [
  { id: 31, merchant: '넷플릭스', category_name: '구독료', day_of_month: 15, amount: 17000 },
  { id: 32, merchant: '헬스장', category_name: '건강', day_of_month: 5, amount: 60000 },
];

function mockApi({ due = DUE, dash = DASH } = {}) {
  get.mockImplementation((url) => {
    if (url.startsWith('/api/recurring-rules/due')) return Promise.resolve({ data: due });
    if (url.startsWith('/api/transactions/summary/dashboard')) return Promise.resolve(dash);
    if (url.startsWith('/api/debts')) return Promise.resolve({ data: [], total_balance: 0 });
    return Promise.resolve({ data: [] });
  });
  post.mockResolvedValue({ ok: true });
}

const settled = () => screen.findByText('2026-08 대시보드');
const dueCalls = () => get.mock.calls.filter(([u]) => u.startsWith('/api/recurring-rules/due')).length;
const dashCalls = () => get.mock.calls.filter(([u]) => u.includes('summary/dashboard')).length;

// 그 규칙의 줄 안에서 버튼을 찾는다. 화면 전체에서 '생성' 을 누르면 어느 규칙을
// 만드는지 모른 채 통과한다.
function row(merchant) {
  return within(screen.getByText(merchant).closest('div').parentElement);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApi();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('이번 달 반복 거래 확인', () => {
  it('밀린 규칙이 있으면 목록으로 보여준다', async () => {
    render(<Dashboard />);
    await settled();

    expect(await screen.findByText('이번 달 반복 거래 확인')).toBeTruthy();
    expect(screen.getByText('넷플릭스')).toBeTruthy();
    expect(screen.getByText('구독료 · 매월 15일')).toBeTruthy();
    expect(screen.getByText('17,000원')).toBeTruthy();
  });

  it('몇 건인지 함께 적는다', async () => {
    render(<Dashboard />);
    await settled();

    expect(await screen.findByText('2건')).toBeTruthy();
  });

  it('밀린 것이 없으면 이 절 자체를 띄우지 않는다', async () => {
    mockApi({ due: [] });
    render(<Dashboard />);
    await settled();

    // 빈 절을 남겨 두면 매달 "할 일 없음" 이 자리를 차지하고, 진짜 있을 때
    // 눈에 덜 띈다.
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/recurring-rules/due'));
    expect(screen.queryByText('이번 달 반복 거래 확인')).toBeNull();
  });

  it('생성하면 그 규칙만 확정한다', async () => {
    render(<Dashboard />);
    await settled();
    await screen.findByText('넷플릭스');

    await userEvent.click(row('헬스장').getByRole('button', { name: '생성' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/recurring-rules/32/confirm', {}));
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('생성하면 목록과 대시보드를 함께 다시 읽는다', async () => {
    render(<Dashboard />);
    await settled();
    await screen.findByText('넷플릭스');
    const beforeDue = dueCalls();
    const beforeDash = dashCalls();

    await userEvent.click(row('넷플릭스').getByRole('button', { name: '생성' }));

    // 거래가 새로 생겼으므로 이번달 수입·지출도 바뀐다. 목록만 갱신하면
    // 위쪽 숫자가 옛 값으로 남는다.
    await waitFor(() => expect(dueCalls()).toBeGreaterThan(beforeDue));
    await waitFor(() => expect(dashCalls()).toBeGreaterThan(beforeDash));
  });

  it('건너뛰면 목록만 다시 읽는다', async () => {
    render(<Dashboard />);
    await settled();
    await screen.findByText('넷플릭스');
    const beforeDash = dashCalls();

    await userEvent.click(row('넷플릭스').getByRole('button', { name: '건너뛰기' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/recurring-rules/31/skip', {}));
    // 건너뛰기는 거래를 만들지 않는다. 대시보드까지 다시 읽을 이유가 없다.
    expect(dashCalls()).toBe(beforeDash);
  });

  it('처리하는 동안 그 줄의 버튼을 잠근다', async () => {
    let release;
    post.mockImplementation(() => new Promise((r) => { release = () => r({ ok: true }); }));
    render(<Dashboard />);
    await settled();
    await screen.findByText('넷플릭스');

    await userEvent.click(row('넷플릭스').getByRole('button', { name: '생성' }));

    // 두 번 누르면 같은 달에 거래가 두 건 생긴다.
    expect(row('넷플릭스').getByRole('button', { name: '생성' }).disabled).toBe(true);
    expect(row('넷플릭스').getByRole('button', { name: '건너뛰기' }).disabled).toBe(true);
    // 다른 줄은 잠기지 않는다 — 한 건 처리하는 동안 화면 전체가 멈추면 안 된다.
    expect(row('헬스장').getByRole('button', { name: '생성' }).disabled).toBe(false);

    release();
  });

  it('처리가 끝나면 잠금을 푼다', async () => {
    render(<Dashboard />);
    await settled();
    await screen.findByText('넷플릭스');

    await userEvent.click(row('넷플릭스').getByRole('button', { name: '생성' }));

    // 안 풀면 그 줄이 영영 눌리지 않아 다음 달에도 못 만든다.
    await waitFor(() => expect(
      row('넷플릭스').getByRole('button', { name: '생성' }).disabled).toBe(false));
  });
});

describe('섹션 접힘 상태', () => {
  const NETWORTH = '순자산 추이';

  it('접힘 섹션은 기본으로 닫혀 있다', async () => {
    render(<Dashboard />);
    await settled();

    const details = screen.getByText(NETWORTH).closest('details');
    expect(details.open).toBe(false);
  });

  it('펼치면 세션에 남는다', async () => {
    render(<Dashboard />);
    await settled();

    await userEvent.click(screen.getByText(NETWORTH));

    // 안 남기면 대시보드에 올 때마다 다시 펼쳐야 한다.
    await waitFor(() => expect(window.sessionStorage.getItem('dash.section.networth')).toBe('1'));
  });

  it('세션에 남은 상태로 다시 연다', async () => {
    window.sessionStorage.setItem('dash.section.networth', '1');
    render(<Dashboard />);
    await settled();

    expect(screen.getByText(NETWORTH).closest('details').open).toBe(true);
  });

  it('접은 것도 그대로 남는다', async () => {
    window.sessionStorage.setItem('dash.section.networth', '1');
    render(<Dashboard />);
    await settled();

    await userEvent.click(screen.getByText(NETWORTH));

    // 접힘만 저장하고 펼침을 안 저장하면(또는 반대면) 사용자가 접어 둔 것이
    // 자꾸 열린다.
    await waitFor(() => expect(window.sessionStorage.getItem('dash.section.networth')).toBe('0'));
  });

  it('섹션마다 따로 기억한다', async () => {
    window.sessionStorage.setItem('dash.section.networth', '1');
    render(<Dashboard />);
    await settled();

    expect(screen.getByText(NETWORTH).closest('details').open).toBe(true);
    // 키가 뭉치면 하나를 펼칠 때 나머지가 함께 열린다.
    expect(screen.getByText('부채 잔액 추이').closest('details').open).toBe(false);
  });
});
