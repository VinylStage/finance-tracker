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

const YEAR = String(new Date().getFullYear());

// 이름은 지어낸 것이다. 실제 카드·계좌 이름을 쓰지 않는다 — 이 저장소는 공개다.
const METHODS = [
  { id: 4, name: '예시 결제수단 갑' },
  { id: 5, name: '예시 결제수단 을' },
];

const CATEGORIES = [
  { id: 11, name: '예시분류 하나', major_type: '지출' },
  { id: 12, name: '예시분류 둘', major_type: '지출' },
];

function mockGet() {
  get.mockImplementation((url) => {
    if (url.startsWith('/api/transactions/years')) return Promise.resolve({ data: [YEAR] });
    if (url.startsWith('/api/transactions/summary/by-month')) return Promise.resolve({ data: [] });
    if (url.startsWith('/api/transactions')) return Promise.resolve({ data: [], total: 0 });
    if (url.startsWith('/api/categories')) return Promise.resolve(CATEGORIES);
    if (url.startsWith('/api/payment-methods')) return Promise.resolve(METHODS);
    if (url.startsWith('/api/card-products')) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
}

function renderPage() {
  return render(<ConfirmProvider><Transactions /></ConfirmProvider>);
}

// 서버로 나간 주소 중 조건을 실어 보내는 것들만 모은다.
function queriedUrls() {
  return get.mock.calls
    .map((c) => String(c[0]))
    .filter((u) => u.includes('/api/transactions'));
}

// 어떤 요청에든 이 조건이 실렸는가. 값은 주소에 인코딩돼 실리므로
// URLSearchParams 로 풀어서 본다 — 글자로 맞추면 한글에서 깨진다.
async function expectSent(key, value) {
  await waitFor(() => {
    const hit = queriedUrls().some((u) => {
      const q = new URLSearchParams(u.split('?')[1] || '');
      return q.get(key) === value;
    });
    expect(hit).toBe(true);
  });
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

describe('검색 칸이 서버로 실린다', () => {
  it('메모 검색어가 실린다', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByLabelText('메모 검색'), '회식');
    await expectSent('memo', '회식');
  });

  it('최소 금액이 실린다', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByLabelText('최소 금액'), '30000');
    await expectSent('min_amount', '30000');
  });

  it('최대 금액이 실린다', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByLabelText('최대 금액'), '50000');
    await expectSent('max_amount', '50000');
  });

  it('금액 0 도 조건이다', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByLabelText('최소 금액'), '0');
    await expectSent('min_amount', '0');
  });

  it('결제수단을 고르면 실린다', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.selectOptions(await screen.findByLabelText('결제수단 필터'), '5');
    await expectSent('payment_method_id', '5');
  });

  it('아무것도 안 넣으면 조건이 안 실린다', async () => {
    renderPage();
    await waitFor(() => expect(queriedUrls().length).toBeGreaterThan(0));
    for (const u of queriedUrls()) {
      const q = new URLSearchParams(u.split('?')[1] || '');
      expect(q.get('memo')).toBe(null);
      expect(q.get('min_amount')).toBe(null);
      expect(q.get('payment_method_id')).toBe(null);
      expect(q.get('category_id')).toBe(null);
    }
  });
});
