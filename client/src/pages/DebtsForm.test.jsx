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

const DEBT = {
  id: 7, name: '주택담보대출', type: '일반', loan_type: 'general',
  balance: 9000000, annual_rate: 4.17, monthly_interest: 31000, memo: '첫집',
};

function mountWith(rows = [DEBT]) {
  get.mockResolvedValue({ data: rows, total_balance: 0, total_monthly_interest: 0 });
  return render(<ConfirmProvider><Debts /></ConfirmProvider>);
}

beforeEach(() => {
  get.mockReset(); post.mockReset(); put.mockReset(); del.mockReset();
  post.mockResolvedValue({ ok: true });
  put.mockResolvedValue({ ok: true });
  del.mockResolvedValue({ ok: true });
});

describe('부채 폼이 보내는 값', () => {
  it('1. 등록은 연이율을 함께 보낸다', async () => {
    const user = userEvent.setup();
    mountWith([]);
    await user.click(screen.getByText('+ 부채 추가'));
    
    const nameInput = screen.getByLabelText('부채명 *');
    const balanceInput = screen.getByLabelText('잔액 (원) *');
    const annualRateInput = screen.getByLabelText('연이율 (%)');
    
    await user.type(nameInput, '주택담보대출');
    await user.type(balanceInput, '9000000');
    await user.type(annualRateInput, '4.17');
    
    await user.click(screen.getByText('추가'));
    
    await waitFor(() => expect(post).toHaveBeenCalled());
    const payload = post.mock.calls[0][1];
    expect(payload.annual_rate).toBe(4.17);
  });

  it('2. 수정은 연이율을 보내지 않는다 (#285)', async () => {
    const user = userEvent.setup();
    mountWith([DEBT]);
    
    await user.click(await screen.findByText('수정'));
    
    const nameInput = screen.getByLabelText('부채명 *');
    await user.clear(nameInput);
    await user.type(nameInput, '주택담보대출 (수정)');
    
    await user.click(screen.getByText('저장'));
    
    await waitFor(() => expect(put).toHaveBeenCalled());
    const payload = put.mock.calls[0][1];
    expect('annual_rate' in payload).toBe(false);
  });

  it('3. 일반 대출은 한도·이자결제일을 null 로 보낸다 (#329)', async () => {
    const user = userEvent.setup();
    mountWith([]);
    await user.click(screen.getByText('+ 부채 추가'));
    
    const nameInput = screen.getByLabelText('부채명 *');
    const balanceInput = screen.getByLabelText('잔액 (원) *');
    
    await user.type(nameInput, '주택담보대출');
    await user.type(balanceInput, '9000000');
    
    await user.click(screen.getByText('추가'));
    
    await waitFor(() => expect(post).toHaveBeenCalled());
    const payload = post.mock.calls[0][1];
    expect(payload.credit_limit).toBeNull();
    expect(payload.interest_day).toBeNull();
  });

  it('4. 마이너스통장으로 바꾸면 한도 칸이 생긴다', async () => {
    const user = userEvent.setup();
    mountWith([]);
    await user.click(screen.getByText('+ 부채 추가'));
    
    const loanTypeSelect = screen.getByLabelText('이자 계산 방식');
    await user.selectOptions(loanTypeSelect, 'credit_line');
    
    // Check that the credit limit input appears
    expect(screen.getByLabelText('한도 (원) *')).toBeDefined();
    expect(screen.getByLabelText('이자 결제일')).toBeDefined();
  });

  it('5. 유형을 되돌리면 적어둔 한도를 보내지 않는다 (#329)', async () => {
    const user = userEvent.setup();
    mountWith([]);
    await user.click(screen.getByText('+ 부채 추가'));
    
    const loanTypeSelect = screen.getByLabelText('이자 계산 방식');
    await user.selectOptions(loanTypeSelect, 'credit_line');
    
    const creditLimitInput = screen.getByLabelText('한도 (원) *');
    await user.type(creditLimitInput, '5000000');
    
    await user.selectOptions(loanTypeSelect, 'general');
    
    const nameInput = screen.getByLabelText('부채명 *');
    const balanceInput = screen.getByLabelText('잔액 (원) *');
    
    await user.type(nameInput, '주택담보대출');
    await user.type(balanceInput, '9000000');
    
    await user.click(screen.getByText('추가'));
    
    await waitFor(() => expect(post).toHaveBeenCalled());
    const payload = post.mock.calls[0][1];
    expect(payload.credit_limit).toBeNull();
  });

  it('6. 상환에서 이자분을 비우면 배분을 보내지 않는다', async () => {
    const user = userEvent.setup();
    mountWith([DEBT]);

    // 목록은 비동기로 온다. findBy 로 기다리지 않으면 버튼이 아직 없다.
    await user.click(await screen.findByText('상환'));

    await user.type(await screen.findByLabelText('상환 금액 (원) *'), '50000');
    await user.click(screen.getByText('기록'));

    await waitFor(() => expect(post).toHaveBeenCalled());
    const payload = post.mock.calls[0][1];
    // 배분을 안 적으면 서버가 전액을 원금으로 잡는다. 키를 아예 보내지 않는다.
    expect('interest_portion' in payload).toBe(false);
    expect('principal_portion' in payload).toBe(false);
    expect(payload.amount).toBe(50000);
  });

  it('7. 이자분을 적으면 원금은 금액에서 뺀 나머지다', async () => {
    const user = userEvent.setup();
    mountWith([DEBT]);

    await user.click(await screen.findByText('상환'));

    await user.type(await screen.findByLabelText('상환 금액 (원) *'), '500000');
    await user.type(screen.getByLabelText('이자분 (원)'), '30000');
    await user.click(screen.getByText('기록'));

    await waitFor(() => expect(post).toHaveBeenCalled());
    const payload = post.mock.calls[0][1];
    expect(payload.interest_portion).toBe(30000);
    expect(payload.principal_portion).toBe(470000);
  });
});
