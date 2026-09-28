import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CardDetail from './CardDetail';

// 「혜택이 모르는 가맹점」 칸(#688).
//
// ─────────────────────────────────────────────────────────────────────────
// 이 화면이 고치려는 것
//
// 혜택은 가맹점 이름을 부분문자열로 맞춘다. 그래서 「씨유◯◯점」 은 패턴
// `CU` 에 안 걸린다. 실측(2026-09-17): 그 표기 8건 91,840원이 혜택을 못 받고
// 있었는데, **화면은 «해당하는 혜택이 없어요» 라고 말하고 있었다.**
//
// 없다고 말한 것이 사실은 못 찾은 것이었다. 이 칸은 그 둘을 구분해 말한다.
// 그래서 여기서 보는 것은 «목록이 그려진다» 가 아니라 **«무엇이라고 말하는가»** 다.

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../lib/api', () => ({
  api: { get, post: vi.fn(), put: vi.fn(), del: vi.fn(), raw: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

vi.mock('wouter', () => ({
  Link: ({ children }) => <span>{children}</span>,
}));

// 가맹점 이름은 전부 지어낸 것이다. 실제 보유 카드·이용내역을 쓰지 않는다 —
// 이 저장소는 공개다. 다만 **표기 변형의 모양**은 실제와 같아야 한다.
// 그 모양이 이 화면의 존재 이유이기 때문이다.
const card = (unmatched) => ({
  cardProductId: 1,
  issuer: '예시카드사',
  productName: '편의점 예시카드',
  cardType: '체크',
  isActive: true,
  benefits: [],
  activeBenefitCount: 0,
  monthlyLines: [],
  monthlyTotal: 0,
  unmatched,
  threshold: {
    period: { start: '2026-07-01', end: '2026-07-31' },
    spend: 0, met: true, tier: null, tiers: [],
    nextTier: null, toNextTier: 0, estimated: true,
  },
});

const NONE = { merchants: [], distinctCount: 0, count: 0, amount: 0 };

async function renderLoaded(cards) {
  get.mockResolvedValue({ data: cards, asOf: '2026-09-17' });
  render(<CardDetail />);
  await waitFor(() => expect(screen.queryByText('로딩 중...')).toBeNull());
}

beforeEach(() => {
  get.mockReset();
});

describe('CardDetail — 혜택이 모르는 가맹점', () => {
  it('없으면 칸을 아예 그리지 않는다 — 빈 상자는 «뭔가 잘못됐나» 로 읽힌다', async () => {
    await renderLoaded([card(NONE)]);
    expect(screen.queryByText(/혜택이 붙지 않은 가맹점/)).toBeNull();
  });

  it('서버가 칸을 안 보내도 죽지 않는다 — 옛 응답과 섞여 들어올 수 있다', async () => {
    await renderLoaded([card(undefined)]);
    expect(screen.getByText('편의점 예시카드')).toBeTruthy();
    expect(screen.queryByText(/혜택이 붙지 않은 가맹점/)).toBeNull();
  });

  it('곳 수·건수·금액을 적고 가맹점을 건수와 함께 나열한다', async () => {
    await renderLoaded([card({
      merchants: [
        { merchant: '씨유◯◯점', count: 3, amount: 27190 },
        { merchant: '씨유 △△점', count: 1, amount: 26270 },
      ],
      distinctCount: 2, count: 4, amount: 53460,
    })]);

    expect(screen.getByText('혜택이 붙지 않은 가맹점 2곳 · 4건 53,460원')).toBeTruthy();
    expect(screen.getByText('씨유◯◯점')).toBeTruthy();
    expect(screen.getByText('3건 27,190원')).toBeTruthy();
    expect(screen.getByText('씨유 △△점')).toBeTruthy();
  });

  it('«혜택이 없다» 고 단정하지 않는다 — 표기가 갈려 못 찾았을 수 있다고 말한다', async () => {
    await renderLoaded([card({
      merchants: [{ merchant: '씨유◯◯점', count: 3, amount: 27190 }],
      distinctCount: 1, count: 3, amount: 27190,
    })]);

    // 이 문구가 사라지면 화면은 다시 «없다» 고 단정한다. #688 의 사고가
    // 정확히 그것이었다.
    expect(screen.getByText(/이름과 영수증 표기가 달라 못 찾은 것일 수도/)).toBeTruthy();
  });

  it('목록이 잘리면 «외 N곳» 으로 나머지를 말한다 — 다 본 줄 알면 안 된다', async () => {
    await renderLoaded([card({
      merchants: [{ merchant: '가게1', count: 1, amount: 1000 }],
      distinctCount: 19, count: 21, amount: 251320,
    })]);

    expect(screen.getByText('외 18곳')).toBeTruthy();
  });

  it('카드가 여럿이면 자기 카드 밑에만 붙는다', async () => {
    const clean = { ...card(NONE), cardProductId: 2, productName: '깨끗한 예시카드' };
    await renderLoaded([
      card({
        merchants: [{ merchant: '씨유◯◯점', count: 3, amount: 27190 }],
        distinctCount: 1, count: 3, amount: 27190,
      }),
      clean,
    ]);

    expect(screen.getAllByText(/혜택이 붙지 않은 가맹점/)).toHaveLength(1);
  });
});
