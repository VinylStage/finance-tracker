import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import InstallmentRegenerate from './InstallmentRegenerate';
import { ConfirmProvider } from './ConfirmProvider';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock('../lib/api', () => ({
  api: { post },
  ApiError: class ApiError extends Error {},
}));

// 이름은 지어낸 것이다. 실제 가맹점 이름을 쓰지 않는다 — 이 저장소는 공개다.
const INSTALLMENT = { id: 7, merchant: '예시물품 갑' };

const plan = (over = {}) => ({
  installment_id: 7,
  delete_count: 0,
  create_count: 6,
  before_total: 0,
  after_total: 600000,
  delta: 600000,
  policy_applied: { policy_type: '무이자', annual_rate: 0 },
  changed_months: [],
  past_affected: [],
  reversible: 'backup',
  fingerprint: 'fp1',
  ...over,
});

// 프리뷰를 띄운다. 버튼 이름은 청구 내역이 있느냐로 갈린다.
async function openPreview(over = {}, props = {}) {
  post.mockResolvedValue({ data: plan(over) });
  const user = userEvent.setup();
  render(
    <ConfirmProvider>
      <InstallmentRegenerate installment={INSTALLMENT} hasDerived={false} {...props} />
    </ConfirmProvider>
  );
  await user.click(screen.getByText('청구 내역 만들기'));
  await screen.findByText('이렇게 바뀝니다');
  return user;
}

beforeEach(() => { post.mockReset(); });

describe('합계 변화 표기', () => {
  it('바뀌는 게 없으면 변화 없음이라고 적는다', async () => {
    await openPreview({ before_total: 600000, after_total: 600000, delta: 0 });
    expect(screen.getByText(/변화 없음/)).toBeTruthy();
  });

  it('줄어들면 빼기 기호를 붙인다', async () => {
    await openPreview({ before_total: 600000, after_total: 400000, delta: -200000 });
    expect(screen.getByText(/−200,000원/)).toBeTruthy();
  });
});

describe('적용 정책 표기', () => {
  it('등록된 정책이 없으면 그 사실을 적는다', async () => {
    await openPreview({ policy_applied: null });
    expect(screen.getByText('등록된 카드 정책이 없어 기존 월 수수료로 계산해요')).toBeTruthy();
  });

  it('연이율이 있으면 함께 적는다', async () => {
    await openPreview({ policy_applied: { policy_type: '유이자', annual_rate: 12.9 } });
    expect(screen.getByText('유이자 연 12.9%')).toBeTruthy();
  });
});
