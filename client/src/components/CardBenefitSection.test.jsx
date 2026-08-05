import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CardBenefitSection from './CardBenefitSection';
import { ConfirmProvider } from './ConfirmProvider';

// 카드 혜택 입력(#435).
//
// `card_benefits` 테이블도 CRUD 엔드포인트도 다 있었는데 **화면이 없어서** 추천
// 엔드포인트에 먹일 데이터가 안 들어갔다. M8 전체가 이 입력 하나에 막혀 있었다.
//
// 여기서 잠그는 것.
//   1. 비율 0% 를 값으로 취급하는가 — "이 대상엔 혜택 없음" 을 명시한 값이다
//   2. 빈 칸과 0 을 구분해 보내는가 — 월 한도 빈 칸을 0 으로 보내면 "한도 0원" 이 된다
//   3. 없는 조건을 말하지 않는가 — "한도 없음" 을 적으면 한도가 있는 것처럼 읽힌다
//   4. 지우기 전에 확인을 받는가

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del, raw: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

vi.mock('./EmptyState', () => ({
  default: ({ title, description }) => <div><p>{title}</p><p>{description}</p></div>,
}));

const CARDS = [
  { id: 10, product_name: '하나 A', payment_method_name: '하나카드', issuer: '하나', is_active: 1 },
  { id: 11, product_name: '옛날카드', payment_method_name: '삼성카드', issuer: '삼성', is_active: 0 },
];

const CATEGORIES = [
  { id: 1, name: '식비' },
  { id: 2, name: '교통' },
];

// 서버가 주는 모양 그대로다. category_name 은 조인 결과다.
const BENEFIT = {
  id: 100, card_product_id: 10, benefit_type: '적립', rate: 5,
  category_id: 1, category_name: '식비', merchant_pattern: null,
  monthly_cap: 10000, min_amount: 5000, memo: null,
};

function mockLoad({ cards = CARDS, benefits = [BENEFIT] } = {}) {
  get.mockImplementation((path) => {
    if (path.startsWith('/api/card-products')) return Promise.resolve({ data: cards });
    if (path.startsWith('/api/card-benefits')) return Promise.resolve({ data: benefits });
    return Promise.resolve({ data: [] });
  });
}

const setup = () =>
  render(
    <ConfirmProvider>
      <CardBenefitSection categories={CATEGORIES} />
    </ConfirmProvider>
  );

// 카드를 고르는 것이 모든 흐름의 시작이다.
async function pickCard(user, value = '10') {
  await user.selectOptions(await screen.findByLabelText(/어느 카드의 혜택인가요/), value);
  await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringContaining('/api/card-benefits')));
}

beforeEach(() => {
  get.mockReset(); post.mockReset(); put.mockReset(); del.mockReset();
  mockLoad();
  post.mockResolvedValue({ id: 1, ok: true });
  put.mockResolvedValue({ ok: true });
  del.mockResolvedValue({ ok: true });
});

describe('A. 빈 상태', () => {
  it('A-1. 카드가 없으면 먼저 등록하라고 말한다', async () => {
    mockLoad({ cards: [] });
    setup();
    expect(await screen.findByText(/먼저 카드를 등록해 주세요/)).toBeTruthy();
  });

  it('A-3. 응답에 data 가 없어도 죽지 않는다', async () => {
    // 이 섹션은 설정 화면 안에 있다. 여기서 터지면 설정 화면이 통째로 안 뜬다 —
    // 실제로 `SettingsPaymentAccount.test.jsx` 가 이 결함으로 5건 깨졌다.
    get.mockImplementation(() => Promise.resolve({}));
    setup();
    expect(await screen.findByText('먼저 카드를 등록해 주세요')).toBeTruthy();
  });

  it('A-2. 카드가 없으면 혜택을 부르지 않는다', async () => {
    mockLoad({ cards: [] });
    setup();
    await waitFor(() => expect(get).not.toHaveBeenCalledWith(expect.stringContaining('/api/card-benefits')));
  });
});

describe('B. 목록', () => {
  it('B-1. 고른 카드의 혜택을 보여준다', async () => {
    setup();
    await pickCard(userEvent);
    expect(screen.getByText(/5% 적립/)).toBeTruthy();
    expect(screen.getByText(/식비/)).toBeTruthy();
  });

  it('B-2. 비율 0% 혜택도 목록에 나온다', async () => {
    mockLoad({ benefits: [{ ...BENEFIT, rate: 0 }] });
    setup();
    await pickCard(userEvent);
    expect(screen.getByText(/0% 적립/)).toBeTruthy();
  });

  it('B-3. 대상이 없으면 모든 결제라고 적는다', async () => {
    mockLoad({ benefits: [{ ...BENEFIT, category_id: null, category_name: null, merchant_pattern: null }] });
    setup();
    await pickCard(userEvent);
    expect(screen.getByText(/모든 결제/)).toBeTruthy();
  });

  it('B-4. 카테고리와 가맹점이 둘 다 있으면 둘 다 적는다', async () => {
    mockLoad({ benefits: [{ ...BENEFIT, merchant_pattern: '스타벅스' }] });
    setup();
    await pickCard(userEvent);
    expect(screen.getByText(/식비/)).toBeTruthy();
    expect(screen.getByText(/스타벅스/)).toBeTruthy();
  });

  it('B-5. 없는 조건은 말하지 않는다', async () => {
    // 특정 문구의 부재만 보면 약하다 — 다른 말로 "한도 없음" 을 적어도 통과한다.
    // 조건이 하나도 없으면 **그 줄에 조건 이야기가 아예 없어야** 하므로 줄 전체를
    // 본다. "한도 없음" 을 적으면 한도가 설정된 것처럼 읽힌다.
    mockLoad({ benefits: [{ ...BENEFIT, monthly_cap: null, min_amount: 0 }] });
    setup();
    await pickCard(userEvent);

    const row = (await screen.findByText(/5% 적립/)).closest('li');
    expect(row.textContent).not.toMatch(/한도/);
    expect(row.textContent).not.toMatch(/월/);
    expect(row.textContent).not.toMatch(/이상/);
    // 대상은 그대로 나와야 한다 — 줄 전체가 사라진 것을 통과로 읽으면 안 된다
    expect(row.textContent).toMatch(/식비/);
  });

  it('B-6. 혜택이 없으면 왜 넣어야 하는지 말한다', async () => {
    mockLoad({ benefits: [] });
    setup();
    await pickCard(userEvent);
    expect(screen.getByText(/카드 추천이 모든 카드를 똑같이 봅니다/)).toBeTruthy();
  });
});

describe('C. 추가', () => {
  it('C-1. 카드를 고르기 전에는 추가 버튼이 없다', async () => {
    setup();
    expect(screen.queryByText(/혜택 추가/)).toBeNull();
  });

  it('C-2. 저장하면 고른 카드 id 를 실어 보낸다', async () => {
    setup();
    await pickCard(userEvent);
    const user = userEvent.setup();
    await user.click(screen.getByText(/혜택 추가/));
    await user.type(screen.getByLabelText(/비율/), '7');
    await user.click(screen.getByText(/저장/));
    expect(post).toHaveBeenCalledWith(
      '/api/card-benefits',
      expect.objectContaining({ card_product_id: 10, benefit_type: '할인', rate: 7 })
    );
  });

  it('C-3. 빈 칸은 안 보내고 0 은 보낸다', async () => {
    setup();
    await pickCard(userEvent);
    const user = userEvent.setup();
    await user.click(screen.getByText(/혜택 추가/));
    await user.type(screen.getByLabelText(/비율/), '0');
    await user.type(screen.getByLabelText(/건당 최소 결제액/), '0');
    await user.click(screen.getByText(/저장/));
    const call = post.mock.calls[0][1];
    expect(call.rate).toBe(0);
    expect(call.min_amount).toBe(0);
    expect(call.monthly_cap).toBeUndefined();
  });

  it('C-4. 비율이 비어 있으면 저장하지 않는다', async () => {
    setup();
    await pickCard(userEvent);
    const user = userEvent.setup();
    await user.click(screen.getByText(/혜택 추가/));
    await user.click(screen.getByText(/저장/));
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText(/혜택 비율을 입력해 주세요/)).toBeTruthy();
  });
});

describe('D. 수정', () => {
  it('D-1. 수정을 누르면 그 값이 폼에 들어온다', async () => {
    setup();
    await pickCard(userEvent);
    const user = userEvent.setup();
    await user.click(screen.getByText(/수정/));
    expect(screen.getByLabelText(/비율/).value).toBe('5');
    expect(screen.getByLabelText(/월 한도/).value).toBe('10000');
  });

  it('D-2. 비어 있던 값은 빈 칸으로 들어온다', async () => {
    // `String(null)` 은 `'null'` 이다. 그대로 폼에 들어가면 저장할 때 그 문자열이
    // 그대로 나가고, 서버는 `Number('null')` → NaN 을 받는다.
    //
    // 폼이 실제로 열렸는지부터 확인한다 — 안 열린 상태로 단언하면 무엇을 재는지
    // 알 수 없다.
    const user = userEvent.setup();
    mockLoad({ benefits: [{ ...BENEFIT, monthly_cap: null, min_amount: 0 }] });
    setup();
    await pickCard(user);

    await user.click(await screen.findByRole('button', { name: '수정' }));
    await waitFor(() => expect(screen.getByLabelText(/비율/).value).toBe('5'));

    // `type="number"` 입력은 `'null'` 같은 비숫자 값을 받으면 `.value` 가 `''` 로
    // 읽힌다 — **DOM 으로는 이 결함이 안 보인다.** 실제 피해는 저장할 때 나오므로
    // 저장까지 밀어 확인한다. `Number('null')` 은 NaN 이고, NaN 이 서버로 가면
    // 그 혜택은 조용히 깨진다.
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    const body = put.mock.calls[0][1];
    expect(body.monthly_cap).toBeUndefined();
    expect(Object.values(body).some((v) => Number.isNaN(v))).toBe(false);
  });

  it('D-3. 저장하면 PUT 으로 간다', async () => {
    setup();
    await pickCard(userEvent);
    const user = userEvent.setup();
    await user.click(screen.getByText(/수정/));
    await user.click(screen.getByText(/저장/));
    expect(put).toHaveBeenCalledWith('/api/card-benefits/100', expect.anything());
  });
});

describe('E. 삭제', () => {
  it('E-1. 확인해야 지운다', async () => {
    setup();
    await pickCard(userEvent);
    const user = userEvent.setup();
    await user.click(screen.getByText(/삭제/));
    await user.click(screen.getByText(/확인/));
    expect(del).toHaveBeenCalledWith('/api/card-benefits/100');
  });

  it('E-2. 취소하면 안 지운다', async () => {
    setup();
    await pickCard(userEvent);
    const user = userEvent.setup();
    await user.click(screen.getByText(/삭제/));
    await user.click(screen.getByText(/취소/));
    expect(del).not.toHaveBeenCalled();
  });
});
