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

// 두 엔드포인트를 구분해서 답한다. 같은 값을 둘 다에 주면 지나친 목록에 후보가
// 그대로 나타나 **테스트가 잘못된 상태를 통과시킨다**(#445 §2 배선 뒤 실제로 그랬다).
function setup(rows, dismissed = []) {
  get.mockImplementation((path) => {
    if (path === '/api/installments/duplicates/dismissed') return Promise.resolve({ data: dismissed });
    return Promise.resolve({ data: rows });
  });
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

// 지나친 판단을 되돌리는 동선(#445 §2).
//
// 서버에는 `undismiss` 가 처음부터 있었는데 화면이 안 불러서 **실수로 "중복 아님" 을
// 누르면 사용자 입장에서는 영구**였다. 무엇을 지나쳤는지 볼 방법도 없었다.
describe('지나친 것 되돌리기', () => {
  it('후보가 0건이어도 지나친 것이 있으면 화면이 남는다', async () => {
    const dismissed = [{ transaction_id: 11, dismissed_at: '2026-05-20 10:00:00',
      date: '2026-05-15', merchant: '쿠팡', amount: 300000 }];
    setup([], dismissed);
    expect(await screen.findByText(/중복 아니라고 한 것 1건/)).toBeTruthy();
    // 다 지나친 뒤에 화면이 사라지면 되돌릴 방법도 같이 사라진다
  });

  it('후보도 지나친 것도 없으면 자리를 차지하지 않는다', async () => {
    const { container } = setup([], []);
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('접혀 있다가 눌러야 펼쳐진다', async () => {
    const dismissed = [{ transaction_id: 11, dismissed_at: '2026-05-20 10:00:00',
      date: '2026-05-15', merchant: '쿠팡', amount: 300000 }];
    setup([candidate()], dismissed);
    
    // 처음에는 쿠팡 이 안 보인다
    expect(screen.queryByText(/쿠팡/)).toBeNull();
    
    // "중복 아니라고 한 것" 이 든 버튼을 누르면 쿠팡 이 보인다
    const button = await screen.findByRole('button', { name: /중복 아니라고 한 것/ });
    await button.click();
    expect(screen.getByText(/쿠팡/)).toBeTruthy();
  });

  it('무엇을 지나쳤는지 알아볼 수 있다', async () => {
    const dismissed = [{ transaction_id: 11, dismissed_at: '2026-05-20 10:00:00',
      date: '2026-05-15', merchant: '쿠팡', amount: 300000 }];
    setup([candidate()], dismissed);
    
    const button = await screen.findByRole('button', { name: /중복 아니라고 한 것/ });
    await button.click();
    
    // 날짜와 금액이 보인다
    expect(await screen.findByText(/2026-05-15/)).toBeTruthy();
    expect(screen.getByText(/300,000/)).toBeTruthy();
    // 거래 id 만 보여주면 사용자가 판단할 수 없다
  });

  it('다시 보기를 누르면 restore 를 부른다', async () => {
    const dismissed = [{ transaction_id: 11, dismissed_at: '2026-05-20 10:00:00',
      date: '2026-05-15', merchant: '쿠팡', amount: 300000 }];
    setup([candidate()], dismissed);
    post.mockResolvedValue({ ok: true, restored: 1 });

    const button = await screen.findByRole('button', { name: /중복 아니라고 한 것/ });
    await button.click();
    
    const restoreButton = await screen.findByText(/다시 보기/);
    await restoreButton.click();

    expect(post).toHaveBeenCalledWith('/api/installments/duplicates/restore', { ids: [11] });
  });

  it('되돌린 뒤 목록을 다시 싣는다', async () => {
    const dismissed = [{ transaction_id: 11, dismissed_at: '2026-05-20 10:00:00',
      date: '2026-05-15', merchant: '쿠팡', amount: 300000 }];
    setup([candidate()], dismissed);
    post.mockResolvedValue({ ok: true, restored: 1 });

    const button = await screen.findByRole('button', { name: /중복 아니라고 한 것/ });
    await button.click();
    
    const restoreButton = await screen.findByText(/다시 보기/);
    const callCount = get.mock.calls.length;
    await restoreButton.click();

    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(callCount));
    // 되돌렸는데 목록이 그대로면 사용자는 눌린 줄 모른다
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
