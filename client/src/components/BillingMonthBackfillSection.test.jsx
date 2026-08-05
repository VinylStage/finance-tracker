import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BillingMonthBackfillSection from './BillingMonthBackfillSection';
import { ConfirmProvider } from './ConfirmProvider';

// 청구월 소급(#289).
//
// 카드의 결제일·마감일은 **나중에** 들어온다(명세서를 찾아봐야 안다). 그 전에
// 기록한 카드 사용은 청구월이 빈 채로 남고 스스로 되살아나지 않는다.
//
// 여기서 잠그는 것.
//   1. 실행 전에 무엇이 몇 건 바뀌는지 보이는가 (ADR 0008 의 프리뷰)
//   2. 채워지는 것 · 다시 계산되는 것 · 지워지는 것을 갈라서 말하는가
//      — 사용자에게 무게가 다르다
//   3. 기본 모드가 손으로 적은 값을 지키는가, 그리고 그 사실을 알리는가
//   4. 확인 없이 실행되지 않는가

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

// 실제 api 객체의 표면을 그대로 흉내낸다. 여기서 없는 메서드를 지어내면
// 화면이 그것을 불러도 테스트만 통과한다.
vi.mock('../lib/api', () => ({
  api: { get, post, put: vi.fn(), del: vi.fn(), raw: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

vi.mock('./EmptyState', () => ({
  default: ({ title, description }) => <div><p>{title}</p><p>{description}</p></div>,
}));

const PRODUCTS = [
  { id: 10, product_name: '하나 A', payment_method_name: '하나카드', issuer: '하나' },
  { id: 11, product_name: '삼성 iD', payment_method_name: '삼성카드', issuer: '삼성' },
];

const PLAN = {
  mode: 'fill',
  card: null,
  scanned: 300,
  count: 260,
  filled: 260,
  cleared: 0,
  rewritten: 0,
  skipped_written: 0,
  samples: [
    {
      id: 1, date: '2026-05-15', merchant: '스타벅스', amount: -4500,
      card_product_name: '하나 A', before: null, after: '2026-06',
    },
  ],
  preview_token: 'token-260',
  undoable: true,
};

function mockLoad({ products = PRODUCTS, missing = 260 } = {}) {
  get.mockImplementation((path) => {
    if (path === '/api/billing-month/missing-count') return Promise.resolve({ missing });
    if (path.startsWith('/api/card-products')) return Promise.resolve({ data: products });
    return Promise.resolve({ data: [] });
  });
}

const setup = () =>
  render(
    <ConfirmProvider>
      <BillingMonthBackfillSection />
    </ConfirmProvider>
  );

// 프리뷰는 화면에 들어오자마자 디바운스를 거쳐 돈다. 재매핑과 달리 카드를
// 고르지 않아도 도는 것이 이 도구의 요건이라, 기다리기만 하면 된다.
const waitForPreview = () => waitFor(() => expect(post).toHaveBeenCalled());

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  mockLoad();
  post.mockResolvedValue(PLAN);
});

describe('A. 빈 상태', () => {
  it('A-1. 등록한 카드가 없으면 먼저 무엇을 하라고 말한다', async () => {
    mockLoad({ products: [] });
    setup();
    expect(await screen.findByText('먼저 카드를 등록해 주세요')).toBeTruthy();
  });

  it('A-2. 카드가 없으면 프리뷰를 부르지 않는다', async () => {
    mockLoad({ products: [] });
    setup();
    await screen.findByText('먼저 카드를 등록해 주세요');
    expect(post).not.toHaveBeenCalled();
  });
});

describe('B. 남은 건수', () => {
  it('B-1. 화면에 들어오면 바로 보인다 — 소급이 필요한 상태인지 알아야 한다', async () => {
    setup();
    expect((await screen.findByTestId('backfill-missing')).textContent).toContain('260건');
  });

  it('B-2. 프리뷰가 남은 건수를 덮지 않는다 — 프리뷰는 DB 를 안 바꾼다', async () => {
    setup();
    await waitForPreview();
    // 프리뷰 응답에는 missing 이 없다. 덮으면 undefined 가 화면에 뜬다.
    await waitFor(() => {
      expect(screen.getByTestId('backfill-missing').textContent).toContain('260건');
    });
  });
});

describe('C. 프리뷰 — 카드를 안 골라도 돈다', () => {
  it('C-1. 들어오자마자 전체 건수를 센다', async () => {
    setup();
    expect(await screen.findByText('260건이 바뀌어요')).toBeTruthy();
    expect(post).toHaveBeenCalledWith('/api/billing-month/backfill/preview',
      expect.objectContaining({ mode: 'fill' }));
  });

  it('C-2. 카드를 안 고르면 조건에 안 싣는다 — 전체가 대상이다', async () => {
    setup();
    await waitForPreview();
    expect(post.mock.calls[0][1].card_product_id).toBeUndefined();
  });

  it('C-3. 카드를 고르면 조건에 실린다', async () => {
    const user = userEvent.setup();
    setup();
    await waitForPreview();

    await user.selectOptions(await screen.findByLabelText(/어느 카드를 채울까요/), '10');

    await waitFor(() => {
      expect(post).toHaveBeenLastCalledWith('/api/billing-month/backfill/preview',
        expect.objectContaining({ card_product_id: '10' }));
    });
  });

  it('C-4. 채울 것이 없으면 왜 없는지 말한다', async () => {
    post.mockResolvedValue({ ...PLAN, count: 0, filled: 0, samples: [] });
    setup();
    expect(await screen.findByText(/카드의 결제일과 마감일이 들어가 있는지/)).toBeTruthy();
  });

  it('C-5. 대표 사례를 전 → 후로 보여준다', async () => {
    setup();
    expect(await screen.findByText(/없음 →/)).toBeTruthy();
    expect(screen.getByText('2026-06')).toBeTruthy();
    expect(screen.getByText('스타벅스')).toBeTruthy();
  });

  it('C-6. 프리뷰가 거절되면 그 이유를 보여준다', async () => {
    post.mockRejectedValue(new Error('어떻게 채울지 골라 주세요.'));
    setup();
    expect((await screen.findByRole('alert')).textContent).toMatch(/어떻게 채울지/);
  });
});

// 세 갈래는 사용자에게 무게가 다르다. 채워지는 것은 좋은 일이고, 다시 계산되는
// 것은 이미 있던 값이 사라지는 일이며, 지워지는 것은 **고칠 수 있는 문제**의
// 신호다(카드 주기를 아직 안 넣었다).
describe('D. 무엇이 바뀌는지 갈라서 말한다', () => {
  it('D-1. 채워지는 건수', async () => {
    setup();
    expect(await screen.findByText(/빈 청구월 260건이 채워져요/)).toBeTruthy();
  });

  it('D-2. 다시 계산되는 건수는 경고로', async () => {
    post.mockResolvedValue({ ...PLAN, mode: 'recompute', filled: 0, rewritten: 12, count: 12 });
    setup();
    expect(await screen.findByText(/이미 적힌 청구월 12건이 다시 계산돼요/)).toBeTruthy();
  });

  it('D-3. 지워지는 건수는 이유까지 말한다 — 사용자가 고칠 수 있어야 한다', async () => {
    post.mockResolvedValue({ ...PLAN, filled: 0, cleared: 7, count: 7 });
    setup();
    expect(await screen.findByText(/청구월 7건이 지워져요/)).toBeTruthy();
    expect(await screen.findByText(/결제일·마감일을 몰라서예요/)).toBeTruthy();
  });

  it('D-4. 안 바뀌는 갈래는 말하지 않는다', async () => {
    setup();
    await screen.findByText('260건이 바뀌어요');
    expect(screen.queryByText(/다시 계산돼요/)).toBe(null);
    expect(screen.queryByText(/지워져요/)).toBe(null);
  });
});

describe('E. 기본 모드가 손으로 적은 값을 지킨다', () => {
  it('E-1. 기본은 빈 것만 채우기다', async () => {
    setup();
    await waitForPreview();
    expect(post.mock.calls[0][1].mode).toBe('fill');
    expect(screen.getByLabelText(/빈 것만 채워요/).checked).toBe(true);
  });

  it('E-2. 지나친 건수를 알리고 무엇을 하면 되는지 말한다', async () => {
    // 알리지 않으면 사용자는 "왜 260건 중 12건이 안 채워졌지" 를 알 방법이 없다.
    post.mockResolvedValue({ ...PLAN, count: 248, filled: 248, skipped_written: 12 });
    setup();
    expect(await screen.findByText(/이미 적힌 12건은 그대로 둬요/)).toBeTruthy();
    expect(await screen.findByText(/전부 다시 계산하려면 위에서 바꿔 주세요/)).toBeTruthy();
  });

  it('E-3. 전부 다시 계산을 고르면 조건에 실린다', async () => {
    const user = userEvent.setup();
    setup();
    await waitForPreview();

    await user.click(screen.getByLabelText(/전부 다시 계산해요/));

    await waitFor(() => {
      expect(post).toHaveBeenLastCalledWith('/api/billing-month/backfill/preview',
        expect.objectContaining({ mode: 'recompute' }));
    });
  });
});

describe('F. 확인 없이 실행되지 않는다', () => {
  it('F-1. 0건이면 채우기가 비활성이다', async () => {
    post.mockResolvedValue({ ...PLAN, count: 0, filled: 0, samples: [] });
    setup();
    await screen.findByText(/카드의 결제일과 마감일이/);
    expect(screen.getByText('채우기').disabled).toBe(true);
  });

  it('F-2. 확인 창에 건수가 나온다', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByText('채우기'));

    expect(await screen.findByText(/260건의 청구월을 채울까요/)).toBeTruthy();
  });

  it('F-3. 지워지는 것이 있으면 확인 창이 그것도 말한다', async () => {
    // 건수만 물으면 사용자는 **무엇을 승인하는지 모른 채** 승인한다.
    const user = userEvent.setup();
    post.mockResolvedValue({ ...PLAN, filled: 253, cleared: 7 });
    setup();
    await user.click(await screen.findByText('채우기'));

    expect(await screen.findByText(/그중 7건은 지워져요/)).toBeTruthy();
  });

  it('F-4. 확인을 취소하면 실행하지 않는다', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByText('채우기'));
    await user.click(await screen.findByText('취소'));

    const executed = post.mock.calls.filter(([p]) => p === '/api/billing-month/backfill');
    expect(executed).toHaveLength(0);
  });

  it('F-5. 확인하면 프리뷰가 준 지문을 실어 실행한다', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByText('채우기'));
    post.mockResolvedValue({ ok: true, updated: 260, missing: 0, mode: 'fill', card: null });
    await user.click(await screen.findByText('확인'));

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/api/billing-month/backfill',
        expect.objectContaining({ preview_token: 'token-260', mode: 'fill' }));
    });
  });
});

describe('G. 실행 뒤', () => {
  const runBackfill = async (user, result) => {
    setup();
    await user.click(await screen.findByText('채우기'));
    post.mockResolvedValue(result);
    await user.click(await screen.findByText('확인'));
  };

  it('G-1. 몇 건을 채웠는지 알린다', async () => {
    const user = userEvent.setup();
    await runBackfill(user, { ok: true, updated: 260, missing: 0, mode: 'fill', card: null });

    expect((await screen.findByRole('status')).textContent).toMatch(/260건의 청구월을 채웠어요/);
  });

  it('G-2. 남은 건수를 갱신해 보여준다 — 이어서 할 수 있다', async () => {
    const user = userEvent.setup();
    await runBackfill(user, { ok: true, updated: 250, missing: 10, mode: 'fill', card: null });

    await waitFor(() => {
      expect(screen.getByTestId('backfill-missing').textContent).toContain('10건');
    });
  });

  it('G-3. 지문이 만료되면 서버 문구를 그대로 보여준다', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByText('채우기'));
    post.mockRejectedValue(new Error('미리보기를 본 뒤 대상이 달라졌어요. 다시 확인하고 채워 주세요.'));
    await user.click(await screen.findByText('확인'));

    expect(await screen.findByText(/다시 확인하고 채워 주세요/)).toBeTruthy();
  });
});
