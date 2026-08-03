import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DuplicateCandidates from './DuplicateCandidates';
import { ConfirmProvider } from './ConfirmProvider';

// #269 잔여 — 중복 의심 거래 화면. 핵심은 "자동으로 지우지 않는다" 다.

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('../lib/api', () => ({
  api: { get, post },
  ApiError: class ApiError extends Error {},
}));

const candidate = (over = {}) => ({
  transaction: {
    id: 1, date: '2026-07-06', merchant: '예스이십사(주)', amount: 232897,
    payment_style: '할부', category_name: '쇼핑', memo: null,
  },
  installment_id: 1,
  installment_merchant: '예스이십사 주식회사',
  confidence: 'exact',
  days_apart: 0,
  matched_on: 'total',
  ...over,
});

function setup(rows) {
  get.mockResolvedValue({ data: rows });
  return render(<ConfirmProvider><DuplicateCandidates /></ConfirmProvider>);
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe('표시', () => {
  it('후보가 없으면 자리를 차지하지 않는다', async () => {
    const { container } = setup([]);
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('후보를 건수와 함께 보여준다', async () => {
    setup([candidate()]);
    expect(await screen.findByText(/중복일 수 있는 거래 1건/)).toBeTruthy();
    expect(screen.getByText(/예스이십사\(주\)/)).toBeTruthy();
  });

  it('자동으로 지우지 않는다는 것을 먼저 알린다', async () => {
    setup([candidate()]);
    expect(await screen.findByText(/자동으로 지우지 않아요/)).toBeTruthy();
    expect(screen.getByText(/직접 골라 주세요/)).toBeTruthy();
  });

  it('확신도를 아이콘과 텍스트로 함께 쓴다', async () => {
    // 색만으로 구분하면 색을 구분 못 하는 사용자에게 아무 정보가 없다.
    const { container } = setup([candidate()]);
    expect(await screen.findByText(/금액·가맹점·날짜가 모두 같아요/)).toBeTruthy();
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('확신도별로 다른 사유를 보여준다', async () => {
    setup([
      candidate({ confidence: 'likely' }),
      candidate({ transaction: { ...candidate().transaction, id: 2 }, confidence: 'review', installment_merchant: null }),
    ]);
    expect(await screen.findByText(/월 납입액과 같아요/)).toBeTruthy();
    expect(screen.getByText(/등록된 할부가 없어요/)).toBeTruthy();
  });

  it('내부 값이 화면에 나오지 않는다', async () => {
    const { container } = setup([candidate()]);
    await screen.findByText(/중복일 수 있는 거래/);
    expect(container.textContent).not.toMatch(/exact|likely|review|origin|installment_id|matched_on/);
  });

  it('조회가 실패하면 조용히 비어 보이지 않는다', async () => {
    get.mockRejectedValue(new Error('서버에 연결할 수 없습니다.'));
    render(<ConfirmProvider><DuplicateCandidates /></ConfirmProvider>);
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});

describe('선택과 처리', () => {
  it('아무것도 안 고르면 버튼이 없다', async () => {
    setup([candidate()]);
    await screen.findByText(/중복일 수 있는 거래/);
    expect(screen.queryByText(/지우기/)).toBeNull();
    expect(screen.queryByText(/중복 아님/)).toBeNull();
  });

  it('고르면 지우기·중복 아님이 나타난다', async () => {
    const user = userEvent.setup();
    setup([candidate()]);
    await user.click(await screen.findByRole('checkbox'));
    expect(screen.getByText(/지우기 \(1\)/)).toBeTruthy();
    expect(screen.getByText(/중복 아님 \(1\)/)).toBeTruthy();
  });

  it('지우기 전에 프리뷰를 거치고 확인을 받는다', async () => {
    const user = userEvent.setup();
    setup([candidate()]);
    post.mockImplementation((path) => (path.endsWith('/preview')
      ? Promise.resolve({ data: { rows: [{ id: 1 }], total: 232897, fingerprint: 'fp1' } })
      : Promise.resolve({ deleted: 1, kept: 0 })));

    await user.click(await screen.findByRole('checkbox'));
    await user.click(screen.getByText(/지우기 \(1\)/));

    // 무엇이 사라지는지 먼저 보여준다
    expect(await screen.findByText(/1건, 합계 232,897원을 지울까요/)).toBeTruthy();
    await user.click(screen.getByText('지우기', { selector: 'button' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith(
      '/api/installments/duplicates/resolve',
      { delete_ids: [1], preview_token: 'fp1' }
    ));
  });

  it('확인에서 취소하면 지우지 않는다', async () => {
    const user = userEvent.setup();
    setup([candidate()]);
    post.mockResolvedValue({ data: { rows: [{ id: 1 }], total: 232897, fingerprint: 'fp1' } });

    await user.click(await screen.findByRole('checkbox'));
    await user.click(screen.getByText(/지우기 \(1\)/));
    await user.click(await screen.findByText('취소'));

    expect(post).toHaveBeenCalledTimes(1); // 프리뷰만
    expect(post.mock.calls[0][0]).toMatch(/preview$/);
  });

  it('중복 아님은 확인 없이 바로 기억한다', async () => {
    // 되돌릴 수 있는 동작이라 확인을 또 받으면 흐름만 길어진다.
    const user = userEvent.setup();
    setup([candidate()]);
    post.mockResolvedValue({ deleted: 0, kept: 1 });

    await user.click(await screen.findByRole('checkbox'));
    await user.click(screen.getByText(/중복 아님 \(1\)/));

    await waitFor(() => expect(post).toHaveBeenCalledWith(
      '/api/installments/duplicates/resolve', { keep_ids: [1] }
    ));
  });
});
