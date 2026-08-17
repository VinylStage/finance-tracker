import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Dashboard from './Dashboard';

// 흐름 분석이 **차트에 넘긴 자료**를 잠근다(#616).
//
// 기존 dashboardPeriodAxis.test.jsx 는 버튼의 눌림 상태까지만 봤다. 「연」 은 자료를
// 접는 계산(yearlyFromMonthly)이 붙는데, 그 접기가 깨져도 화면은 멀쩡해 보인다.
//
// jsdom 에는 레이아웃이 없어 recharts 가 값을 그리지 않는다. 그래서 ComposedChart 를
// 목으로 바꿔 들어온 data 를 JSON 으로 내보낸다 — 차트 렌더가 아니라 **자료 고르기**를
// 검사하는 것이 목적이다.

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

vi.mock('recharts', () => {
  const Stub = () => null;
  return {
    ResponsiveContainer: ({ children }) => <div>{children}</div>, Tooltip: Stub,
    AreaChart: Stub, Area: Stub, LineChart: Stub, Line: Stub, BarChart: Stub, Bar: Stub,
    ComposedChart: ({ data }) => <div data-testid="flow-data">{JSON.stringify(data)}</div>,
    XAxis: Stub, YAxis: Stub, CartesianGrid: Stub,
    PieChart: Stub, Pie: Stub, Cell: Stub, Legend: Stub,
  };
});

// 두 해에 걸친 월별 추이. 연 단위로 접으면 2025 한 줄, 2026 한 줄이 된다.
const MONTHLY = [
  { month: '2025-11', income: 1000000, expense: 400000 },
  { month: '2025-12', income: 2000000, expense: 600000 },
  { month: '2026-07', income: 3000000, expense: 1000000 },
  { month: '2026-08', income: 4000000, expense: 1500000 },
];

const DASH = {
  thisMonth: '2026-08', income: 4000000, expense: 1500000,
  available: 1800000, installmentsDue: 0,
  budgets: [], categoryBreakdown: [], topMerchants: [],
  dailyTrend: [{ date: '2026-08-01', income: 0, expense: 30000 }],
  weeklyTrend: [{ week: '2026-W31', income: 0, expense: 50000 }],
  monthlyTrend: MONTHLY,
};

function mockApi(dash = DASH) {
  get.mockImplementation((url) => {
    if (url.startsWith('/api/transactions/summary/dashboard')) return Promise.resolve(dash);
    if (url.startsWith('/api/debts')) return Promise.resolve({ data: [], total_balance: 0 });
    return Promise.resolve({ data: [] });
  });
}

// 흐름 분석 섹션은 접혀 있을 수 있다. 안을 보려면 펼친다.
async function openFlow(user) {
  const label = await screen.findByText('흐름 분석');
  const details = label.closest('details');
  if (!details.open) await user.click(label);
  return details;
}

// 섹션 안에서 기간 버튼을 글자로 찾는다.
function flowBtn(details, label) {
  return [...details.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
}

// 차트에 들어간 자료를 읽는다.
async function flowData() {
  const node = await screen.findByTestId('flow-data');
  return JSON.parse(node.textContent);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApi();
});

describe('흐름 분석의 기간 축 자료 고르기', () => {
  it('연으로 바꾸면 같은 해가 한 줄로 접힌다', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    const details = await openFlow(user);
    const yearBtn = flowBtn(details, '연');
    await user.click(yearBtn);
    const data = await flowData();
    
    expect(data).toHaveLength(2);
    expect(data[0]).toEqual({ year: '2025', income: 3000000, expense: 1000000 });
  });

  it('해가 다르면 줄이 갈린다', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    const details = await openFlow(user);
    const yearBtn = flowBtn(details, '연');
    await user.click(yearBtn);
    const data = await flowData();
    
    expect(data[1]).toEqual({ year: '2026', income: 7000000, expense: 2500000 });
  });

  it('월은 접지 않고 그대로 넘긴다', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    const details = await openFlow(user);
    // 기간을 바꾸지 않고(처음이 «월» 이다) flowData() 를 읽는다.
    const data = await flowData();
    
    expect(data).toHaveLength(4);
    expect(data).toEqual(MONTHLY);
  });

  it('주는 주간 자료를 그대로 넘긴다', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    const details = await openFlow(user);
    const weekBtn = flowBtn(details, '주');
    await user.click(weekBtn);
    const data = await flowData();
    
    expect(data).toEqual(DASH.weeklyTrend);
  });

  it('일은 일간 자료를 그대로 넘긴다', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    const details = await openFlow(user);
    const dayBtn = flowBtn(details, '일');
    await user.click(dayBtn);
    const data = await flowData();
    
    expect(data).toEqual(DASH.dailyTrend);
  });

  it('월별 자료가 없어도 연 단위가 터지지 않는다', async () => {
    const user = userEvent.setup();
    mockApi({ ...DASH, monthlyTrend: [] });
    render(<Dashboard />);
    const details = await openFlow(user);
    const yearBtn = flowBtn(details, '연');
    await user.click(yearBtn);
    const data = await flowData();
    
    expect(data).toEqual([]);
  });
});
