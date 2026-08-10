import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import InstallmentMonthsPicker from './InstallmentMonthsPicker';

// #317 — 개월수를 정책이 허용하는 값으로 제한하되, 직접 입력 탈출구는 항상 연다.
//
// B안(2026-08-03 확정)의 핵심은 **기록을 막지 않는 것**이다. 정책을 아직 등록하지
// 않았거나 카드사가 새 이벤트를 시작한 상태가 정상적으로 존재한다. 그때 할부를
// 못 넣게 되면 가계부의 1차 목적이 정책 관리에 종속된다.

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../lib/api', () => ({
  api: { get },
  ApiError: class ApiError extends Error {},
}));

const OPTIONS = [
  { months: 2, policy_type: '무이자', annual_rate: 0, free_from_sequence: 0, source: 'base' },
  { months: 3, policy_type: '무이자', annual_rate: 0, free_from_sequence: 0, source: 'base' },
  { months: 6, policy_type: '유이자', annual_rate: 19.9, free_from_sequence: 0, source: 'base' },
  { months: 12, policy_type: '부분무이자', annual_rate: 19.9, free_from_sequence: 4, source: 'base' },
];

const PROPS = {
  value: '', onChange: vi.fn(), paymentMethodId: '1',
  categoryId: '', purchaseDate: '2026-07-10', inputClassName: 'x',
};

beforeEach(() => { get.mockReset(); PROPS.onChange = vi.fn(); });

describe('카드를 고르기 전', () => {
  it('조회하지 않고 안내만 한다', async () => {
    render(<InstallmentMonthsPicker {...PROPS} paymentMethodId="" />);
    expect(screen.getByText(/카드를 고르면/)).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it('그래도 개월수는 넣을 수 있다', () => {
    // 카드를 안 골라도 기록은 막지 않는다.
    render(<InstallmentMonthsPicker {...PROPS} paymentMethodId="" />);
    expect(screen.getByLabelText('개월수')).toBeTruthy();
  });
});

describe('정책이 있을 때', () => {
  it('허용 개월수만 보여준다', async () => {
    get.mockResolvedValue({ data: OPTIONS });
    render(<InstallmentMonthsPicker {...PROPS} />);
    await waitFor(() => expect(screen.getByLabelText('개월수')).toBeTruthy());
    const opts = [...screen.getByLabelText('개월수').querySelectorAll('option')].map(o => o.value);
    expect(opts).toContain('2');
    expect(opts).toContain('6');
    expect(opts).not.toContain('7');
  });

  it('정책 유형을 함께 적는다', async () => {
    // "6개월" 만 있으면 무이자인지 알 수 없다.
    get.mockResolvedValue({ data: OPTIONS });
    render(<InstallmentMonthsPicker {...PROPS} />);
    expect(await screen.findByText('2개월 · 무이자')).toBeTruthy();
    expect(screen.getByText('6개월 · 유이자 연 19.9%')).toBeTruthy();
    expect(screen.getByText('12개월 · 부분무이자 (4회차부터 면제)')).toBeTruthy();
  });

  it('카드가 바뀌면 다시 조회한다', async () => {
    get.mockResolvedValue({ data: OPTIONS });
    const { rerender } = render(<InstallmentMonthsPicker {...PROPS} />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    rerender(<InstallmentMonthsPicker {...PROPS} paymentMethodId="2" />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it('카테고리가 바뀌면 다시 조회한다', async () => {
    // 카테고리 예외가 같은 개월수의 정책을 덮는다.
    get.mockResolvedValue({ data: OPTIONS });
    const { rerender } = render(<InstallmentMonthsPicker {...PROPS} />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    rerender(<InstallmentMonthsPicker {...PROPS} categoryId="7" />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(get.mock.calls[1][0]).toMatch(/category_id=7/);
  });

  it('고르면 값을 올려보낸다', async () => {
    const user = userEvent.setup();
    get.mockResolvedValue({ data: OPTIONS });
    const onChange = vi.fn();
    render(<InstallmentMonthsPicker {...PROPS} onChange={onChange} />);
    await waitFor(() => expect(screen.getByLabelText('개월수')).toBeTruthy());
    await user.selectOptions(screen.getByLabelText('개월수'), '6');
    expect(onChange).toHaveBeenCalledWith('6');
  });
});

describe('직접 입력 탈출구 (B안)', () => {
  it('정책이 있어도 직접 입력 선택지가 있다', async () => {
    get.mockResolvedValue({ data: OPTIONS });
    render(<InstallmentMonthsPicker {...PROPS} />);
    expect(await screen.findByText('직접 입력')).toBeTruthy();
  });

  it('직접 입력을 고르면 숫자 칸이 열린다', async () => {
    const user = userEvent.setup();
    get.mockResolvedValue({ data: OPTIONS });
    render(<InstallmentMonthsPicker {...PROPS} />);
    await waitFor(() => expect(screen.getByLabelText('개월수')).toBeTruthy());
    await user.selectOptions(screen.getByLabelText('개월수'), '__custom__');
    expect(await screen.findByLabelText('개월수 직접 입력')).toBeTruthy();
  });

  it('정책에 없는 값이라는 사실과 수수료를 모른다는 것을 밝힌다', async () => {
    // 맞는 정책이 없으면 이율을 알 방법이 없어 수수료가 0 으로 계산된다.
    // "수수료가 붙는다" 고 적으면 화면과 실제가 어긋난다.
    get.mockResolvedValue({ data: OPTIONS });
    render(<InstallmentMonthsPicker {...PROPS} value="7" />);
    expect(await screen.findByText(/정책에 없는 개월수예요/)).toBeTruthy();
  });

  it('정책에 있는 값이면 경고하지 않는다', async () => {
    get.mockResolvedValue({ data: OPTIONS });
    render(<InstallmentMonthsPicker {...PROPS} value="6" />);
    await screen.findByText('6개월 · 유이자 연 19.9%');
    expect(screen.queryByText(/정책에 없는 개월수예요/)).toBeNull();
  });
});

describe('정책이 없을 때 — 기록을 막지 않는다', () => {
  it('자유 입력으로 떨어지고 사유를 적는다', async () => {
    get.mockResolvedValue({ data: [] });
    render(<InstallmentMonthsPicker {...PROPS} />);
    expect(await screen.findByText(/등록된 할부 정책이 없어요/)).toBeTruthy();
    expect(screen.getByLabelText('개월수')).toBeTruthy();
  });

  it('드롭다운을 띄우지 않는다 — 빈 목록을 보여주지 않는다', async () => {
    get.mockResolvedValue({ data: [] });
    render(<InstallmentMonthsPicker {...PROPS} />);
    await screen.findByText(/등록된 할부 정책이 없어요/);
    expect(screen.getByLabelText('개월수').tagName).toBe('INPUT');
  });

  it('조회가 실패해도 입력할 수 있다', async () => {
    get.mockRejectedValue(new Error('서버에 연결할 수 없습니다.'));
    render(<InstallmentMonthsPicker {...PROPS} />);
    expect(await screen.findByText(/불러오지 못했어요/)).toBeTruthy();
    expect(screen.getByLabelText('개월수')).toBeTruthy();
  });
});

describe('저장된 값 보존', () => {
  it('정책이 바뀌어 목록에 없는 값도 그대로 보인다', async () => {
    // 과거 기록이 정책 변경으로 사라지면 안 된다.
    get.mockResolvedValue({ data: OPTIONS });
    render(<InstallmentMonthsPicker {...PROPS} value="24" />);
    const input = await screen.findByLabelText('개월수 직접 입력');
    expect(input.value).toBe('24');
  });
});
