import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CardProductSection from './CardProductSection';
import { ConfirmProvider } from './ConfirmProvider';

// #302 1단계 — 보유 카드 등록·관리.
//
// #274 가 스키마를, #276 이 혜택 추정 계산을 만들었는데 **사용자가 카드를 등록할
// 동선이 없어서** 계산이 먹일 데이터를 못 받고 있었다. 실사용 DB 의 등록 카드는
// 0장이다.
//
// 여기서 잠그는 것.
//   1. 카드사 하나에 카드 여러 장이 되는가 (#274 가 UNIQUE 를 안 건 이유)
//   2. 빈 상태가 무엇을 해야 하는지 말하는가
//   3. 청구주기 미설정을 숨기지 않는가 — 반쪽이면 청구월 계산이 폴백한다

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, delete: del },
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
  { id: 10, payment_method_id: 1, issuer: '하나', product_name: '하나 A', card_type: '신용', annual_fee: 15000, prev_month_threshold: 300000, statement_close_day: 25, billing_cycle_day: 15 },
  { id: 11, payment_method_id: 1, issuer: '하나', product_name: '하나 B', card_type: '체크', annual_fee: 0, prev_month_threshold: null, statement_close_day: null, billing_cycle_day: null },
];

const setup = (props = {}) =>
  render(
    <ConfirmProvider>
      <CardProductSection paymentMethods={METHODS} {...props} />
    </ConfirmProvider>
  );

beforeEach(() => {
  get.mockReset(); post.mockReset(); put.mockReset(); del.mockReset();
  get.mockResolvedValue({ data: [] });
});

describe('빈 상태', () => {
  it('카드가 없으면 무엇을 할 수 있는지 말한다', async () => {
    setup();
    expect(await screen.findByText('등록된 카드가 없어요')).toBeTruthy();
    expect(screen.getByText(/카드별 혜택 비교도 할 수 있어요/)).toBeTruthy();
  });

  it('결제수단이 아예 없으면 그쪽을 먼저 하라고 안내한다', async () => {
    setup({ paymentMethods: [] });
    expect(await screen.findByText('먼저 결제수단을 등록해 주세요')).toBeTruthy();
  });

  it('결제수단이 없으면 등록 버튼을 막는다', async () => {
    setup({ paymentMethods: [] });
    expect(screen.getByText('+ 카드 등록').disabled).toBe(true);
  });

  it('카드 아닌 결제수단은 카드사 후보에서 뺀다', async () => {
    // 계좌이체 아래 카드를 등록할 수는 없다.
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByText('+ 카드 등록'));
    const opts = [...screen.getByLabelText('카드사 *').querySelectorAll('option')].map((o) => o.textContent);
    expect(opts).toContain('하나카드');
    expect(opts).not.toContain('계좌이체');
  });
});

describe('목록', () => {
  it('카드사로 묶어서 보여준다', async () => {
    // 평평하게 나열하면 어느 카드사 것인지 매번 읽어야 한다.
    get.mockResolvedValue({ data: PRODUCTS });
    setup();
    expect(await screen.findByText('하나 A')).toBeTruthy();
    expect(screen.getByText('하나 B')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 4, name: '하나카드' })).toBeTruthy();
  });

  it('같은 카드사에 카드 두 장이 함께 뜬다', async () => {
    // #274 가 payment_method_id 에 UNIQUE 를 안 건 이유다.
    get.mockResolvedValue({ data: PRODUCTS });
    setup();
    await screen.findByText('하나 A');
    expect(screen.getByText('하나 B')).toBeTruthy();
  });

  it('연회비와 전월실적을 금액으로 적는다', async () => {
    get.mockResolvedValue({ data: PRODUCTS });
    setup();
    expect(await screen.findByText(/연회비 15,000원 · 전월실적 300,000원/)).toBeTruthy();
  });

  it('청구주기가 채워졌으면 마감·결제일을 보여준다', async () => {
    get.mockResolvedValue({ data: PRODUCTS });
    setup();
    expect(await screen.findByText(/25일 마감 · 15일 결제/)).toBeTruthy();
  });

  it('청구주기가 비면 그 사실을 숨기지 않는다', async () => {
    // 반쪽이면 청구월 계산이 구매일의 달로 폴백한다(#290). 모르고 있으면 안 된다.
    get.mockResolvedValue({ data: PRODUCTS });
    setup();
    expect(await screen.findByText(/청구주기 미설정/)).toBeTruthy();
  });
});

describe('등록', () => {
  it('입력한 값을 그대로 보낸다', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({ id: 1, ok: true });
    setup();
    await user.click(screen.getByText('+ 카드 등록'));

    await user.selectOptions(screen.getByLabelText('카드사 *'), '2');
    await user.type(screen.getByLabelText('카드 이름 *'), '삼성 iD ON');
    await user.type(screen.getByLabelText('발급사 *'), '삼성카드');
    await user.type(screen.getByLabelText('연회비 (원)'), '10000');
    await user.click(screen.getByText('저장'));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][0]).toBe('/api/card-products');
    expect(post.mock.calls[0][1]).toMatchObject({
      payment_method_id: 2, product_name: '삼성 iD ON', issuer: '삼성카드', annual_fee: 10000,
    });
  });

  it('비워 둔 선택 항목은 null 로 보낸다', async () => {
    // 0 으로 보내면 '전월실적 0원' 과 '기준 없음' 을 구분할 수 없다.
    const user = userEvent.setup();
    post.mockResolvedValue({ id: 1, ok: true });
    setup();
    await user.click(screen.getByText('+ 카드 등록'));
    await user.selectOptions(screen.getByLabelText('카드사 *'), '1');
    await user.type(screen.getByLabelText('카드 이름 *'), 'X');
    await user.type(screen.getByLabelText('발급사 *'), 'Y');
    await user.click(screen.getByText('저장'));

    await waitFor(() => expect(post).toHaveBeenCalled());
    const body = post.mock.calls[0][1];
    expect(body.prev_month_threshold).toBeNull();
    expect(body.statement_close_day).toBeNull();
    expect(body.annual_fee).toBe(0);
  });

  it('서버가 거절하면 사유를 그대로 보여준다', async () => {
    // 같은 카드사에 같은 이름이면 서버가 막는다.
    const user = userEvent.setup();
    post.mockRejectedValue(new Error('같은 이름의 카드가 이미 있습니다.'));
    setup();
    await user.click(screen.getByText('+ 카드 등록'));
    await user.selectOptions(screen.getByLabelText('카드사 *'), '1');
    await user.type(screen.getByLabelText('카드 이름 *'), '하나 A');
    await user.type(screen.getByLabelText('발급사 *'), '하나');
    await user.click(screen.getByText('저장'));

    expect(await screen.findByText('같은 이름의 카드가 이미 있습니다.')).toBeTruthy();
  });

  it('마감·결제일이 왜 필요한지 적는다', async () => {
    // 이유를 안 적으면 사용자는 비워 둔다.
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByText('+ 카드 등록'));
    expect(screen.getByText(/첫 청구월을 자동으로 계산해요/)).toBeTruthy();
  });
});

describe('수정·삭제', () => {
  it('수정하면 기존 값이 채워진다', async () => {
    const user = userEvent.setup();
    get.mockResolvedValue({ data: PRODUCTS });
    setup();
    await screen.findByText('하나 A');
    await user.click(screen.getAllByText('수정')[0]);
    expect(screen.getByLabelText('카드 이름 *').value).toBe('하나 A');
    expect(screen.getByLabelText('연회비 (원)').value).toBe('15000');
  });

  it('수정은 PUT 으로 보낸다', async () => {
    const user = userEvent.setup();
    get.mockResolvedValue({ data: PRODUCTS });
    put.mockResolvedValue({ ok: true });
    setup();
    await screen.findByText('하나 A');
    await user.click(screen.getAllByText('수정')[0]);
    await user.click(screen.getByText('저장'));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0][0]).toBe('/api/card-products/10');
  });

  it('삭제는 혜택도 지워진다고 알리고 확인받는다', async () => {
    const user = userEvent.setup();
    get.mockResolvedValue({ data: PRODUCTS });
    setup();
    await screen.findByText('하나 A');
    await user.click(screen.getAllByText('삭제')[0]);
    expect(await screen.findByText(/등록한 혜택도 함께 지워져요/)).toBeTruthy();
    // 확인 전에는 지우지 않는다
    expect(del).not.toHaveBeenCalled();
  });
});
