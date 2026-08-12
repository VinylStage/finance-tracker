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

  it('무이자면 연이율을 적지 않는다', async () => {
    await openPreview({ policy_applied: { policy_type: '무이자', annual_rate: 0 } });
    expect(screen.getByText('무이자')).toBeTruthy();
    expect(screen.queryByText(/연 0%/)).toBe(null);
  });
});

const months = (n) =>
  Array.from({ length: n }, (_, i) => ({
    billing_month: `2026-${String(i + 1).padStart(2, '0')}`,
    before: 100000,
    after: 90000,
  }));

describe('지난 청구월 표기', () => {
  it('다섯 개까지는 전부 줄로 보여준다', async () => {
    await openPreview({ past_affected: months(5) });
    expect(screen.getByText('이미 지난 청구월 5개가 바뀝니다')).toBeTruthy();
    expect(screen.getByText(/2026-05/)).toBeTruthy();
    expect(screen.queryByText(/외 .*개/)).toBe(null);
  });

  it('여섯 개부터는 나머지를 개수로 적는다', async () => {
    await openPreview({ past_affected: months(8) });
    expect(screen.getByText('이미 지난 청구월 8개가 바뀝니다')).toBeTruthy();
    // 여섯째부터는 줄로 안 나온다
    expect(screen.queryByText(/2026-06/)).toBe(null);
    expect(screen.getByText('외 3개')).toBeTruthy();
  });

  it('칸이 아예 없어도 상자를 만들지 않는다', async () => {
    const p = plan();
    delete p.past_affected;
    post.mockResolvedValue({ data: p });
    const user = userEvent.setup();
    render(
      <ConfirmProvider>
        <InstallmentRegenerate installment={INSTALLMENT} hasDerived={false} />
      </ConfirmProvider>
    );
    await user.click(screen.getByText('청구 내역 만들기'));
    await screen.findByText('이렇게 바뀝니다');

    expect(screen.queryByText(/이미 지난 청구월/)).toBe(null);
  });
});

describe('되돌리기 안내', () => {
  it('실행취소가 되면 그렇다고 적는다', async () => {
    await openPreview({ reversible: 'undo' });
    expect(screen.getByText('실행취소로 한 번에 되돌릴 수 있어요.')).toBeTruthy();
  });

  it('모르는 값이면 백업 안내로 되돌아간다', async () => {
    await openPreview({ reversible: 'something-new' });
    expect(screen.getByText('되돌리려면 백업에서 복원해야 해요. 실행취소는 아직 없어요.')).toBeTruthy();
  });
});

describe('실행 결과 문구', () => {
  it('지운 것이 없으면 만든 건수만 알린다', async () => {
    const user = await openPreview();
    post.mockResolvedValue({ created: 6, deleted: 0 });

    await user.click(screen.getByText('실행'));

    expect(await screen.findByText('청구 내역 6건을 만들었어요.')).toBeTruthy();
  });

  it('지운 것이 있으면 그것도 함께 알린다', async () => {
    const user = await openPreview();
    post.mockResolvedValue({ created: 6, deleted: 3 });

    await user.click(screen.getByText('실행'));

    expect(await screen.findByText('청구 내역 6건을 만들었어요. (이전 3건은 지웠어요)')).toBeTruthy();
  });
});
