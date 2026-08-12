import React from 'react';
import { render, screen, waitFor , fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DebtInterestProjection from './DebtInterestProjection';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../lib/api', () => ({
  api: { get },
  ApiError: class ApiError extends Error {},
}));

const DAILY = { id: 7, interest_settings: { interest_basis: 'daily' } };
const NOT_DAILY = { id: 8, interest_settings: { interest_basis: 'monthly' } };

const RESULT = {
  total_interest: 12345,
  capitalized: 0,
  accrued_since_last_posting: 0,
  postings: [
    {
      date: '2026-07-31', interest: 12345,
      balance_before: 1000000, balance_after: 1012345,
      over_limit: false,
      segments: [{ from: '2026-07-01', days: 31, balance: 1000000, annual_rate: 5.5, interest: 12345 }],
    },
  ],
};

function payload(over = {}) {
  return { data: { ...RESULT, ...over } };
}

beforeEach(() => {
  get.mockReset();
});

describe('A. 지원 여부', () => {
  it('A-1. NOT_DAILY 인 경우 "기간별 이자 계산을 지원하지 않아요" 안내가 뜬다', async () => {
    render(<DebtInterestProjection debt={NOT_DAILY} />);
    expect(await screen.findByText(/이 부채는 기간별 이자 계산을 지원하지 않아요/)).toBeTruthy();
  });

  it('A-2. NOT_DAILY 인 경우 «계산» 버튼이 없다', async () => {
    render(<DebtInterestProjection debt={NOT_DAILY} />);
    expect(await screen.findByText(/이 부채는 기간별 이자 계산을 지원하지 않아요/)).toBeTruthy();
    expect(screen.queryByText('계산')).toBeNull();
  });

  it('A-3. DAILY 인 경우 «계산» 버튼이 있다', async () => {
    render(<DebtInterestProjection debt={DAILY} />);
    expect(await screen.findByText('기간 이자 계산')).toBeTruthy();
    expect(screen.getByText('계산')).toBeTruthy();
  });

  it('A-4. debt 가 undefined 인 경우 지원 안내가 뜬다(터지지 않는다)', async () => {
    render(<DebtInterestProjection debt={undefined} />);
    expect(await screen.findByText(/이 부채는 기간별 이자 계산을 지원하지 않아요/)).toBeTruthy();
  });
});

describe('B. 계산 요청', () => {
  it('B-1. DAILY 로 그린 직후 아직 api.get 을 부르지 않는다', async () => {
    render(<DebtInterestProjection debt={DAILY} />);
    expect(await screen.findByText('기간 이자 계산')).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it('B-2. «계산» 을 누른다 — api.get 이 한 번 불리고 주소에 요청이 들어간다', async () => {
    get.mockResolvedValue(payload());
    render(<DebtInterestProjection debt={DAILY} />);
    await screen.findByText('기간 이자 계산');
    await userEvent.click(screen.getByText('계산'));
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0]).toMatch(/\/api\/debts\/7\/interest-projection/);
    // The default dates are from the 1st of current month to today
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const defaultFrom = `${year}-${month}-01`;
    const defaultTo = `${year}-${month}-${day}`;
    expect(get.mock.calls[0][0]).toMatch(new RegExp(`from=${defaultFrom}`));
    expect(get.mock.calls[0][0]).toMatch(new RegExp(`to=${defaultTo}`));
  });

  it('B-3. «계산» 을 누른다 — 결과의 이 기간 이자 금액이 화면에 나타난다', async () => {
    get.mockResolvedValue(payload());
    render(<DebtInterestProjection debt={DAILY} />);
    await screen.findByText('기간 이자 계산');
    await userEvent.click(screen.getByText('계산'));
    // Wait for the result to appear
    await waitFor(() => {
      expect(screen.getByText(/이 기간 이자/)).toBeTruthy();
    });
  });
});

describe('C. 결과 문구', () => {
  it('C-1. capitalized 가 0 인 경우 "잔액에 더해진 이자" 문구가 없다', async () => {
    get.mockResolvedValue(payload());
    render(<DebtInterestProjection debt={DAILY} />);
    await userEvent.click(screen.getByText('계산'));
    // Wait for the result to appear
    await waitFor(() => {
      expect(screen.queryByText(/잔액에 더해진 이자/)).toBeNull();
    });
  });

  it('C-2. capitalized 가 500 인 경우 "잔액에 더해진 이자" 문구가 있다', async () => {
    get.mockResolvedValue(payload({ capitalized: 500 }));
    render(<DebtInterestProjection debt={DAILY} />);
    await userEvent.click(screen.getByText('계산'));
    // Wait for the result to appear
    await waitFor(() => {
      expect(screen.getByText(/잔액에 더해진 이자 500원/)).toBeTruthy();
    });
  });

  it('C-3. accrued_since_last_posting 이 0 인 경우 "아직 청구되지 않은 이자" 문구가 없다', async () => {
    get.mockResolvedValue(payload());
    render(<DebtInterestProjection debt={DAILY} />);
    await userEvent.click(screen.getByText('계산'));
    // Wait for the result to appear
    await waitFor(() => {
      expect(screen.queryByText(/아직 청구되지 않은 이자/)).toBeNull();
    });
  });

  it('C-4. accrued_since_last_posting 이 900 인 경우 "아직 청구되지 않은 이자" 문구가 있다', async () => {
    get.mockResolvedValue(payload({ accrued_since_last_posting: 900 }));
    render(<DebtInterestProjection debt={DAILY} />);
    await userEvent.click(screen.getByText('계산'));
    // Wait for the result to appear
    await waitFor(() => {
      expect(screen.getByText(/아직 청구되지 않은 이자 900원/)).toBeTruthy();
    });
  });

  it('C-5. postings 이 빈 배열인 경우 목록이 없지만 이 기간 이자 금액은 그대로 나온다', async () => {
    get.mockResolvedValue(payload({ postings: [] }));
    render(<DebtInterestProjection debt={DAILY} />);
    await userEvent.click(screen.getByText('계산'));
    // Wait for the result to appear
    await waitFor(() => {
      expect(screen.getByText(/이 기간 이자/)).toBeTruthy();
      expect(screen.queryByText('2026-07-31')).toBeNull();
    });
  });
});

describe('D. 구간 세부', () => {
  it('D-1. segments 가 1개인 경우 구간 세부줄이 펼쳐지지 않는다', async () => {
    get.mockResolvedValue(payload());
    render(<DebtInterestProjection debt={DAILY} />);
    await userEvent.click(screen.getByText('계산'));
    expect(screen.queryByText(/연 5.5%/)).toBeNull();
  });

  it('D-2. segments 가 2개인 경우 구간 세부가 펼쳐지고 두 구간의 연 이율이 둘 다 보인다', async () => {
    get.mockResolvedValue(payload({
      postings: [
        {
          date: '2026-07-31',
          interest: 12345,
          balance_before: 1000000,
          balance_after: 1012345,
          over_limit: false,
          segments: [
            { from: '2026-07-01', days: 15, balance: 1000000, annual_rate: 5.5, interest: 10000 },
            { from: '2026-07-15', days: 16, balance: 900000, annual_rate: 6.5, interest: 2500 },
          ],
        },
      ],
    }));
    render(<DebtInterestProjection debt={DAILY} />);
    await userEvent.click(screen.getByText('계산'));
    expect(await screen.findByText(/연 5.5%/)).toBeTruthy();
    expect(screen.getByText(/연 6.5%/)).toBeTruthy();
  });

  it('D-3. over_limit 이 false 인 경우 "한도를 넘습니다" 가 없다', async () => {
    get.mockResolvedValue(payload());
    render(<DebtInterestProjection debt={DAILY} />);
    await userEvent.click(screen.getByText('계산'));
    expect(screen.queryByText(/한도를 넘습니다/)).toBeNull();
  });

  it('D-4. over_limit 이 true 인 경우 "한도를 넘습니다" 가 있다', async () => {
    get.mockResolvedValue(payload({
      postings: [
        {
          date: '2026-07-31',
          interest: 12345,
          balance_before: 1000000,
          balance_after: 1012345,
          over_limit: true,
          segments: [{ from: '2026-07-01', days: 31, balance: 1000000, annual_rate: 5.5, interest: 12345 }],
        },
      ],
    }));
    render(<DebtInterestProjection debt={DAILY} />);
    await userEvent.click(screen.getByText('계산'));
    expect(await screen.findByText(/한도를 넘습니다/)).toBeTruthy();
  });
});

describe('E. 실패', () => {
  it('E-1. api.get 이 new Error("금리 이력이 없어요") 로 거절 — role="alert" 에 그 문구가 나온다', async () => {
    get.mockRejectedValue(new Error('금리 이력이 없어요'));
    render(<DebtInterestProjection debt={DAILY} />);
    await userEvent.click(screen.getByText('계산'));
    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('E-2. 위와 같은 실패 뒤 결과 영역이 안 나온다 — 실패를 0원으로 보여주지 않는다', async () => {
    get.mockRejectedValue(new Error('금리 이력이 없어요'));
    render(<DebtInterestProjection debt={DAILY} />);
    await userEvent.click(screen.getByText('계산'));
    expect(screen.queryByText(/이 기간 이자/)).toBeNull();
  });

  it('E-3. 성공해서 결과가 뜬 뒤 다시 눌러 실패하면 이전 결과가 사라진다', async () => {
    get.mockResolvedValue(payload());
    render(<DebtInterestProjection debt={DAILY} />);
    await userEvent.click(screen.getByText('계산'));
    expect(await screen.findByText(/이 기간 이자/)).toBeTruthy();
    get.mockRejectedValue(new Error('금리 이력이 없어요'));
    await userEvent.click(screen.getByText('계산'));
    expect(screen.queryByText(/이 기간 이자/)).toBeNull();
  });
});

describe('F. 계산 중 상태', () => {
  it('F-1. 계산 중(get 이 아직 안 끝남) 버튼 문구가 "계산 중..." 이 되고 버튼이 disabled 다', async () => {
    let resolve;
    get.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<DebtInterestProjection debt={DAILY} />);
    await userEvent.click(screen.getByText('계산'));
    expect(screen.getByText('계산 중...')).toBeTruthy();
    expect(screen.getByText('계산 중...').disabled).toBe(true);
    resolve({ data: RESULT });
    await waitFor(() => {
      expect(screen.getByText('계산').disabled).toBe(false);
    });
  });

  it('F-2. 계산이 끝난 뒤 버튼 문구가 "계산" 으로 돌아오고 disabled 가 풀린다', async () => {
    get.mockResolvedValue(payload());
    render(<DebtInterestProjection debt={DAILY} />);
    await userEvent.click(screen.getByText('계산'));
    expect(screen.getByText('계산').disabled).toBe(false);
  });
});

describe('G. 날짜 입력', () => {
  it('G-1. 시작일 입력칸을 "2026-06-01" 로 바꾸고 계산 — 요청 주소의 from 이 2026-06-01 이다', async () => {
    get.mockResolvedValue(payload());
    render(<DebtInterestProjection debt={DAILY} />);
    await screen.findByText('기간 이자 계산');
    const fromInput = screen.getByLabelText('시작');
    // date 입력은 userEvent.type 으로 안 들어간다 — 값을 통째로 바꾼다.
    fireEvent.change(fromInput, { target: { value: '2026-06-01' } });
    await userEvent.click(screen.getByText('계산'));
    expect(get.mock.calls[0][0]).toMatch(/from=2026-06-01/);
  });

  it('G-2. 종료일 입력칸을 "2026-06-30" 로 바꾸고 계산 — 요청 주소의 to 가 2026-06-30 이다', async () => {
    get.mockResolvedValue(payload());
    render(<DebtInterestProjection debt={DAILY} />);
    await screen.findByText('기간 이자 계산');
    const toInput = screen.getByLabelText('종료');
    // date 입력은 userEvent.type 으로 안 들어간다 — 값을 통째로 바꾼다.
    fireEvent.change(toInput, { target: { value: '2026-06-30' } });
    await userEvent.click(screen.getByText('계산'));
    expect(get.mock.calls[0][0]).toMatch(/to=2026-06-30/);
  });
});
