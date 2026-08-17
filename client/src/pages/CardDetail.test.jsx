import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import CardDetail from './CardDetail';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

// 실제 api 객체(lib/api.js)의 표면을 그대로 흉내낸다. 없는 이름을 지어내면
// 화면이 그것을 불러도 테스트만 통과한다.
vi.mock('../lib/api', () => ({
  api: { get, post: vi.fn(), put: vi.fn(), del: vi.fn(), raw: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

vi.mock('wouter', () => ({
  Link: ({ children }) => <span>{children}</span>,
}));

// 이름은 전부 지어낸 것이다. 실제 보유 카드 이름을 쓰지 않는다 —
// 이 저장소는 공개라 상품명이 나가면 안 된다. 역할이 이름에 드러나게 짓는다.
const benefit = (over = {}) => ({
  id: 11,
  categoryName: '교통',
  merchantPattern: null,
  benefitType: '적립',
  rate: 2,
  monthlyCap: 10000,
  minAmount: 0,
  paymentStyle: null,
  tierId: null,
  tierLabel: null,
  tierMinSpend: null,
  activeNow: true,
  ...over,
});

const card = (over = {}) => ({
  cardProductId: 1,
  issuer: '예시카드사',
  productName: '구간형 예시카드',
  cardType: '신용',
  isActive: true,
  benefits: [],
  activeBenefitCount: 0,
  // 서버가 실제로 내는 칸이다(#579). 지금 화면은 안 그리지만 픽스처는
  // 응답 표면을 그대로 흉내낸다 — 빼 두면 나중에 그릴 때 픽스처부터 틀린다.
  monthlyLines: [],
  monthlyTotal: 0,
  ...over,
  // over 뒤에 둔다. 앞에 두면 over.threshold 가 병합 결과를 통째로 덮어써서
  // 호출자가 준 칸 말고는 전부 사라진다.
  threshold: {
    period: { start: '2026-07-01', end: '2026-07-31' },
    spend: 320000,
    met: true,
    tier: null,
    tiers: [],
    nextTier: null,
    toNextTier: 0,
    estimated: true,
    ...(over.threshold || {}),
  },
});

// 로딩이 걷힐 때까지 기다린다. 안 기다리면 껍데기만 보고 통과한다.
async function renderLoaded(cards) {
  get.mockResolvedValue({ data: cards, asOf: '2026-08-12' });
  render(<CardDetail />);
  await waitFor(() => expect(screen.queryByText('로딩 중...')).toBeNull());
}

beforeEach(() => {
  get.mockReset();
});

describe('CardDetail 불러오기', () => {
  it('부르는 동안에는 로딩만 보인다', () => {
    get.mockReturnValue(new Promise(() => {}));
    render(<CardDetail />);
    expect(screen.getByText('로딩 중...')).toBeTruthy();
    expect(screen.queryByText('카드 상세')).toBe(null);
  });

  it('카드가 없으면 등록 안내를 낸다', async () => {
    await renderLoaded([]);
    expect(screen.getByText('등록된 카드가 없어요')).toBeTruthy();
  });

  it('카드 이름과 발급사·종류를 적는다', async () => {
    await renderLoaded([card()]);
    expect(screen.getByText('구간형 예시카드')).toBeTruthy();
    expect(screen.getByText('예시카드사 · 신용')).toBeTruthy();
  });

  it('실적 기간과 사용액을 적는다', async () => {
    await renderLoaded([card()]);
    expect(screen.getByText('2026-07-01 ~ 2026-07-31 사용액 320,000원')).toBeTruthy();
  });
});

describe('CardDetail 혜택 줄', () => {
  it('이번 달 걸리는 혜택에는 적용 배지가 붙는다', async () => {
    await renderLoaded([card({ benefits: [benefit({ activeNow: true })], activeBenefitCount: 1 })]);
    expect(screen.getByText('이번 달 적용')).toBeTruthy();
    expect(screen.queryByText('이번 달 미적용')).toBe(null);
  });

  it('안 걸리는 혜택도 지우지 않고 미적용으로 남긴다', async () => {
    await renderLoaded([card({ benefits: [benefit({ activeNow: false })], activeBenefitCount: 0 })]);
    expect(screen.getByText('이번 달 미적용')).toBeTruthy();
    expect(screen.queryByText('이번 달 적용')).toBe(null);
    // 대상과 금액은 그대로 보인다 — 감추면 같은 혜택을 또 등록하게 된다
    expect(screen.getByText('교통')).toBeTruthy();
  });

  it('결제방식·구간·최소금액 제약을 배지로 적는다', async () => {
    await renderLoaded([card({
      benefits: [benefit({ paymentStyle: '일시불', tierLabel: '40만원 이상', minAmount: 10000 })],
      activeBenefitCount: 1,
    })]);
    expect(screen.getByText('일시불만')).toBeTruthy();
    expect(screen.getByText('40만원 이상')).toBeTruthy();
    expect(screen.getByText('10,000원 이상')).toBeTruthy();
  });

  it('제약이 없으면 그 배지를 만들지 않는다', async () => {
    await renderLoaded([card({ benefits: [benefit()], activeBenefitCount: 1 })]);
    expect(screen.queryByText('일시불만')).toBe(null);
    expect(screen.queryByText('0원 이상')).toBe(null);
  });

  it('혜택이 없으면 넣는 곳을 알려준다', async () => {
    await renderLoaded([card()]);
    expect(screen.getByText(/등록된 혜택이 없어요/)).toBeTruthy();
  });

  it('혜택 건수와 이번 달 적용 건수를 함께 센다', async () => {
    await renderLoaded([card({
      benefits: [benefit({ id: 1, activeNow: true }), benefit({ id: 2, activeNow: false })],
      activeBenefitCount: 1,
    })]);
    expect(screen.getByText('혜택 2건 · 이번 달 적용 1건')).toBeTruthy();
  });
});

describe('CardDetail 실적 구간', () => {
  const TIERS = [
    { id: 5, min_spend: 0, rate: 1, label: '40만원 미만' },
    { id: 6, min_spend: 400000, rate: null, label: '40만원 이상' },
  ];

  it('구간이 여럿이면 전체를 펼치고 지금 구간을 표시한다', async () => {
    await renderLoaded([card({ threshold: { tiers: TIERS, tier: TIERS[0] } })]);
    expect(screen.getByText('실적 구간')).toBeTruthy();
    expect(screen.getByText('40만원 미만 ← 지금')).toBeTruthy();
    // 지금이 아닌 구간에는 안 붙는다
    expect(screen.getByText('40만원 이상')).toBeTruthy();
  });

  it('요율이 비어 있는 구간은 혜택별이라고 적는다', async () => {
    await renderLoaded([card({ threshold: { tiers: TIERS, tier: TIERS[0] } })]);
    expect(screen.getByText('1%')).toBeTruthy();
    expect(screen.getByText('요율 혜택별')).toBeTruthy();
  });

  it('구간이 하나뿐이면 목록을 만들지 않는다', async () => {
    await renderLoaded([card({ threshold: { tiers: [TIERS[0]], tier: TIERS[0] } })]);
    expect(screen.queryByText('실적 구간')).toBe(null);
  });
});

describe('CardDetail 더 안 쓰는 카드', () => {
  it('비활성 카드에는 더 안 씀 배지가 붙는다', async () => {
    await renderLoaded([card({ isActive: false })]);
    expect(screen.getByText('더 안 씀')).toBeTruthy();
  });
});

describe('CardDetail 못 불러왔을 때', () => {
  it('실패하면 오류를 보여주고 다시 시도할 수 있다', async () => {
    get.mockRejectedValue(new Error('끊김'));
    render(<CardDetail />);
    await waitFor(() => expect(screen.queryByText('로딩 중...')).toBeNull());

    // 오류 화면이 떴으므로 본문은 안 보인다
    expect(screen.queryByText('카드 상세')).toBe(null);

    // 다시 시도하면 한 번 더 부른다
    const before = get.mock.calls.length;
    const retry = screen.getByRole('button');
    get.mockResolvedValue({ data: [], asOf: '2026-08-12' });
    await userEvent.click(retry);
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(before));
  });

  it('응답에 목록 칸이 없어도 빈 화면으로 버틴다', async () => {
    get.mockResolvedValue({ asOf: '2026-08-12' });
    render(<CardDetail />);
    await waitFor(() => expect(screen.queryByText('로딩 중...')).toBeNull());
    expect(screen.getByText('등록된 카드가 없어요')).toBeTruthy();
  });
});

describe('CardDetail 구간 문구', () => {
  const TIERS_NO_LABEL = [
    { id: 5, min_spend: 0, rate: 1, label: null },
    { id: 6, min_spend: 400000, rate: 2, label: null },
  ];

  it('구간에 이름이 없으면 기준 금액으로 부른다', async () => {
    await renderLoaded([card({ threshold: { tiers: TIERS_NO_LABEL, tier: TIERS_NO_LABEL[0] } })]);
    expect(screen.getByText('0원 이상 ← 지금')).toBeTruthy();
    expect(screen.getByText('400,000원 이상')).toBeTruthy();
  });

  it('다음 구간이 남아 있으면 얼마 남았는지 적는다', async () => {
    await renderLoaded([card({
      threshold: {
        tiers: TIERS_NO_LABEL,
        tier: TIERS_NO_LABEL[0],
        met: true,
        toNextTier: 80000,
      },
    })]);
    expect(screen.getByText('다음 구간까지 80,000원 남았어요.')).toBeTruthy();
  });

  it('실적이 모자라면 혜택이 안 붙는다고 말한다', async () => {
    await renderLoaded([card({
      threshold: {
        tiers: TIERS_NO_LABEL,
        tier: null,
        met: false,
        nextTier: TIERS_NO_LABEL[1],
        toNextTier: 250000,
      },
    })]);
    expect(screen.getByText('이번 달은 혜택이 붙지 않아요')).toBeTruthy();
    expect(screen.getByText(/250,000원 남았어요/)).toBeTruthy();
  });
});
