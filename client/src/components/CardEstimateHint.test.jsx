import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CardEstimateHint from './CardEstimateHint';

// 거래 입력 시점 카드 추천(#437).
//
// `/api/card-strategy/estimate` 는 완성돼 있었는데 **부르는 곳이 없었다.**
// 카드 추천의 값어치는 결제 직전에 나온다 — 사후 비교는 이미 늦은 정보다.
//
// 여기서 잠그는 것은 대부분 **문구 규칙**이다(#277 이 이 이슈의 난이도라고 적었다).
//   1. 추정을 단정으로 쓰지 않는가 — 이번 달 쓴 혜택을 모르므로 추정이 더 클 수 있다
//   2. 비교 대상이 없을 때 비교한 척하지 않는가
//   3. 계산이 실패해도 입력을 막지 않는가

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../lib/api', () => ({
  api: { get, post: vi.fn(), put: vi.fn(), del: vi.fn(), raw: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

// 서버가 주는 모양 그대로다.
const CARD = {
  cardProductId: 10, issuer: '하나', productName: '하나 A', isActive: true,
  thresholdMet: true, thresholdEstimated: false,
  benefit: 2500, applied: { rate: 5, matched: 'category' }, skipped: [], capped: false,
};

const RESULT = { data: [CARD], comparable: true, capUnknown: true, asOf: '2026-08-05' };


// 추천 한 줄은 `<strong>카드이름</strong> · 약 2,500원` 처럼 요소가 쪼개져 있다.
// `getByText` 는 한 요소의 전체 텍스트가 맞아야 찾으므로, 줄 단위로 본다.
function hintLine() {
  const strong = screen.getByText('하나 A');
  return strong.closest('p');
}

const setup = (props = {}) =>
  render(<CardEstimateHint amount="50000" categoryId="1" merchant="스타벅스" {...props} />);

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue(RESULT);
  vi.useRealTimers();
});

describe('A. 언제 부르나', () => {
  it('A-1. 금액이 있으면 추정을 부른다', async () => {
    setup();
    await waitFor(() => expect(get).toHaveBeenCalled());
    const call = get.mock.calls[0][0];
    expect(call).toContain('/api/card-strategy/estimate');
    expect(call).toContain('amount=50000');
  });

  it('A-2. 금액이 없으면 부르지 않는다', async () => {
    setup({ amount: '' });
    await new Promise((r) => setTimeout(r, 600));
    expect(get).not.toHaveBeenCalled();
  });

  it('A-3. 금액이 0 이면 부르지 않는다', async () => {
    setup({ amount: '0' });
    await new Promise((r) => setTimeout(r, 600));
    expect(get).not.toHaveBeenCalled();
  });

  it('A-4. 카테고리와 가맹점을 조건에 싣는다', async () => {
    setup();
    await waitFor(() => expect(get).toHaveBeenCalled());
    const call = get.mock.calls[0][0];
    expect(call).toContain('category_id=1');
    // 가맹점명은 퍼센트 인코딩돼 실린다. 그게 `URLSearchParams` 를 쓰는 이유다 —
    // 직접 이어붙이면 이름에 `&` 가 든 순간 쿼리가 쪼개진다.
    const q = new URLSearchParams(call.split('?')[1]);
    expect(q.get('merchant')).toBe('스타벅스');
  });

  it('A-4b. 가맹점명에 & 가 있어도 조건이 안 쪼개진다', async () => {
    // 직접 이어붙인 쿼리라면 여기서 `merchant` 가 잘리고 뒤가 다른 파라미터로
    // 읽힌다. 사용자는 추천이 왜 이상한지 알 수 없다.
    setup({ merchant: 'A&W 버거' });
    await waitFor(() => expect(get).toHaveBeenCalled());

    const q = new URLSearchParams(get.mock.calls[0][0].split('?')[1]);
    expect(q.get('merchant')).toBe('A&W 버거');
    expect(q.get('amount')).toBe('50000');
  });

  it('A-5. 가맹점을 안 넣으면 조건에서 뺀다', async () => {
    setup({ merchant: '' });
    await waitFor(() => expect(get).toHaveBeenCalled());
    const call = get.mock.calls[0][0];
    expect(call).not.toContain('merchant=');
  });
});

describe('B. 무엇을 말하나', () => {
  it('B-1. 1위 카드와 추정 혜택을 보여준다', async () => {
    setup();
    const cardName = await screen.findByText('하나 A');
    expect(cardName).toBeTruthy();
    await screen.findByText('하나 A');
    expect(hintLine().textContent).toMatch(/약/);
    expect(hintLine().textContent).toMatch(/2,500/);
  });

  it('B-2. 추정이라는 것을 늘 말한다', async () => {
    setup();
    const hint = await screen.findByText(/이번 달 이미 받은 혜택은 계산에 안 들어가서/);
    expect(hint).toBeTruthy();
    // capUnknown 은 추정이 실제보다 클 수 있다 라는 뜻이다.
  });

  it('B-3. 비교 대상이 없으면 비교한 척하지 않는다', async () => {
    get.mockResolvedValue({ ...RESULT, comparable: false });
    setup();
    const hint = await screen.findByText(/한 장뿐이라 비교한 값은 아니에요/);
    expect(hint).toBeTruthy();
    // 비교 대상이 없는 것과 비교해서 이긴 것은 다르다
  });

  it('B-4. 혜택이 0 이면 추정 단서를 붙이지 않는다', async () => {
    get.mockResolvedValue({ ...RESULT, data: [{ ...CARD, benefit: 0, applied: null }] });
    setup();
    await screen.findByText('하나 A');
    expect(hintLine().textContent).toMatch(/혜택 없음/);
    const hint = screen.queryByText(/이번 달 이미 받은 혜택/);
    expect(hint).toBeNull();
    // 0 에 "실제로는 이보다 적을 수 있어요" 를 붙이면 말이 안 된다
  });

  it('B-5. 카드가 없으면 무엇을 하면 되는지 말한다', async () => {
    get.mockResolvedValue({ ...RESULT, data: [] });
    setup();
    const hint = await screen.findByText(/설정에서 카드를 넣으면/);
    expect(hint).toBeTruthy();
  });
});

describe('C. 입력을 막지 않는다', () => {
  it('C-1. 계산이 실패해도 아무것도 안 띄운다', async () => {
    // 보조 정보라 실패를 알리면 사용자가 입력을 멈추고 원인을 찾게 된다.
    //
    // **"카드가 없어요" 로 대신 말해도 안 된다.** 카드는 있는데 계산이 실패한
    // 것이라, 그렇게 말하면 사용자가 설정으로 가서 있는 카드를 다시 넣는다.
    // 아무것도 안 그리는 것이 맞다.
    get.mockRejectedValue(new Error('서버 오류'));
    const { container } = setup();
    await new Promise((r) => setTimeout(r, 600));

    expect(screen.queryByText(/서버 오류/)).toBe(null);
    expect(screen.queryByRole('alert')).toBe(null);
    expect(screen.queryByText(/설정에서 카드를 넣으면/)).toBe(null);
    expect(container.textContent).toBe('');
  });

  it('C-2. 응답에 data 가 없어도 죽지 않는다', async () => {
    get.mockResolvedValue({ comparable: true, capUnknown: true });
    setup();
    await new Promise((r) => setTimeout(r, 600));
    const hint = await screen.findByText(/설정에서 카드를 넣으면/);
    expect(hint).toBeTruthy();
    // 여기서 죽으면 힌트 하나가 거래 입력 폼을 통째로 못 뜨게 한다
  });
});
