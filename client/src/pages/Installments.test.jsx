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
  payment_method_name: '신한카드',
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

  // «완료처리»·«되돌리기» 는 없앴다(#205). 상태를 저장하지 않고 계산하므로
  // 손으로 세우거나 되돌릴 플래그가 없다.
  //
  // 버튼이 사라졌다는 것만 확인한다. 눌러서 어떤 요청이 나가는지 보던 예전
  // 테스트는 검사할 동작 자체가 없어졌다.
  it('완료처리 버튼이 없다', async () => {
    mockGet();
    renderPage();
    await waitFor(() => expect(screen.queryByText('로딩 중...')).toBeNull());
    expect(screen.queryByText('완료처리')).toBeNull();
  });

  it('완료된 건에도 되돌리기가 없다', async () => {
    mockGet({ rows: [{ ...ROW, status: '완료' }] });
    renderPage();
    await waitFor(() => expect(screen.queryByText('로딩 중...')).toBeNull());
    expect(screen.queryByText('되돌리기')).toBeNull();
    expect(screen.queryByText('되돌릴 수 없음')).toBeNull();
  });

  // 상태는 서버가 계산해 내려준다. 화면이 날짜로 다시 판정하면 서버와 어긋난다.
  //
  // «완료» 는 상태 필터 탭에도 있다. 태그로 좁히지 않으면 탭 하나만 있어도
  // 통과해서, 상태 칸이 비어 있는 것을 못 잡는다.
  it('서버가 내려준 상태를 그대로 보여준다', async () => {
    mockGet({ rows: [{ ...ROW, status: '완료' }] });
    renderPage();
    await waitFor(() => expect(screen.queryByText('로딩 중...')).toBeNull());
    const badges = screen.getAllByText('완료').filter((el) => el.tagName === 'SPAN');
    expect(badges).toHaveLength(1);
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
