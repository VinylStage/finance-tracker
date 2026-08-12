import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Transactions from './Transactions';
import { ConfirmProvider } from '../components/ConfirmProvider';

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

const navigate = vi.fn();
vi.mock('wouter', () => ({ useLocation: () => ['/transactions', navigate] }));

// 달력은 «지금 달» 을 연다. 픽스처 날짜도 그 달로 맞춘다 — 고정 날짜를 쓰면
// 달이 바뀌는 날 테스트가 깨진다.
const now = new Date();
const YEAR = String(now.getFullYear());
const MONTH = `${YEAR}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const DAY3 = `${MONTH}-03`;
const DAY7 = `${MONTH}-07`;

// 날짜 칸의 접근명은 «8월 3일 · 지출 …» 처럼 길고 금액이 섞인다.
// 앞부분만 정규식으로 맞춘다.
const M = now.getMonth() + 1;
const dayCell = (d) => new RegExp(`^${M}월 ${d}일`);

// 이름은 지어낸 것이다. 실제 가맹점 이름을 쓰지 않는다 — 이 저장소는 공개다.
const ITEMS = [
  { id: 1, date: DAY3, merchant: '예시가맹점 갑', amount: 12000, major_type: '지출' },
  { id: 2, date: DAY3, merchant: '예시가맹점 을', amount: 3000, major_type: '지출' },
  { id: 3, date: DAY7, merchant: '예시가맹점 병', amount: 50000, major_type: '지출' },
];

function mockGet({ items = ITEMS, total = null } = {}) {
  get.mockImplementation((url) => {
    if (url.startsWith('/api/transactions/years')) return Promise.resolve({ data: [YEAR] });
    if (url.startsWith('/api/transactions/summary/by-month')) return Promise.resolve({ data: [] });
    if (url.startsWith('/api/transactions')) {
      return Promise.resolve({ data: items, total: total === null ? items.length : total });
    }
    if (url.startsWith('/api/categories')) return Promise.resolve([]);
    if (url.startsWith('/api/payment-methods')) return Promise.resolve([]);
    if (url.startsWith('/api/card-products')) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
}

function renderPage() {
  return render(<ConfirmProvider><Transactions /></ConfirmProvider>);
}

// 달력으로 바꾸고, 읽기가 끝날 때까지 기다린다.
async function openCalendar(user) {
  await user.click(await screen.findByRole('button', { name: '달력' }));
  await waitFor(() => expect(screen.queryByText('불러오는 중...')).toBeNull());
}

beforeEach(() => {
  get.mockReset(); post.mockReset(); put.mockReset(); del.mockReset();
  navigate.mockReset();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/transactions');
  mockGet();
});

afterEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/transactions');
});

describe('다 못 보여줄 때 알린다', () => {
  it('서버가 자른 만큼을 그대로 말한다', async () => {
    mockGet({ items: ITEMS, total: 120 });
    const user = userEvent.setup();
    renderPage();
    await openCalendar(user);

    expect(screen.getByText('이 달 거래 120건 중 3건까지 반영됩니다.')).toBeTruthy();
  });

  it('다 보여줬으면 그 안내를 만들지 않는다', async () => {
    const user = userEvent.setup();
    renderPage();
    await openCalendar(user);

    expect(screen.queryByText(/까지 반영됩니다/)).toBe(null);
  });
});
