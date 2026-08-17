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

describe('카테고리 필터', () => {
  it('아무것도 안 고르면 전체라고 적는다', async () => {
    renderPage();
    expect(await screen.findByText(/카테고리 \(전체\)/)).toBeTruthy();
  });

  it('하나 고르면 그 번호가 실리고 개수를 적는다', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('예시분류 하나'));

    await expectSent('category_id', '11');
    expect(screen.getByText(/카테고리 \(1개 선택됨\)/)).toBeTruthy();
  });

  it('여러 개 고르면 쉼표로 이어 실린다', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('예시분류 하나'));
    await user.click(await screen.findByText('예시분류 둘'));

    await expectSent('category_id', '11,12');
    expect(screen.getByText(/카테고리 \(2개 선택됨\)/)).toBeTruthy();
  });

  it('다시 누르면 풀린다', async () => {
    const user = userEvent.setup();
    renderPage();
    const chip = await screen.findByText('예시분류 하나');
    await user.click(chip);
    expect(screen.getByText(/카테고리 \(1개 선택됨\)/)).toBeTruthy();

    await user.click(chip);
    expect(screen.getByText(/카테고리 \(전체\)/)).toBeTruthy();
  });
});

describe('필터 초기화', () => {
  it('검색어와 카테고리를 함께 비운다', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText('메모 검색'), '회식');
    await user.click(await screen.findByText('예시분류 하나'));
    expect(screen.getByText(/카테고리 \(1개 선택됨\)/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '필터 초기화' }));

    expect(screen.getByLabelText('메모 검색').value).toBe('');
    expect(screen.getByText(/카테고리 \(전체\)/)).toBeTruthy();
  });
});
