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

// 이 화면은 wouter 의 useLocation 만 쓴다. 라우터를 통째로 세우지 않는다.
const navigate = vi.fn();
vi.mock('wouter', () => ({ useLocation: () => ['/transactions', navigate] }));

const YEAR = String(new Date().getFullYear());

// 주소가 여럿이라 URL 로 갈라 답한다.
function mockGet({ years = [YEAR], summaries = [], items = [] } = {}) {
  get.mockImplementation((url) => {
    if (url.startsWith('/api/transactions/years')) return Promise.resolve({ data: years });
    if (url.startsWith('/api/transactions/summary/by-month')) return Promise.resolve({ data: summaries });
    if (url.startsWith('/api/transactions')) return Promise.resolve({ data: items, total: items.length });
    if (url.startsWith('/api/categories')) return Promise.resolve([]);
    if (url.startsWith('/api/payment-methods')) return Promise.resolve([]);
    if (url.startsWith('/api/card-products')) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
}

function renderPage() {
  return render(<ConfirmProvider><Transactions /></ConfirmProvider>);
}

beforeEach(() => {
  get.mockReset(); post.mockReset(); put.mockReset(); del.mockReset();
  navigate.mockReset();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/transactions');
});

afterEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/transactions');
});

describe('거래 내역 화면', () => {
  it('거래가 하나도 없으면 빈 상태를 알린다', async () => {
    mockGet({ years: [] });
    renderPage();
    
    const emptyState = await screen.findByText('아직 거래가 없어요');
    expect(emptyState).toBeTruthy();
  });

  it('불러오기가 실패하면 오류를 알린다', async () => {
    get.mockRejectedValue(new Error('불러오지 못했습니다'));
    renderPage();

    // 로딩 문구는 실패하는 순간 사라진다. 그것을 기다리면 경합이 된다 —
    // 최종 상태인 오류 표시만 본다.
    await waitFor(() => {
      expect(screen.queryByText('로딩 중...')).toBeNull();
      expect(screen.queryByText('불러오지 못했습니다')).toBeTruthy();
    });
  });

  it('처음에는 목록 보기다', async () => {
    mockGet();
    renderPage();
    
    const listButton = await screen.findByText('목록');
    const calendarButton = await screen.findByText('달력');
    
    expect(listButton.getAttribute('aria-pressed')).toBe('true');
    expect(calendarButton.getAttribute('aria-pressed')).toBe('false');
  });

  it('달력으로 바꾸면 URL 에 남는다', async () => {
    mockGet();
    renderPage();
    
    const calendarButton = await screen.findByText('달력');
    const user = userEvent.setup();
    await user.click(calendarButton);
    
    await waitFor(() => {
      expect(window.location.search).toContain('txView=calendar');
      expect(window.location.search).toContain('txMonth=');
    });
  });

  it('목록으로 되돌리면 URL 에서 지워진다 (#272)', async () => {
    mockGet();
    renderPage();
    
    const calendarButton = await screen.findByText('달력');
    const user = userEvent.setup();
    await user.click(calendarButton);
    
    // 달력에서 목록으로 전환
    const listButton = await screen.findByText('목록');
    await user.click(listButton);
    
    await waitFor(() => {
      expect(window.location.search).not.toContain('txView=');
    });
  });

  it('달력 상태를 세션에도 남긴다', async () => {
    mockGet();
    renderPage();
    
    const calendarButton = await screen.findByText('달력');
    const user = userEvent.setup();
    await user.click(calendarButton);
    
    await waitFor(() => {
      const stored = JSON.parse(window.sessionStorage.getItem('tx.view'));
      expect(stored.view).toBe('calendar');
      expect(stored.month).toMatch(/^\d{4}-\d{2}$/);
    });
  });

  it('URL 에 아무것도 없으면 세션에 남은 뷰를 되살린다', async () => {
    // 세션에 달력 상태를 넣는다
    window.sessionStorage.setItem('tx.view', JSON.stringify({ view: 'calendar', month: '2026-03' }));
    window.history.replaceState(null, '', '/transactions');
    
    mockGet();
    renderPage();
    
    const calendarButton = await screen.findByText('달력');
    expect(calendarButton.getAttribute('aria-pressed')).toBe('true');
  });

  it('URL 이 세션 기억을 이긴다', async () => {
    // URL 을 목록으로 설정하고 세션에는 달력 상태를 넣는다
    window.sessionStorage.setItem('tx.view', JSON.stringify({ view: 'calendar', month: '2026-03' }));
    window.history.replaceState(null, '', '/transactions?txView=list');
    
    mockGet();
    renderPage();
    
    const listButton = await screen.findByText('목록');
    expect(listButton.getAttribute('aria-pressed')).toBe('true');
  });

  it('가맹점 검색어가 서버 쿼리에 실린다', async () => {
    mockGet();
    renderPage();
    
    const merchantInput = screen.getByLabelText('가맹점 검색');
    const user = userEvent.setup();
    await user.type(merchantInput, '스타벅스');
    
    // Wait for the summary call to be made with the merchant filter
    await waitFor(() => {
      // Find all calls to get that include /api/transactions/summary/by-month
      const summaryCalls = get.mock.calls.filter(call => call[0].includes('/api/transactions/summary/by-month'));
      expect(summaryCalls.length).toBeGreaterThan(0);
      
      // Check if any of the calls contain merchant=스타벅스
      const hasMerchantFilter = summaryCalls.some(call => {
        const url = call[0];
        return url.includes('merchant=%EC%8A%A4%ED%83%80%EB%B2%85%EC%8A%A4'); // URL encoded '스타벅스'
      });
      
      expect(hasMerchantFilter).toBe(true);
    });
  });
});
