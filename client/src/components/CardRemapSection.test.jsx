import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CardRemapSection from './CardRemapSection';
import { ConfirmProvider } from './ConfirmProvider';

// #302 3단계 — 기존 거래 재매핑.
//
// 실사용 DB 에서 하나카드 260건이 대상이고, 그건 카드 거래의 58% 다. 한 건씩
// 고르게 하는 설계는 실패하므로 조건으로 묶어 한 번에 지정한다.
//
// 여기서 잠그는 것.
//   1. 실행 전에 건수가 보이는가 (ADR 0008 의 프리뷰)
//   2. 조건을 고치면 건수가 따라오는가 — 범위를 좁혀볼 수 있어야 한다
//   3. 확인 없이 실행되지 않는가
//   4. 남은 미상 건수가 항상 보이는가 — 부분 완료가 정상이다

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

const METHODS = [
  { id: 1, name: '하나카드', type: '신용' },
  { id: 2, name: '삼성카드', type: '신용' },
  { id: 9, name: '계좌이체', type: '이체' },
];

const PRODUCTS = [
  { id: 10, payment_method_id: 1, issuer: '하나', product_name: '하나 A', payment_method_name: '하나카드' },
  { id: 11, payment_method_id: 1, issuer: '하나', product_name: '하나 B', payment_method_name: '하나카드' },
];

const PLAN = {
  target: { id: 10, product_name: '하나 A', payment_method_name: '하나카드' },
  count: 260,
  already_assigned: 0,
  samples: [
    { id: 1, date: '2026-03-02', merchant: '스타벅스', amount: -4500, before: null, after: '하나 A' },
  ],
  preview_token: 'token-260',
  remaining_unassigned: 265,
  undoable: true,
};

function mockLoad({ products = PRODUCTS, unassigned = 265 } = {}) {
  get.mockImplementation((path) => {
    if (path === '/api/card-products') return Promise.resolve({ data: products });
    if (path === '/api/card-products/unassigned-count') return Promise.resolve({ unassigned });
    return Promise.resolve({ data: [] });
  });
}

const setup = (props = {}) =>
  render(
    <ConfirmProvider>
      <CardRemapSection paymentMethods={METHODS} {...props} />
    </ConfirmProvider>
  );

// 카드를 고르는 것이 모든 흐름의 시작이다. 고른 뒤 프리뷰가 돌아올 때까지 기다린다.
async function pickCard(user, value = '10') {
  await user.selectOptions(await screen.findByLabelText(/어느 카드로 옮길까요/), value);
  await waitFor(() => expect(post).toHaveBeenCalled());
}

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

  it('A-2. 카드사가 하나도 없어도 같은 안내를 낸다', async () => {
    mockLoad({ products: [] });
    setup({ paymentMethods: [] });
    expect(await screen.findByText('먼저 카드를 등록해 주세요')).toBeTruthy();
  });
});

describe('B. 남은 미상 건수', () => {
  it('B-1. 화면에 들어오면 바로 보인다', async () => {
    setup();
    expect((await screen.findByTestId('remap-unassigned')).textContent).toContain('265건');
  });

  it('B-2. 카드를 고르기 전에는 프리뷰를 부르지 않는다', async () => {
    setup();
    await screen.findByTestId('remap-unassigned');
    expect(post).not.toHaveBeenCalled();
  });
});

describe('C. 프리뷰 — 실행 전에 건수가 보인다', () => {
  it('C-1. 카드를 고르면 몇 건이 바뀌는지 보여준다', async () => {
    const user = userEvent.setup();
    setup();
    await pickCard(user);
    expect(await screen.findByText('260건이 바뀌어요')).toBeTruthy();
  });

  it('C-2. 프리뷰 호출은 고른 카드를 조건에 싣는다', async () => {
    const user = userEvent.setup();
    setup();
    await pickCard(user);
    expect(post).toHaveBeenCalledWith('/api/card-products/remap/preview',
      expect.objectContaining({ card_product_id: 10 }));
  });

  it('C-3. 대표 사례를 전 → 후로 보여준다', async () => {
    const user = userEvent.setup();
    setup();
    await pickCard(user);
    expect(await screen.findByText(/미상 →/)).toBeTruthy();
    expect(screen.getByText('스타벅스')).toBeTruthy();
  });

  it('C-4. 걸리는 거래가 없으면 그렇게 말한다', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({ ...PLAN, count: 0, samples: [] });
    setup();
    await pickCard(user);
    expect(await screen.findByText(/조건에 걸리는 거래가 없어요/)).toBeTruthy();
  });

  it('C-5. 덮어쓰는 건수가 있으면 실행 전에 알린다', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({ ...PLAN, already_assigned: 12 });
    setup();
    await pickCard(user);
    expect(await screen.findByText(/12건은 이미 다른 카드로 지정돼 있어요/)).toBeTruthy();
  });

  it('C-6. 프리뷰가 거절되면 그 이유를 보여준다', async () => {
    const user = userEvent.setup();
    post.mockRejectedValue(new Error('기간은 YYYY-MM-DD 형식으로 입력해 주세요.'));
    setup();
    await pickCard(user);
    expect((await screen.findByRole('alert')).textContent).toMatch(/YYYY-MM-DD/);
  });
});

describe('D. 조건을 고치면 건수가 따라온다', () => {
  it('D-1. 가맹점을 넣으면 다시 센다', async () => {
    const user = userEvent.setup();
    setup();
    await pickCard(user);
    post.mockResolvedValue({ ...PLAN, count: 31, preview_token: 'token-31' });

    await user.type(screen.getByLabelText('가맹점'), '스타벅스');

    expect(await screen.findByText('31건이 바뀌어요')).toBeTruthy();
    expect(post).toHaveBeenLastCalledWith('/api/card-products/remap/preview',
      expect.objectContaining({ merchant: '스타벅스' }));
  });

  it('D-2. 빈 칸은 조건으로 보내지 않는다', async () => {
    const user = userEvent.setup();
    setup();
    await pickCard(user);
    const body = post.mock.calls[0][1];
    expect(body.merchant).toBeUndefined();
    expect(body.from).toBeUndefined();
    expect(body.max_amount).toBeUndefined();
  });

  it('D-3. 덮어쓰기를 켜면 조건에 실린다', async () => {
    const user = userEvent.setup();
    setup();
    await pickCard(user);

    await user.click(screen.getByLabelText(/이미 다른 카드로 지정한 거래도 덮어쓰기/));

    await waitFor(() => {
      expect(post).toHaveBeenLastCalledWith('/api/card-products/remap/preview',
        expect.objectContaining({ include_assigned: true }));
    });
  });
});

describe('E. 확인 없이 실행되지 않는다', () => {
  it('E-1. 프리뷰 전에는 옮기기를 누를 수 없다', async () => {
    setup();
    await screen.findByTestId('remap-unassigned');
    expect(screen.queryByText('옮기기')).toBeNull();
  });

  it('E-2. 0건이면 옮기기가 비활성이다', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({ ...PLAN, count: 0, samples: [] });
    setup();
    await pickCard(user);
    expect(screen.getByText('옮기기').disabled).toBe(true);
  });

  it('E-3. 확인 창에 건수와 카드 이름이 나온다', async () => {
    const user = userEvent.setup();
    setup();
    await pickCard(user);
    await user.click(await screen.findByText('옮기기'));

    expect(await screen.findByText(/260건을 '하나 A' 로 옮길까요/)).toBeTruthy();
  });

  it('E-4. 확인을 취소하면 실행하지 않는다', async () => {
    const user = userEvent.setup();
    setup();
    await pickCard(user);
    await user.click(await screen.findByText('옮기기'));
    await user.click(await screen.findByText('취소'));

    const executed = post.mock.calls.filter(([p]) => p === '/api/card-products/remap');
    expect(executed).toHaveLength(0);
  });

  it('E-5. 확인하면 프리뷰가 준 지문을 실어 실행한다', async () => {
    const user = userEvent.setup();
    setup();
    await pickCard(user);
    post.mockResolvedValue({ ok: true, updated: 260, remaining_unassigned: 5, target: PLAN.target });

    await user.click(await screen.findByText('옮기기'));
    await user.click(await screen.findByText('확인'));

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/api/card-products/remap',
        expect.objectContaining({ preview_token: 'token-260', card_product_id: 10 }));
    });
  });
});

describe('F. 실행 뒤', () => {
  async function runRemap(user, result) {
    await pickCard(user);
    post.mockResolvedValue(result);
    await user.click(await screen.findByText('옮기기'));
    await user.click(await screen.findByText('확인'));
  }

  it('F-1. 몇 건을 어디로 옮겼는지 알린다', async () => {
    const user = userEvent.setup();
    setup();
    await runRemap(user, { ok: true, updated: 260, remaining_unassigned: 5, target: PLAN.target });

    expect((await screen.findByRole('status')).textContent).toMatch(/260건을 ‘하나 A’ 로 옮겼어요/);
  });

  it('F-2. 남은 미상 건수를 갱신해 보여준다 — 이어서 할 수 있다', async () => {
    const user = userEvent.setup();
    setup();
    await runRemap(user, { ok: true, updated: 260, remaining_unassigned: 5, target: PLAN.target });

    expect((await screen.findByRole('status')).textContent).toMatch(/아직 카드 미상 5건이 남아 있어요/);
    await waitFor(() => {
      expect(screen.getByTestId('remap-unassigned').textContent).toContain('5건');
    });
  });

  it('F-3. 다 정리되면 끝났다고 말한다', async () => {
    const user = userEvent.setup();
    setup();
    await runRemap(user, { ok: true, updated: 260, remaining_unassigned: 0, target: PLAN.target });

    expect((await screen.findByRole('status')).textContent).toMatch(/모두 정리됐어요/);
  });

  it('F-4. 지문이 만료되면 서버 문구를 그대로 보여준다', async () => {
    const user = userEvent.setup();
    setup();
    await pickCard(user);
    post.mockRejectedValue(new Error('미리보기를 본 뒤 대상이 달라졌어요. 다시 확인하고 옮겨 주세요.'));

    await user.click(await screen.findByText('옮기기'));
    await user.click(await screen.findByText('확인'));

    expect(await screen.findByText(/다시 확인하고 옮겨 주세요/)).toBeTruthy();
  });
});
