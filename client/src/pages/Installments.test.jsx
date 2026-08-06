import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Installments from './Installments';
import { ConfirmProvider } from '../components/ConfirmProvider';

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

const ROW = {
  id: 3, merchant: '노트북', total_amount: 1200000, monthly_amount: 200000,
  months: 6, billed_months: 2, remaining_months: 4, status: '진행중',
  payment_method_name: '신한카드', can_reopen: false, reopen_blocked_reason: null,
};

// 화면이 부르는 주소가 여럿이라 URL 로 갈라 답한다. 목록만 바꿔 가며 쓴다.
function mockGet({ rows = [ROW], thisMonthTotal = 200000, listError = null } = {}) {
  get.mockImplementation((url) => {
    if (url.startsWith('/api/installments/duplicates')) return Promise.resolve({ data: [] });
    if (url.startsWith('/api/installments')) {
      return listError
        ? Promise.reject(listError)
        : Promise.resolve({ data: rows, this_month_total: thisMonthTotal });
    }
    if (url === '/api/payment-methods') return Promise.resolve([]);
    if (url === '/api/categories') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
}

function renderPage() {
  return render(<ConfirmProvider><Installments /></ConfirmProvider>);
}

beforeEach(() => {
  get.mockReset(); post.mockReset(); put.mockReset(); del.mockReset();
  put.mockResolvedValue({ ok: true });
  post.mockResolvedValue({ ok: true });
  del.mockResolvedValue({ ok: true });
});

describe('할부 관리 화면', () => {
  it('할부 목록을 보여준다', async () => {
    mockGet();
    renderPage();
    
    // 로딩이 끝날 때까지 기다림
    await waitFor(() => expect(screen.queryByText('로딩 중...')).toBeNull());
    
    // 가맹점 이름 확인
    expect(screen.getByText('노트북')).toBeTruthy();
    
    // 총액 확인 (formatWon 적용)
    expect(screen.getByRole('cell', { name: '1,200,000원' })).toBeTruthy();
    
    // 월납부액 확인 (formatWon 적용)
    expect(screen.getByRole('cell', { name: '200,000원' })).toBeTruthy();
    
    // 진행 확인
    expect(screen.getByText('2/6')).toBeTruthy();
    
    // 잔여 확인
    expect(screen.getByText('4개월')).toBeTruthy();
    
    // 결제수단 확인
    expect(screen.getByText('신한카드')).toBeTruthy();
  });

  it('이번달 청구 합계를 보여준다', async () => {
    mockGet({ thisMonthTotal: 350000 });
    renderPage();
    
    // 로딩이 끝날 때까지 기다림
    await waitFor(() => expect(screen.queryByText('로딩 중...')).toBeNull());
    
    // 합계 확인 (formatWon 적용)
    expect(screen.getByText('350,000원')).toBeTruthy();
  });

  it('할부가 없으면 없다고 알린다', async () => {
    mockGet({ rows: [] });
    renderPage();
    
    // 로딩이 끝날 때까지 기다림
    await waitFor(() => expect(screen.queryByText('로딩 중...')).toBeNull());
    
    // 빈 목록 문구 확인
    expect(screen.getByText('할부 내역이 없습니다.')).toBeTruthy();
  });

  it('불러오기가 실패하면 오류를 알린다', async () => {
    mockGet({ listError: new Error('불러오지 못했습니다') });
    renderPage();
    
    // 로딩이 끝날 때까지 기다림
    await waitFor(() => expect(screen.queryByText('로딩 중...')).toBeNull());
    
    // 오류 메시지 확인
    expect(screen.getByText('불러오지 못했습니다')).toBeTruthy();
  });

  it('완료 처리는 확인을 받는다 (#295)', async () => {
    mockGet();
    const user = userEvent.setup();
    renderPage();
    
    // 로딩이 끝날 때까지 기다림
    await waitFor(() => expect(screen.queryByText('로딩 중...')).toBeNull());
    
    // 완료처리 버튼 클릭
    const completeButton = screen.getByText('완료처리');
    await user.click(completeButton);
    
    // 확인창이 떠야 함
    const confirmButton = screen.getByText('완료 처리');
    const cancelButton = screen.getByText('취소');
    
    // 취소 버튼 클릭
    await user.click(cancelButton);
    
    // put이 호출되지 않았는지 확인
    expect(put).not.toHaveBeenCalled();
  });

  it('확인하면 상태를 완료로 바꿔 보낸다', async () => {
    mockGet();
    const user = userEvent.setup();
    renderPage();
    
    // 로딩이 끝날 때까지 기다림
    await waitFor(() => expect(screen.queryByText('로딩 중...')).toBeNull());
    
    // 완료처리 버튼 클릭
    const completeButton = screen.getByText('완료처리');
    await user.click(completeButton);
    
    // 확인창에서 확인 버튼 클릭
    const confirmButton = screen.getByText('완료 처리');
    await user.click(confirmButton);
    
    // put이 호출되었는지 확인
    expect(put).toHaveBeenCalledWith('/api/installments/3', { status: '완료' });
  });

  it('되돌릴 수 없는 완료 건은 사유를 달아 알린다', async () => {
    const row = {
      ...ROW,
      status: '완료',
      can_reopen: false,
      reopen_blocked_reason: '청구 기간이 끝났어요'
    };
    mockGet({ rows: [row] });
    renderPage();
    
    // 로딩이 끝날 때까지 기다림
    await waitFor(() => expect(screen.queryByText('로딩 중...')).toBeNull());
    
    // 되돌리기 버튼이 없어야 함
    const reopenButton = screen.queryByText('되돌리기');
    expect(reopenButton).toBeNull();
    
    // 되돌릴 수 없음 문구 확인
    const noReopenText = screen.getByText('되돌릴 수 없음');
    expect(noReopenText).toBeTruthy();
    
    // title 속성 확인
    expect(noReopenText.getAttribute('title')).toBe('청구 기간이 끝났어요');
  });

  it('되돌릴 수 있는 완료 건은 되돌리기 버튼을 보여준다', async () => {
    const row = {
      ...ROW,
      status: '완료',
      can_reopen: true
    };
    mockGet({ rows: [row] });
    renderPage();
    
    // 로딩이 끝날 때까지 기다림
    await waitFor(() => expect(screen.queryByText('로딩 중...')).toBeNull());
    
    // 되돌리기 버튼이 있어야 함
    const reopenButton = screen.getByText('되돌리기');
    expect(reopenButton).toBeTruthy();
  });

  it('「전체」 필터는 상태 조건 없이 부른다', async () => {
    mockGet();
    const user = userEvent.setup();
    renderPage();
    
    // 로딩이 끝날 때까지 기다림
    await waitFor(() => expect(screen.queryByText('로딩 중...')).toBeNull());
    
    // 전체 버튼 클릭
    const allButton = screen.getByText('전체');
    await user.click(allButton);
    
    // get이 쿼리 없이 호출되었는지 확인
    expect(get).toHaveBeenCalledWith('/api/installments');
  });
});
