import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Comparison from './Comparison';

// 기간 비교 화면. 테스트가 하나도 없었다.
//
// 이 화면은 **두 기간을 나란히 놓고 좋아졌는지 나빠졌는지 말한다.** 그래서
// 위험한 자리는 계산이 아니라 **판정**이다 — 지출은 줄어야 좋고 수입은 늘어야
// 좋은데, 같은 규칙으로 칠하면 지출이 늘어난 달에 초록불이 켜진다.

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

vi.mock('../lib/date', () => ({
  localYMD: () => '2026-08-06',
  localYearMonth: () => '2026-08',
}));

function result({ summary = {}, data = [{ label: '1일', currentExpense: 1000, previousExpense: 800, currentIncome: 0, previousIncome: 0 }] } = {}) {
  return {
    currentLabel: '2026-08',
    previousLabel: '2026-07',
    summary: {
      currentIncome: 3000000, incomeDiff: 200000, incomeDiffPercent: 7.1,
      currentExpense: 1800000, expenseDiff: -150000, expenseDiffPercent: -7.7,
      currentNet: 1200000, netDiff: 350000, netDiffPercent: 41.2,
      ...summary,
    },
    data,
  };
}

const settled = () => waitFor(() => expect(screen.queryByText('로딩 중...')).toBeNull());

// 카드는 라벨 → 그 카드 전체로 찾는다. 금액만 보면 다른 카드와 겹친다.
function card(label) {
  return within(screen.getByText(label).closest('div'));
}

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue(result());
});

describe('기간과 기준일', () => {
  it('기본은 월별이고 오늘을 기준으로 부른다', async () => {
    render(<Comparison />);
    await settled();

    expect(get).toHaveBeenCalledWith('/api/transactions/period-comparison?period=monthly&date=2026-08-06');
  });

  it('탭을 바꾸면 그 주기로 다시 부른다', async () => {
    render(<Comparison />);
    await settled();

    await userEvent.click(screen.getByRole('button', { name: '주별' }));

    // 주기가 주소에 안 실리면 탭만 바뀌고 숫자는 그대로다.
    await waitFor(() => expect(get).toHaveBeenCalledWith(
      expect.stringContaining('period=weekly')));
  });

  it('네 주기를 모두 고를 수 있다', async () => {
    render(<Comparison />);
    await settled();

    for (const [label, key] of [['일별', 'daily'], ['주별', 'weekly'], ['연도별', 'yearly']]) {
      await userEvent.click(screen.getByRole('button', { name: label }));
      await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringContaining(`period=${key}`)));
    }
  });

  it('기준일을 바꾸면 그 날짜로 다시 부른다', async () => {
    render(<Comparison />);
    await settled();

    await userEvent.clear(screen.getByLabelText('기준일'));
    await userEvent.type(screen.getByLabelText('기준일'), '2026-03-15');

    await waitFor(() => expect(get).toHaveBeenCalledWith(
      expect.stringContaining('date=2026-03-15')));
  });

  it('어느 기간끼리 비교하는지 밝힌다', async () => {
    render(<Comparison />);
    await settled();

    // 라벨이 없으면 "직전 기간" 이 언제인지 화면에서 알 수 없다.
    expect(screen.getByText('2026-08')).toBeTruthy();
    expect(screen.getByText('2026-07')).toBeTruthy();
  });
});

// 지출은 줄어야 좋고 수입은 늘어야 좋다. 이 판정이 뒤집히면 화면이 정반대를
// 말하고, 숫자는 맞아서 눈으로는 안 잡힌다.
describe('좋아졌는지 나빠졌는지', () => {
  const colorOf = (label) => card(label).getByText(/전 기간 대비/).className;

  it('수입이 늘면 좋은 쪽으로 칠한다', async () => {
    render(<Comparison />);
    await settled();

    expect(colorOf('수입')).toContain('text-brand-text');
  });

  it('수입이 줄면 나쁜 쪽으로 칠한다', async () => {
    get.mockResolvedValue(result({ summary: { incomeDiff: -100000, incomeDiffPercent: -3.2 } }));
    render(<Comparison />);
    await settled();

    expect(colorOf('수입')).toContain('text-loss-text');
  });

  it('지출이 줄면 좋은 쪽으로 칠한다', async () => {
    render(<Comparison />);
    await settled();

    // 지출만 반대다. 수입과 같은 규칙으로 칠하면 아낀 달에 빨간불이 켜진다.
    expect(colorOf('지출')).toContain('text-brand-text');
  });

  it('지출이 늘면 나쁜 쪽으로 칠한다', async () => {
    get.mockResolvedValue(result({ summary: { expenseDiff: 250000, expenseDiffPercent: 12.5 } }));
    render(<Comparison />);
    await settled();

    expect(colorOf('지출')).toContain('text-loss-text');
  });

  it('변화가 없으면 어느 쪽도 아니다', async () => {
    get.mockResolvedValue(result({ summary: { incomeDiff: 0, incomeDiffPercent: 0 } }));
    render(<Comparison />);
    await settled();

    // 0 을 '나빠짐' 으로 칠하면 아무 일도 없던 달이 빨갛게 뜬다.
    expect(colorOf('수입')).toContain('text-caption');
  });
});

describe('증감 표기', () => {
  it('늘어난 값에는 부호를 붙인다', async () => {
    render(<Comparison />);
    await settled();

    expect(card('수입').getByText(/전 기간 대비 \+200,000원 \(\+7\.1%\)/)).toBeTruthy();
  });

  it('줄어든 값은 부호를 겹쳐 붙이지 않는다', async () => {
    render(<Comparison />);
    await settled();

    // formatWon 이 이미 음수 부호를 붙인다. '+' 를 또 붙이면 '+-150,000원' 이 된다.
    expect(card('지출').getByText(/전 기간 대비 -150,000원 \(-7\.7%\)/)).toBeTruthy();
  });

  it('퍼센트를 모르면 괄호를 아예 안 적는다', async () => {
    get.mockResolvedValue(result({ summary: { netDiffPercent: null } }));
    render(<Comparison />);
    await settled();

    // 직전 기간이 0 이면 퍼센트가 정의되지 않는다. '(null%)' 이 뜨면 안 된다.
    const text = card('순증감').getByText(/전 기간 대비/).textContent;
    expect(text).not.toContain('(');
  });
});

describe('데이터가 없을 때', () => {
  it('지출이 양쪽 다 없으면 차트 대신 안내를 둔다', async () => {
    get.mockResolvedValue(result({
      data: [{ label: '1일', currentExpense: 0, previousExpense: 0, currentIncome: 5000, previousIncome: 3000 }],
    }));
    render(<Comparison />);
    await settled();

    // 빈 차트는 "0 이 쭉 이어진 선" 으로 읽혀 데이터가 있는 것처럼 보인다.
    expect(screen.getByText('해당 기간 지출 내역이 없습니다.')).toBeTruthy();
    expect(screen.queryByText('해당 기간 수입 내역이 없습니다.')).toBeNull();
  });

  it('수입이 양쪽 다 없으면 그쪽만 안내를 둔다', async () => {
    get.mockResolvedValue(result({
      data: [{ label: '1일', currentExpense: 1000, previousExpense: 0, currentIncome: 0, previousIncome: 0 }],
    }));
    render(<Comparison />);
    await settled();

    expect(screen.getByText('해당 기간 수입 내역이 없습니다.')).toBeTruthy();
    expect(screen.queryByText('해당 기간 지출 내역이 없습니다.')).toBeNull();
  });

  it('한쪽 기간에만 있어도 차트를 그린다', async () => {
    get.mockResolvedValue(result({
      data: [{ label: '1일', currentExpense: 0, previousExpense: 900, currentIncome: 0, previousIncome: 0 }],
    }));
    render(<Comparison />);
    await settled();

    // 이번 기간이 0 이어도 직전과의 대비가 이 화면의 요점이다.
    expect(screen.queryByText('해당 기간 지출 내역이 없습니다.')).toBeNull();
  });
});

describe('불러오기 실패', () => {
  it('사유와 재시도를 준다', async () => {
    get.mockRejectedValue(new Error('집계에 실패했습니다'));
    render(<Comparison />);
    await settled();

    expect(screen.getByText('집계에 실패했습니다')).toBeTruthy();

    get.mockResolvedValue(result());
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    await waitFor(() => expect(screen.getByText('2026-08')).toBeTruthy());
  });
});
