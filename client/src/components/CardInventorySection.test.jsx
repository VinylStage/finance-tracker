import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CardInventorySection, { gapsOf } from './CardInventorySection';

// #520 — 카드 등록 현황.
//
// 이 화면은 **모자란 것을 세는** 화면이다. 그래서 잠글 것은 "무엇이 그려지나"
// 가 아니라 "비어 있는데 비었다고 말하는가" 다.
//
//   1. 혜택 0건인 카드를 골라내는가 — 추천 계산이 이 카드를 혜택 없는 카드로 본다
//   2. 실적 없음을 경고로 칠하지 않는가 — 무실적 카드가 실제로 많다
//   3. 카드사별 미지정 건수를 카드사로 갈라 말하는가 — 총합만으로는 할 일을 모른다
//   4. 비활성 카드를 숨기지 않는가 — 숨기면 사라진 이유를 알 수 없다(#410)

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

// 실제 api 표면을 그대로 흉내낸다. 없는 이름을 지어내면 화면이 그걸 불러도
// 테스트만 통과한다 — CardProductSection 에서 실제로 겪은 사고다.
vi.mock('../lib/api', () => ({
  api: { get },
  ApiError: class ApiError extends Error {},
}));

vi.mock('./EmptyState', () => ({
  default: ({ title, description }) => <div><p>{title}</p><p>{description}</p></div>,
}));

// 카드 3장이 서로 **다른 이유로** 모자라야 한다. 한 장에 결함을 다 몰면
// 판정을 뒤집어도 배지 수가 맞아 통과한다.
const CARDS = [
  {
    id: 10, payment_method_id: 1, payment_method_name: '하나카드', issuer: '하나',
    product_name: '완비카드', card_type: '신용', annual_fee: 15000,
    prev_month_threshold: 300000, statement_close_day: 25, billing_cycle_day: 15,
    is_active: 1, benefit_count: 3, transaction_count: 12,
  },
  {
    id: 11, payment_method_id: 1, payment_method_name: '하나카드', issuer: '하나',
    product_name: '혜택빈카드', card_type: '체크', annual_fee: 0,
    prev_month_threshold: 200000, statement_close_day: 20, billing_cycle_day: 10,
    is_active: 1, benefit_count: 0, transaction_count: 4,
  },
  {
    id: 12, payment_method_id: 2, payment_method_name: '삼성카드', issuer: '삼성',
    product_name: '주기빈카드', card_type: '신용', annual_fee: 10000,
    prev_month_threshold: null, statement_close_day: null, billing_cycle_day: null,
    is_active: 1, benefit_count: 2, transaction_count: 0,
  },
];

const INACTIVE = {
  id: 13, payment_method_id: 2, payment_method_name: '삼성카드', issuer: '삼성',
  product_name: '안쓰는카드', card_type: '신용', annual_fee: 0,
  prev_month_threshold: null, statement_close_day: null, billing_cycle_day: null,
  is_active: 0, benefit_count: 1, transaction_count: 7,
};

const UNASSIGNED = [
  { payment_method_id: 1, name: '하나카드', count: 273 },
  { payment_method_id: 2, name: '신한카드', count: 32 },
];

function payload(over = {}) {
  return { data: { cards: CARDS, unassigned: UNASSIGNED, ...over } };
}

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue(payload());
});

describe('A. 비어 있는 것을 말한다', () => {
  it('A-1. 혜택 0건인 카드에만 혜택 없음이 붙는다', async () => {
    render(<CardInventorySection />);
    const empty = await screen.findByText('혜택빈카드');
    const emptyRow = empty.closest('li');
    expect(within(emptyRow).getByText('혜택 없음')).toBeTruthy();

    const full = screen.getByText('완비카드').closest('li');
    expect(within(full).queryByText('혜택 없음')).toBeNull();
  });

  it('A-2. 청구주기가 반쪽이어도 미설정으로 잡는다', async () => {
    get.mockResolvedValue(payload({
      cards: [{ ...CARDS[0], statement_close_day: 25, billing_cycle_day: null }],
    }));
    render(<CardInventorySection />);
    const row = (await screen.findByText('완비카드')).closest('li');
    // 마감일만 있고 결제일이 없으면 청구월 계산이 구매일의 달로 폴백한다(#290).
    // "하나라도 있으면 설정됨" 으로 세면 이 폴백이 조용히 숨는다.
    expect(within(row).getByText('청구주기 미설정')).toBeTruthy();
  });

  it('A-3. 혜택 없는 카드 수를 요약이 센다', async () => {
    render(<CardInventorySection />);
    const dt = await screen.findByText('혜택 없는 카드');
    expect(dt.parentElement.textContent).toContain('1장');
  });

  it('A-4. 실적 없음은 경고가 아니다 — 무실적 카드가 정상이다', async () => {
    render(<CardInventorySection />);
    const row = (await screen.findByText('주기빈카드')).closest('li');
    const badge = within(row).getByText('실적 기준 없음');
    expect(badge.className).not.toContain('loss');
  });

  it('A-5. 실적 없음을 0원 실적으로 바꿔 말하지 않는다', async () => {
    render(<CardInventorySection />);
    const row = (await screen.findByText('주기빈카드')).closest('li');
    expect(row.textContent).toContain('전월실적 조건 없음');
  });
});

describe('B. gapsOf — 판정 자체', () => {
  it('B-1. 다 채운 카드는 빈 목록이다', () => {
    expect(gapsOf(CARDS[0])).toEqual([]);
  });

  it('B-2. 실적 0 은 "없음" 이 아니다', () => {
    // 0 원 실적 카드와 무실적 카드는 다른 카드다. falsy 로 세면 둘이 합쳐진다.
    const keys = gapsOf({ ...CARDS[0], prev_month_threshold: 0 }).map((g) => g.key);
    expect(keys).not.toContain('threshold');
  });

  it('B-3. 혜택 없음이 실적 없음보다 먼저 온다', () => {
    const keys = gapsOf({ ...CARDS[0], benefit_count: 0, prev_month_threshold: null })
      .map((g) => g.key);
    expect(keys.indexOf('benefit')).toBeLessThan(keys.indexOf('threshold'));
  });
});

describe('C. 카드사별 미지정 건수', () => {
  it('C-1. 카드사 이름과 건수를 각각 말한다', async () => {
    render(<CardInventorySection />);
    expect(await screen.findByText('하나카드 — 273건')).toBeTruthy();
    expect(screen.getByText('신한카드 — 32건')).toBeTruthy();
  });

  it('C-2. 총합을 요약이 센다', async () => {
    render(<CardInventorySection />);
    const dt = await screen.findByText('카드 미지정 거래');
    expect(dt.parentElement.textContent).toContain('305건');
  });

  it('C-3. 미지정이 없으면 그 묶음이 아예 없다', async () => {
    get.mockResolvedValue(payload({ unassigned: [] }));
    render(<CardInventorySection />);
    await screen.findByText('완비카드');
    expect(screen.queryByText('아직 어느 카드인지 안 정한 거래')).toBeNull();
  });
});

describe('D. 비활성 카드', () => {
  it('D-1. 비활성은 따로 묶어 남긴다', async () => {
    get.mockResolvedValue(payload({ cards: [...CARDS, INACTIVE] }));
    render(<CardInventorySection />);
    expect(await screen.findByText('더 안 쓰기로 한 카드')).toBeTruthy();
    expect(screen.getByText(/안쓰는카드/)).toBeTruthy();
  });

  it('D-2. 비활성은 등록 카드 수에 안 들어간다', async () => {
    get.mockResolvedValue(payload({ cards: [...CARDS, INACTIVE] }));
    render(<CardInventorySection />);
    const dt = await screen.findByText('등록 카드');
    expect(dt.parentElement.textContent).toContain('3장');
  });

  it('D-3. 비활성 카드는 카드사 묶음에 섞이지 않는다', async () => {
    get.mockResolvedValue(payload({ cards: [...CARDS, INACTIVE] }));
    render(<CardInventorySection />);
    await screen.findByText('주기빈카드');
    // 섞이면 "지금 쓸 수 있는 카드가 무엇인가" 를 매번 읽어야 한다.
    expect(screen.queryByText('안쓰는카드')).toBeNull();
  });
});

describe('E. 빈 상태와 오류', () => {
  it('E-1. 카드가 없으면 무엇을 해야 하는지 말한다', async () => {
    get.mockResolvedValue({ data: { cards: [], unassigned: [] } });
    render(<CardInventorySection />);
    expect(await screen.findByText('등록된 카드가 없어요')).toBeTruthy();
  });

  it('E-2. 불러오기 실패를 알린다', async () => {
    get.mockRejectedValue(new Error('불러오지 못했어요'));
    render(<CardInventorySection />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('불러오지 못했어요');
  });

  it('E-3. 실패했을 때 "카드 없음" 으로 오해시키지 않는다', async () => {
    get.mockRejectedValue(new Error('서버 오류'));
    render(<CardInventorySection />);
    await screen.findByRole('alert');
    // 못 불러온 것과 0장인 것은 다르다. 섞으면 사용자가 데이터가 날아간 줄 안다.
    expect(screen.queryByText('등록된 카드가 없어요')).toBeNull();
  });

  it('E-4. 새로고침이 다시 불러온다', async () => {
    render(<CardInventorySection />);
    await screen.findByText('완비카드');
    expect(get).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: '새로고침' }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });
});
