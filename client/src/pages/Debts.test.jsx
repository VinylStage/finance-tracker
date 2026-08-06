import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Debts from './Debts';
import { ConfirmProvider } from '../components/ConfirmProvider';

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

function renderDebts() {
  return render(<ConfirmProvider><Debts /></ConfirmProvider>);
}

beforeEach(() => {
  get.mockReset(); post.mockReset(); put.mockReset(); del.mockReset();
});

describe('부채 현황 화면', () => {
  it('총 부채와 월이자 합계를 보여준다', async () => {
    get.mockResolvedValue({
      data: [{ id: 1, name: '주택담보대출', type: '일반', loan_type: 'general', balance: 9000000, annual_rate: 4.17, monthly_interest: 31000, memo: '첫집' }],
      total_balance: 12000000,
      total_monthly_interest: 43000
    });

    renderDebts();

    await waitFor(() => {
      expect(screen.getByText('12,000,000원')).toBeTruthy();
      expect(screen.getByText('43,000원')).toBeTruthy();
    });
  });

  it('부채 목록의 이름·잔액·연이율을 보여준다', async () => {
    get.mockResolvedValue({
      data: [
        { id: 1, name: '주택담보대출', type: '일반', loan_type: 'general', balance: 9000000, annual_rate: 4.17, monthly_interest: 31000, memo: '첫집' },
        { id: 2, name: '급여통장 마통', type: '마이너스통장', loan_type: 'credit_line', balance: 3000000, annual_rate: 6.5, monthly_interest: 16000, memo: null }
      ],
      total_balance: 12000000,
      total_monthly_interest: 43000
    });

    renderDebts();

    await waitFor(() => {
      expect(screen.getByText('주택담보대출')).toBeTruthy();
      expect(screen.getByText('급여통장 마통')).toBeTruthy();
      expect(screen.getByText('4.17%')).toBeTruthy();
      expect(screen.getByText('6.5%')).toBeTruthy();
      expect(screen.getByText('—')).toBeTruthy();
    });
  });

  it('부채가 없으면 빈 상태를 알린다', async () => {
    get.mockResolvedValue({
      data: [],
      total_balance: 0,
      total_monthly_interest: 0
    });

    renderDebts();

    await waitFor(() => {
      expect(screen.getByText('아직 등록된 부채가 없어요')).toBeTruthy();
    });
  });

  it('불러오기가 실패하면 오류를 알린다', async () => {
    get.mockRejectedValue(new Error('불러오지 못했습니다'));

    renderDebts();

    await waitFor(() => {
      expect(screen.queryByText('로딩 중...')).toBeNull();
      expect(screen.getByText('불러오지 못했습니다')).toBeTruthy();
    });
  });

  it('마이너스통장만 「이자 추가」 버튼을 준다', async () => {
    get.mockResolvedValue({
      data: [
        { id: 1, name: '주택담보대출', type: '일반', loan_type: 'general', balance: 9000000, annual_rate: 4.17, monthly_interest: 31000, memo: '첫집' },
        { id: 2, name: '급여통장 마통', type: '마이너스통장', loan_type: 'credit_line', balance: 3000000, annual_rate: 6.5, monthly_interest: 16000, memo: null }
      ],
      total_balance: 12000000,
      total_monthly_interest: 43000
    });

    renderDebts();

    await waitFor(() => {
      expect(screen.getAllByText('이자 추가')).toHaveLength(1);
      expect(screen.getAllByText('상환')).toHaveLength(2);
      expect(screen.getAllByText('수정')).toHaveLength(2);
      expect(screen.getAllByText('삭제')).toHaveLength(2);
    });
  });

  it('한도를 넘으면 초과 금액을 글자로 알린다', async () => {
    get.mockResolvedValue({
      data: [
        { id: 1, name: '주택담보대출', type: '일반', loan_type: 'general', balance: 9000000, annual_rate: 4.17, monthly_interest: 31000, memo: '첫집', credit_line: { credit_limit: 5000000, used: 6000000, available: -1000000, over_limit: true } }
      ],
      total_balance: 12000000,
      total_monthly_interest: 43000
    });

    renderDebts();

    await waitFor(() => {
      expect(screen.getByText('한도 1,000,000원 초과')).toBeTruthy();
    });
  });

  it('한도를 넘지 않으면 여유 금액을 글자로 알린다', async () => {
    get.mockResolvedValue({
      data: [
        { id: 1, name: '주택담보대출', type: '일반', loan_type: 'general', balance: 9000000, annual_rate: 4.17, monthly_interest: 31000, memo: '첫집', credit_line: { credit_limit: 5000000, used: 3000000, available: 2000000, over_limit: false } }
      ],
      total_balance: 12000000,
      total_monthly_interest: 43000
    });

    renderDebts();

    await waitFor(() => {
      expect(screen.getByText('여유 2,000,000원')).toBeTruthy();
    });
  });

  // 용도와 계산 방식은 다른 축이다(#329). 자료가 둘을 늘 함께 갖고 있으면
  // 화면이 어느 쪽으로 판정하든 통과해 버려서 이 규칙을 지키지 못한다.
  it('용도를 바꿔도 계산 방식이 마이너스통장이면 「이자 추가」가 남는다', async () => {
    get.mockResolvedValue({
      data: [
        { id: 1, name: '학자금 마통', type: '학자금', loan_type: 'credit_line', balance: 3000000, annual_rate: 2.5, monthly_interest: 6000, memo: null },
        { id: 2, name: '일반 대출', type: '마이너스통장', loan_type: 'general', balance: 5000000, annual_rate: 4, monthly_interest: 16000, memo: null },
      ],
      total_balance: 8000000,
      total_monthly_interest: 22000,
    });

    renderDebts();

    // 버튼은 용도가 '학자금' 인 행에 붙어야 한다. 용도가 '마이너스통장' 이어도
    // 계산 방식이 일반이면 붙지 않는다.
    await waitFor(() => {
      expect(screen.getAllByText('이자 추가')).toHaveLength(1);
    });
    const row = screen.getByText('학자금 마통').closest('tr');
    expect(row.textContent).toContain('이자 추가');
  });
});

// 폼은 열려 있는 동안 계속 마운트돼 있다. 초기값은 마운트 때 한 번만 읽히므로
// 대상이 바뀌어도 갱신되지 않는다 — 제목만 바뀌고 입력은 이전 것이 남는다.
describe('수정 폼이 가리키는 대상', () => {
  const ROWS = [
    { id: 1, name: '주택담보대출', type: '일반', loan_type: 'general', balance: 9000000, annual_rate: 4.17, monthly_interest: 31000, memo: '첫집' },
    { id: 2, name: '급여통장 마통', type: '마이너스통장', loan_type: 'credit_line', balance: 3000000, credit_limit: 5000000, annual_rate: 6.5, monthly_interest: 16000, memo: null },
  ];

  beforeEach(() => {
    put.mockResolvedValue({ ok: true });
    get.mockResolvedValue({ data: ROWS, total_balance: 12000000, total_monthly_interest: 43000 });
  });

  it('폼을 연 채 다른 부채를 수정하면 그 부채 값으로 바뀐다', async () => {
    renderDebts();
    await waitFor(() => expect(screen.getByText('주택담보대출')).toBeTruthy());

    await userEvent.click(screen.getAllByRole('button', { name: '수정' })[0]);
    expect(screen.getByLabelText('부채명 *').value).toBe('주택담보대출');

    await userEvent.click(screen.getAllByRole('button', { name: '수정' })[1]);
    expect(screen.getByLabelText('부채명 *').value).toBe('급여통장 마통');
  });

  it('대상을 바꾼 뒤 저장하면 그 대상의 값을 그 id 로 보낸다', async () => {
    renderDebts();
    await waitFor(() => expect(screen.getByText('주택담보대출')).toBeTruthy());

    await userEvent.click(screen.getAllByRole('button', { name: '수정' })[0]);
    await userEvent.click(screen.getAllByRole('button', { name: '수정' })[1]);
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    // 이전 부채의 값이 새 대상에 덮이면 마이너스통장이 일반대출로 바뀌고
    // 한도가 null 로 지워진다. 사용자는 그런 화면을 본 적이 없다.
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/debts/2', expect.objectContaining({
      name: '급여통장 마통',
      loan_type: 'credit_line',
      credit_limit: 5000000,
    })));
  });

  it('수정을 열어 둔 채 추가로 넘어가면 빈 폼이 된다', async () => {
    renderDebts();
    await waitFor(() => expect(screen.getByText('주택담보대출')).toBeTruthy());

    await userEvent.click(screen.getAllByRole('button', { name: '수정' })[0]);
    await userEvent.click(screen.getByRole('button', { name: '+ 부채 추가' }));

    expect(screen.getByText('부채 추가')).toBeTruthy();
    expect(screen.getByLabelText('부채명 *').value).toBe('');
  });
});
