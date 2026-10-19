import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import Transactions from './Transactions';
import { ConfirmProvider } from '../components/ConfirmProvider';

// #733 — 오늘·이번 달·올해는 렌더할 때 구한다. 모듈을 불러온 **뒤** 시계를 옮겨
// 「탭을 연 채 자정을 넘긴」 상황을 만든다. Date 만 가짜로 둔다(waitFor 폴링은 진짜 타이머).

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../lib/api', () => ({ api: { get, post: vi.fn(), put: vi.fn(), del: vi.fn() }, ApiError: class extends Error {} }));
vi.mock('wouter', () => ({ useLocation: () => ['/transactions', vi.fn()] }));

function mockGet(years, summaries = []) {
  // 초기화는 여기서 한다. afterEach 에서 하면 언마운트 전에 남은 effect 가 빈 모킹을
  // 불러 undefined.then 으로 죽는다.
  get.mockReset();
  get.mockImplementation((url) => {
    if (url.startsWith('/api/transactions/years')) return Promise.resolve({ data: years });
    if (url.startsWith('/api/transactions/summary/by-month')) return Promise.resolve({ data: summaries });
    if (url.startsWith('/api/transactions')) return Promise.resolve({ data: [], total: 0 });
    if (url.startsWith('/api/card-products')) return Promise.resolve({ data: [] });
    if (url.startsWith('/api/categories') || url.startsWith('/api/payment-methods')) return Promise.resolve([]);
    return Promise.resolve({ data: [] });
  });
}

function moveClockTo(y, m, d) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(y, m - 1, d, 0, 1));
}

const renderPage = () => render(<ConfirmProvider><Transactions /></ConfirmProvider>);
const byMonthCalls = () => get.mock.calls.map(([u]) => u).filter((u) => u.startsWith('/api/transactions/summary/by-month'));

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState(null, '', '/transactions');
  window.sessionStorage.clear();
});

describe('거래내역의 오늘 (#733)', () => {
  it('올해는 렌더 시점의 연도로 고른다', async () => {
    moveClockTo(2027, 3, 15);
    mockGet(['2026', '2027'], [{ month: '2027-03', income: 0, expense: 0, count: 0 }]);
    renderPage();
    await waitFor(() => expect(byMonthCalls().some((u) => u.includes('year=2027'))).toBe(true));
  });

  it('올해 자료가 없으면 목록의 첫 연도를 고른다', async () => {
    moveClockTo(2027, 3, 15);
    mockGet(['2026', '2025']);
    renderPage();
    await waitFor(() => expect(byMonthCalls().some((u) => u.includes('year=2026'))).toBe(true));
  });

  it('달력의 기본 달은 렌더 시점의 이번 달이다', async () => {
    moveClockTo(2027, 3, 15);
    window.history.replaceState(null, '', '/transactions?txView=calendar');
    mockGet(['2027']);
    renderPage();
    expect(await screen.findByText('2027년 3월')).toBeTruthy();
  });

  it('주소에 달이 있으면 그 달을 연다', async () => {
    moveClockTo(2027, 3, 15);
    window.history.replaceState(null, '', '/transactions?txView=calendar&txMonth=2026-05');
    mockGet(['2026', '2027']);
    renderPage();
    expect(await screen.findByText('2026년 5월')).toBeTruthy();
  });
});
