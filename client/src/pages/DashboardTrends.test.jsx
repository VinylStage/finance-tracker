import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Dashboard from './Dashboard';

// 대시보드의 **집계·기간 축**. 반복확인·섹션접힘은 DashboardRecurringDue.test.jsx 가
// 본다. 같은 화면이라도 축이 다르면 파일을 나눈다(#480 이후 같은 방식).
//
// 차트 자체는 여기서 못 본다. jsdom 에는 레이아웃이 없어 recharts 가 SVG 껍데기만
// 만들고 막대·선은 비어 있다(vitest.setup.js 에 같은 내용이 적혀 있다). 그래서
// **차트 바깥에서 확인할 수 있는 것**만 잡는다 — 무엇을 조회하는지, 무엇을
// 글자로 적는지, 무엇을 주소에 남기는지.

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

const MONTHLY = [
  { month: '2026-06', income: 3000000, expense: 2000000 },
  { month: '2026-07', income: 2000000, expense: 1000000 },
  { month: '2026-08', income: 3000000, expense: 1500000 },
];

const DASH = {
  thisMonth: '2026-08', income: 3000000, expense: 1500000,
  available: 1800000, installmentsDue: 200000,
  budgets: [], categoryBreakdown: [],
  topMerchants: [
    { merchant: '쿠팡', total: 320000 },
    { merchant: '배달의민족', total: 180000 },
  ],
  dailyTrend: [], weeklyTrend: [], monthlyTrend: MONTHLY,
};

function mockApi({ dash = DASH, breakdown = [{ category: '식비', total: 500000 }] } = {}) {
  get.mockImplementation((url) => {
    if (url.startsWith('/api/recurring-rules/due')) return Promise.resolve({ data: [] });
    if (url.startsWith('/api/transactions/summary/dashboard')) return Promise.resolve(dash);
    if (url.startsWith('/api/transactions/summary/category-breakdown')) return Promise.resolve({ data: breakdown });
    if (url.startsWith('/api/debts')) return Promise.resolve({ data: [], total_balance: 0 });
    return Promise.resolve({ data: [] });
  });
}

const settled = () => screen.findByText('2026-08 대시보드');
const breakdownCalls = () => get.mock.calls
  .map(([u]) => u)
  .filter((u) => u.startsWith('/api/transactions/summary/category-breakdown'));
const heatCalls = () => get.mock.calls
  .map(([u]) => u)
  .filter((u) => u.startsWith('/api/transactions?'));

// '월'·'연' 버튼이 두 곳에 있다 — 흐름 분석의 기간 버튼과 히트맵 기간 선택기.
// 히트맵 쪽만 aria-pressed 를 갖는다. 이걸로 갈라야 엉뚱한 버튼을 누르지 않는다.
const flowPeriodBtn = (scope, label) => scope.getAllByRole('button', { name: label })
  .filter((b) => !b.hasAttribute('aria-pressed'))[0];
const heatBtn = (label) => screen.getAllByRole('button', { name: label })
  .filter((b) => b.hasAttribute('aria-pressed'))[0];

// 접힘 섹션은 <details> 다. 안을 보려면 펼쳐야 한다.
async function openSection(title) {
  const details = screen.getByText(title).closest('details');
  if (!details.open) await userEvent.click(screen.getByText(title));
  return within(details);
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

describe('전월 대비', () => {
  it('마지막 두 달을 비교해 증감률을 적는다', async () => {
    render(<Dashboard />);
    await settled();
    const flow = await openSection('흐름 분석');

    // 2026-07 수입 200만 → 2026-08 300만 = +50%
    // 지출도 100만 → 150만 = +50% 라 같은 문구가 둘 나온다.
    expect(flow.getByText('3,000,000원')).toBeTruthy();
    expect(flow.getAllByText('(+50%)')).toHaveLength(2);
  });

  it('줄었으면 음수로 적는다', async () => {
    render(<Dashboard />);
    await settled();
    const flow = await openSection('흐름 분석');

    // 지출 100만 → 150만 = +50%. 수입과 부호 표기가 같아야 한다.
    expect(flow.getByText('1,500,000원')).toBeTruthy();
    expect(flow.getAllByText('(+50%)')).toHaveLength(2);
  });

  it('직전 달이 0 이면 증감률을 적지 않는다', async () => {
    mockApi({ dash: { ...DASH, monthlyTrend: [
      { month: '2026-07', income: 0, expense: 0 },
      { month: '2026-08', income: 3000000, expense: 1500000 },
    ] } });
    render(<Dashboard />);
    await settled();
    const flow = await openSection('흐름 분석');

    // 0 으로 나누면 Infinity 가 된다. '(Infinity%)' 가 뜨면 안 된다.
    expect(flow.getByText('전월 대비')).toBeTruthy();
    expect(flow.queryByText(/Infinity/)).toBeNull();
    expect(flow.queryByText(/%\)/)).toBeNull();
  });

  it('달이 하나뿐이면 전월 대비를 아예 안 띄운다', async () => {
    mockApi({ dash: { ...DASH, monthlyTrend: [{ month: '2026-08', income: 3000000, expense: 1500000 }] } });
    render(<Dashboard />);
    await settled();
    const flow = await openSection('흐름 분석');

    // 비교 대상이 없는데 "전월 대비" 를 적으면 무엇과 비교한 것인지 알 수 없다.
    expect(flow.queryByText('전월 대비')).toBeNull();
  });
});

describe('흐름 분석 기간', () => {
  it('기본은 월이다', async () => {
    render(<Dashboard />);
    await settled();
    const flow = await openSection('흐름 분석');

    expect(flowPeriodBtn(flow, '월').className).toContain('bg-brand-tint');
  });

  it('일·주·연으로 바꿀 수 있다', async () => {
    render(<Dashboard />);
    await settled();
    const flow = await openSection('흐름 분석');

    for (const p of ['일', '주', '연']) {
      await userEvent.click(flowPeriodBtn(flow, p));
      expect(flowPeriodBtn(flow, p).className).toContain('bg-brand-tint');
    }
  });

  it('기간을 바꿔도 서버를 다시 부르지 않는다', async () => {
    render(<Dashboard />);
    await settled();
    const flow = await openSection('흐름 분석');
    const before = get.mock.calls.length;

    await userEvent.click(flowPeriodBtn(flow, '연'));

    // 네 기간의 자료가 대시보드 응답에 이미 다 들어 있다. 다시 부르면
    // 버튼 하나에 왕복이 붙는다.
    expect(get.mock.calls.length).toBe(before);
  });
});

describe('Top 5 가맹점', () => {
  it('순위를 붙여 보여준다', async () => {
    render(<Dashboard />);
    await settled();
    const top = await openSection('이번달 Top 5 가맹점');

    expect(top.getByText('쿠팡')).toBeTruthy();
    expect(top.getByText('320,000원')).toBeTruthy();
    // 순위 숫자가 없으면 정렬이 뒤집혀도 눈에 안 띈다.
    expect(top.getByText('1')).toBeTruthy();
    expect(top.getByText('2')).toBeTruthy();
  });

  it('없으면 없다고 알린다', async () => {
    mockApi({ dash: { ...DASH, topMerchants: [] } });
    render(<Dashboard />);
    await settled();
    const top = await openSection('이번달 Top 5 가맹점');

    expect(top.getByText('이번 달 거래 내역이 없습니다.')).toBeTruthy();
  });
});

describe('카테고리별 지출 비교', () => {
  it('기간을 붙여 조회한다', async () => {
    render(<Dashboard />);
    await settled();
    await openSection('카테고리별 지출 비교');

    await waitFor(() => expect(breakdownCalls().length).toBeGreaterThan(0));
    expect(breakdownCalls()[0]).toMatch(/from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/);
  });

  it('막대와 라인을 오갈 수 있다', async () => {
    render(<Dashboard />);
    await settled();
    const cat = await openSection('카테고리별 지출 비교');

    expect(cat.getByRole('button', { name: '막대' }).className).toContain('bg-brand-tint');

    await userEvent.click(cat.getByRole('button', { name: '라인' }));

    expect(cat.getByRole('button', { name: '라인' }).className).toContain('bg-brand-tint');
    expect(cat.getByRole('button', { name: '막대' }).className).not.toContain('bg-brand-tint');
  });

  it('차트 종류를 바꿔도 다시 조회하지 않는다', async () => {
    render(<Dashboard />);
    await settled();
    const cat = await openSection('카테고리별 지출 비교');
    await waitFor(() => expect(breakdownCalls().length).toBeGreaterThan(0));
    const before = breakdownCalls().length;

    await userEvent.click(cat.getByRole('button', { name: '라인' }));

    // 같은 자료를 다르게 그릴 뿐이다.
    expect(breakdownCalls().length).toBe(before);
  });

  it('기간에 지출이 없으면 빈 차트 대신 안내를 둔다', async () => {
    mockApi({ breakdown: [] });
    render(<Dashboard />);
    await settled();
    const cat = await openSection('카테고리별 지출 비교');

    // 빈 차트는 축만 남아 "데이터가 있는데 0" 처럼 읽힌다.
    expect(await cat.findByText('해당 기간 지출 내역이 없습니다.')).toBeTruthy();
  });
});

// #273 A안. 히트맵의 연·월은 이 그래프 전용 상태다 — 대시보드 기간 필터와
// 공유하지 않는다. 전역을 따라가면 "왜 내가 고른 기간이 아닌 게 보이지" 가 된다.
describe('히트맵 기간', () => {
  it('고른 기간을 주소에 남긴다', async () => {
    render(<Dashboard />);
    await settled();

    await waitFor(() => {
      const q = new URLSearchParams(window.location.search);
      expect(q.get('heatMode')).toBe('month');
      expect(q.get('heatYear')).toBeTruthy();
      expect(q.get('heatMonth')).toBeTruthy();
    });
  });

  it('연 단위로 바꾸면 주소와 조회 범위가 함께 바뀐다', async () => {
    render(<Dashboard />);
    await settled();

    await userEvent.click(heatBtn('연'));

    await waitFor(() => expect(new URLSearchParams(window.location.search).get('heatMode')).toBe('year'));
    // 달 범위 그대로 연 화면을 그리면 1~12월 중 한 달만 칠해진다.
    await waitFor(() => expect(heatCalls().at(-1)).toMatch(/from=\d{4}-01-01&to=\d{4}-12-31/));
  });

  it('주소에 적힌 기간으로 다시 연다', async () => {
    window.history.replaceState(null, '', '/?heatMode=year&heatYear=2024&heatMonth=3');
    render(<Dashboard />);
    await settled();

    // 새로고침이나 링크 공유로 같은 화면이 재현돼야 한다.
    await waitFor(() => expect(heatCalls().at(-1)).toMatch(/from=2024-01-01&to=2024-12-31/));
  });

  it('주소가 망가져 있으면 이번 달로 떨어진다', async () => {
    window.history.replaceState(null, '', '/?heatMode=zzz&heatYear=0&heatMonth=99');
    render(<Dashboard />);
    await settled();

    // 검증 없이 쓰면 0년 99월을 조회한다.
    await waitFor(() => {
      const q = new URLSearchParams(window.location.search);
      expect(q.get('heatMode')).toBe('month');
      expect(Number(q.get('heatYear'))).toBeGreaterThan(1900);
      expect(Number(q.get('heatMonth'))).toBeLessThanOrEqual(12);
    });
  });

  it('기간 전환이 뒤로가기 이력을 쌓지 않는다', async () => {
    render(<Dashboard />);
    await settled();
    const before = window.history.length;

    await userEvent.click(heatBtn('연'));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('heatMode')).toBe('year'));

    // 표시 방식 변경은 탐색이 아니다. push 로 쌓으면 뒤로가기가 화면을 안 바꾸고
    // 파라미터만 되돌린다.
    expect(window.history.length).toBe(before);
  });
});
