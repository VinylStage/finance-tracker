import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import InstallmentRegenerate from './InstallmentRegenerate';
import { ConfirmProvider } from './ConfirmProvider';

// #269 — 기존 할부에 청구 내역을 만드는 자리. 마이그레이션이 자동으로 만들지
// 않는 이유(ADR 0008)가 여기서 프리뷰 → 확인으로 드러나야 한다.

const { post } = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock('../lib/api', () => ({
  api: { post },
  ApiError: class ApiError extends Error {},
}));

const INSTALLMENT = { id: 7, merchant: '노트북' };

const plan = (over = {}) => ({
  installment_id: 7,
  delete_count: 0,
  create_count: 6,
  before_total: 0,
  after_total: 600000,
  delta: 600000,
  policy_applied: { policy_type: '무이자', annual_rate: 0, free_from_sequence: 0 },
  changed_months: [],
  past_affected: [],
  reversible: 'backup',
  fingerprint: 'fp1',
  ...over,
});

function setup(props = {}) {
  return render(
    <ConfirmProvider>
      <InstallmentRegenerate installment={INSTALLMENT} hasDerived={false} {...props} />
    </ConfirmProvider>
  );
}

beforeEach(() => { post.mockReset(); });

describe('진입점', () => {
  it('청구 내역이 없으면 만들기를 권한다', () => {
    setup({ hasDerived: false });
    expect(screen.getByText('청구 내역 만들기')).toBeTruthy();
    expect(screen.getByText(/청구 내역이 아직 없어요/)).toBeTruthy();
  });

  it('이미 있으면 다시 계산으로 바뀐다', () => {
    setup({ hasDerived: true });
    expect(screen.getByText('청구 내역 다시 계산')).toBeTruthy();
    expect(screen.queryByText(/청구 내역이 아직 없어요/)).toBeNull();
  });
});

describe('프리뷰', () => {
  it('누르면 프리뷰만 부르고 실행하지 않는다', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({ data: plan() });
    setup();

    await user.click(screen.getByText('청구 내역 만들기'));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][0]).toBe('/api/installments/7/derived/preview');
    // 프리뷰는 DB 를 바꾸지 않는다 — apply 가 불리면 안 된다.
    expect(post.mock.calls.some((c) => c[0].endsWith('/apply'))).toBe(false);
  });

  it('건수와 금액 전후를 보여준다', async () => {
    const user = userEvent.setup();
    // 지워질 회차와 생길 회차를 다르게 둔다 — 같으면 어느 쪽을 읽었는지 알 수 없다.
    post.mockResolvedValue({ data: plan({
      delete_count: 6, create_count: 12,
      before_total: 600000, after_total: 1200000, delta: 600000,
    }) });
    setup();

    await user.click(screen.getByText('청구 내역 만들기'));
    expect(await screen.findByText('이렇게 바뀝니다')).toBeTruthy();
    expect(screen.getByText('6건')).toBeTruthy();
    expect(screen.getByText('12건')).toBeTruthy();
    expect(screen.getByText(/600,000원 → 1,200,000원/)).toBeTruthy();
    expect(screen.getByText(/\+600,000원/)).toBeTruthy();
  });

  it('되돌리는 방법을 사실대로 적는다', async () => {
    // M12 전까지는 실행취소가 없다. 있다고 적으면 사용자가 잘못 판단한다.
    const user = userEvent.setup();
    post.mockResolvedValue({ data: plan() });
    setup();
    await user.click(screen.getByText('청구 내역 만들기'));
    expect(await screen.findByText(/백업에서 복원/)).toBeTruthy();
    expect(screen.getByText(/실행취소는 아직 없어요/)).toBeTruthy();
  });

  it('지난 회차가 바뀌면 따로 드러낸다', async () => {
    // 과거 청구액이 바뀌는 건 사용자가 가장 놀라는 지점이다.
    const user = userEvent.setup();
    post.mockResolvedValue({
      data: plan({
        past_affected: [
          { billing_month: '2026-02', before: 100000, after: 120000, is_past: true },
          { billing_month: '2026-03', before: 100000, after: 120000, is_past: true },
        ],
      }),
    });
    setup();
    await user.click(screen.getByText('청구 내역 만들기'));
    expect(await screen.findByText(/이미 지난 청구월 2개가 바뀝니다/)).toBeTruthy();
    expect(screen.getByText(/2026-02 · 100,000원 → 120,000원/)).toBeTruthy();
  });

  it('지난 회차 영향이 없으면 경고를 띄우지 않는다', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({ data: plan() });
    setup();
    await user.click(screen.getByText('청구 내역 만들기'));
    await screen.findByText('이렇게 바뀝니다');
    expect(screen.queryByText(/이미 지난 청구월/)).toBeNull();
  });

  it('카드 정책이 없으면 무엇으로 계산했는지 알린다', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({ data: plan({ policy_applied: null }) });
    setup();
    await user.click(screen.getByText('청구 내역 만들기'));
    expect(await screen.findByText(/등록된 카드 정책이 없어 기존 월 수수료로 계산해요/)).toBeTruthy();
  });

  it('화면에 내부 필드명이 나오지 않는다', async () => {
    const user = userEvent.setup();
    const { container } = setup();
    post.mockResolvedValue({ data: plan({ past_affected: [{ billing_month: '2026-02', before: 1, after: 2, is_past: true }] }) });
    await user.click(screen.getByText('청구 내역 만들기'));
    await screen.findByText('이렇게 바뀝니다');
    expect(container.textContent).not.toMatch(/fingerprint|delete_count|create_count|past_affected|policy_applied|reversible/);
  });
});

describe('실행', () => {
  it('프리뷰 지문을 실어 보낸다', async () => {
    const user = userEvent.setup();
    post.mockImplementation((path) => (path.endsWith('/preview')
      ? Promise.resolve({ data: plan() })
      : Promise.resolve({ ok: true, created: 6, deleted: 0 })));
    const onDone = vi.fn();
    setup({ onDone });

    await user.click(screen.getByText('청구 내역 만들기'));
    await user.click(await screen.findByText('실행'));

    await waitFor(() => expect(post).toHaveBeenCalledWith(
      '/api/installments/7/derived/apply', { preview_token: 'fp1' }
    ));
    // 결과를 알리고 목록을 다시 부르게 한다
    expect(await screen.findByText(/청구 내역 6건을 만들었어요/)).toBeTruthy();
    await user.click(screen.getByText('확인'));
    expect(onDone).toHaveBeenCalled();
  });

  it('취소하면 실행하지 않는다', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({ data: plan() });
    setup();

    await user.click(screen.getByText('청구 내역 만들기'));
    await user.click(await screen.findByText('취소'));

    expect(post).toHaveBeenCalledTimes(1);
    expect(screen.getByText('청구 내역 만들기')).toBeTruthy();
  });

  it('프리뷰가 낡으면 계획을 지우고 사유를 알린다', async () => {
    // 다시 보고 판단해야 한다. 낡은 계획을 화면에 남겨 두면 또 누른다.
    const user = userEvent.setup();
    post.mockImplementation((path) => (path.endsWith('/preview')
      ? Promise.resolve({ data: plan() })
      : Promise.reject(new Error('미리보기를 본 뒤 내용이 달라졌어요. 다시 확인하고 저장해 주세요.'))));
    setup();

    await user.click(screen.getByText('청구 내역 만들기'));
    await user.click(await screen.findByText('실행'));

    expect(await screen.findByText(/다시 확인하고 저장해 주세요/)).toBeTruthy();
    await user.click(screen.getByText('확인'));
    expect(screen.getByText('청구 내역 만들기')).toBeTruthy();
  });

  it('프리뷰 조회가 실패하면 다시 시도할 수 있다', async () => {
    const user = userEvent.setup();
    post.mockRejectedValue(new Error('서버에 연결할 수 없습니다.'));
    setup();

    await user.click(screen.getByText('청구 내역 만들기'));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('다시 시도')).toBeTruthy();
  });
});
