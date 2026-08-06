import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Debts from './Debts';
import { ConfirmProvider } from '../components/ConfirmProvider';

// 부채 화면의 **이력** 축 — 이자 추가, 상환 기록 삭제, 이력 펼치기.
//
// 부채 목록·한도 표시는 Debts.test.jsx, 폼이 보내는 값은 DebtsForm.test.jsx 가
// 본다. 여기는 그 둘이 안 다루는 축만 잡는다. 같은 화면이라도 축이 다르면
// 파일을 나눈다(#480 이후 같은 방식).
//
// 이 축의 핵심은 **잔액을 직접 고치지 않는다**(#287)는 것이다. 이자도 상환도
// 이력을 남기고 그 합으로 잔액이 정해진다. 이력이 안 남으면 언제 얼마를
// 갚았는지 몰라 과거 이자를 재계산할 수 없다.

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

// 이자 폼의 날짜 기본값이 오늘에서 온다.
vi.mock('../lib/date', () => ({
  localYMD: () => '2026-08-06',
  localYearMonth: () => '2026-08',
}));

const CREDIT_LINE = {
  id: 2, name: '급여통장 마통', type: '마이너스통장', loan_type: 'credit_line',
  balance: 3000000, annual_rate: 6.5, monthly_interest: 16000, memo: null,
};

const INTEREST_ROWS = [
  { id: 11, log_date: '2026-07-25', rate_at_time: 6.5, interest_amount: 16000,
    balance_before: 2984000, balance_after: 3000000, memo: '7월 이자' },
  { id: 12, log_date: '2026-06-25', rate_at_time: 6.2, interest_amount: 15200,
    balance_before: 2968800, balance_after: 2984000, memo: null },
];

const REPAY_ROWS = [
  { id: 21, repaid_on: '2026-07-30', amount: 500000, principal_portion: 484000,
    interest_portion: 16000, memo: '보너스' },
  { id: 22, repaid_on: '2026-06-30', amount: 300000, principal_portion: 300000,
    interest_portion: 0, memo: null },
];

function mockApi({ interest = INTEREST_ROWS, repayments = REPAY_ROWS } = {}) {
  get.mockImplementation((url) => {
    // 조회는 /interest-log, 추가는 POST /interest 다. 경로가 달라서 하나로
    // 묶으면 조회가 목에 안 걸리고 이력이 빈 채로 뜬다.
    if (url.endsWith('/interest-log')) return Promise.resolve({ data: interest });
    if (url.endsWith('/repayments')) return Promise.resolve({ data: repayments });
    return Promise.resolve({
      data: [CREDIT_LINE], total_balance: 3000000, total_monthly_interest: 16000,
    });
  });
  post.mockResolvedValue({ ok: true });
  del.mockResolvedValue({ ok: true });
}

const renderPage = () => render(<ConfirmProvider><Debts /></ConfirmProvider>);
const settled = () => waitFor(() => expect(screen.getByText('급여통장 마통')).toBeTruthy());
const dialog = () => screen.getByRole('dialog');
const expandLog = async () => userEvent.click(screen.getByRole('button', { name: /^이력/ }));

beforeEach(() => {
  vi.clearAllMocks();
  mockApi();
});

describe('이력 펼치기', () => {
  it('펼칠 때 이자와 상환 이력을 함께 부른다', async () => {
    renderPage();
    await settled();

    await expandLog();

    // 둘이 같은 잔액 타임라인을 이룬다. 하나만 부르면 화면이 반쪽 사실을 보여준다.
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/debts/2/interest-log'));
    expect(get).toHaveBeenCalledWith('/api/debts/2/repayments');
  });

  it('다시 누르면 접는다', async () => {
    renderPage();
    await settled();

    await expandLog();
    await screen.findByText('이자 이력');

    await expandLog();
    expect(screen.queryByText('이자 이력')).toBeNull();
  });

  it('한 번 부른 이력은 다시 부르지 않는다', async () => {
    renderPage();
    await settled();

    await expandLog();
    await screen.findByText('이자 이력');
    const calls = get.mock.calls.filter(([u]) => u.endsWith('/interest-log')).length;

    await expandLog();
    await expandLog();

    // 접었다 펼 때마다 다시 부르면 목록을 여닫는 것만으로 요청이 쌓인다.
    await screen.findByText('이자 이력');
    expect(get.mock.calls.filter(([u]) => u.endsWith('/interest-log')).length).toBe(calls);
  });
});

describe('이자 이력 표시', () => {
  it('날짜·금리·금액과 잔액 변화를 함께 보여준다', async () => {
    renderPage();
    await settled();
    await expandLog();

    expect(await screen.findByText('2026-07-25')).toBeTruthy();
    expect(screen.getByText('금리 6.5%')).toBeTruthy();
    expect(screen.getByText('+16,000원')).toBeTruthy();
    // 이자가 잔액을 얼마나 밀어 올렸는지가 이 이력의 요점이다.
    expect(screen.getByText('2,984,000원 → 3,000,000원')).toBeTruthy();
  });

  it('그 시점 금리를 적는다 — 지금 금리가 아니다', async () => {
    renderPage();
    await settled();
    await expandLog();

    // 변동금리라 과거 행은 그때의 금리로 남아야 한다(#285).
    expect(await screen.findByText('금리 6.2%')).toBeTruthy();
  });

  it('메모가 없으면 —— 로 채운다', async () => {
    renderPage();
    await settled();
    await expandLog();

    // 그 행 안에서 찾아야 한다. 화면 전체에서 '—' 를 세면 부채 표의 빈 메모
    // 칸에 걸려, 이자 이력이 빈 메모를 그냥 비워 둬도 통과한다.
    const row = (await screen.findByText('2026-06-25')).parentElement;
    expect(within(row).getByText('—')).toBeTruthy();
  });

  it('이력이 없으면 없다고 알린다', async () => {
    mockApi({ interest: [] });
    renderPage();
    await settled();
    await expandLog();

    expect(await screen.findByText('이자 이력이 없습니다.')).toBeTruthy();
  });
});

describe('상환 이력 표시', () => {
  it('원금과 이자분을 나눠 적는다', async () => {
    renderPage();
    await settled();
    await expandLog();

    const row = (await screen.findByText('2026-07-30')).closest('li');
    // 갚은 돈이 전부 원금으로 가는 게 아니다. 나눠 적지 않으면 잔액이 왜
    // 그만큼 안 줄었는지 화면에서 알 수 없다.
    expect(within(row).getByText(/원금 484,000원/)).toBeTruthy();
    expect(within(row).getByText(/이자 16,000원/)).toBeTruthy();
    expect(within(row).getByText('500,000원')).toBeTruthy();
  });

  it('이자분이 0 이면 그 칸을 적지 않는다', async () => {
    renderPage();
    await settled();
    await expandLog();

    const row = (await screen.findByText('2026-06-30')).closest('li');
    expect(within(row).getByText(/원금 300,000원/)).toBeTruthy();
    // '이자 0원' 은 정보가 아니라 잡음이다.
    expect(within(row).queryByText(/이자 /)).toBeNull();
  });

  it('기록이 없으면 무엇을 하면 되는지 알린다', async () => {
    mockApi({ repayments: [] });
    renderPage();
    await settled();
    await expandLog();

    // 빈 목록만 두면 이 기능이 무엇에 쓰이는지 알 수 없다.
    expect(await screen.findByText(/그 시점 이후 이자가 줄어든 것으로 계산돼요/)).toBeTruthy();
  });
});

describe('상환 기록 삭제', () => {
  const clickDelete = async () => {
    await expandLog();
    const btn = await screen.findByRole('button', { name: '2026-07-30 상환 기록 삭제' });
    await userEvent.click(btn);
  };

  it('되돌아가는 금액을 밝히고 확인을 받는다', async () => {
    renderPage();
    await settled();
    await clickDelete();

    // 얼마가 잔액으로 되돌아가는지 모르고 지우면 그 뒤 숫자를 못 믿는다.
    expect(within(dialog()).getByText(/원금 484,000원이 잔액으로 되돌아갑니다/)).toBeTruthy();
    expect(del).not.toHaveBeenCalled();
  });

  it('확인하면 지우고 목록과 이력을 다시 읽는다', async () => {
    renderPage();
    await settled();
    await clickDelete();
    await userEvent.click(within(dialog()).getByRole('button', { name: '지우기' }));

    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/debts/2/repayments/21'));
    // 잔액과 이력이 함께 바뀐다. 한쪽만 읽으면 화면이 서로 어긋난 값을 보여준다.
    await waitFor(() => expect(get.mock.calls.filter(([u]) => u.endsWith('/repayments')).length)
      .toBeGreaterThan(1));
  });

  it('취소하면 지우지 않는다', async () => {
    renderPage();
    await settled();
    await clickDelete();
    await userEvent.click(within(dialog()).getByRole('button', { name: '취소' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(del).not.toHaveBeenCalled();
  });

  it('실패하면 사유를 알린다', async () => {
    del.mockRejectedValue(new Error('이미 지워진 기록이에요'));
    renderPage();
    await settled();
    await clickDelete();
    await userEvent.click(within(dialog()).getByRole('button', { name: '지우기' }));

    expect(await screen.findByText('이미 지워진 기록이에요')).toBeTruthy();
  });
});

describe('이자 추가', () => {
  const openForm = async () => {
    await userEvent.click(screen.getByRole('button', { name: '이자 추가' }));
    return screen.findByLabelText('이자 금액 (원) *');
  };

  it('어느 부채에 붙는지 제목에 적는다', async () => {
    renderPage();
    await settled();
    await openForm();

    // 부채가 여럿이면 어디에 넣는지 모른 채 저장하게 된다. 이름은 표에도
    // 있으므로 폼 제목 안에서 찾아야 의미가 있다.
    const title = screen.getByRole('heading', { name: /이자 추가/ });
    expect(within(title).getByText('급여통장 마통')).toBeTruthy();
  });

  it('날짜는 오늘, 금리는 그 부채의 현재 금리로 연다', async () => {
    renderPage();
    await settled();
    await openForm();

    expect(screen.getByLabelText('날짜 *').value).toBe('2026-08-06');
    // 금리를 매번 다시 치게 하면 오타가 그대로 이력에 남는다.
    expect(screen.getByLabelText('현재 금리 (%) *').value).toBe('6.5');
  });

  it('잔액에 더해진다는 것을 미리 알린다', async () => {
    renderPage();
    await settled();
    await openForm();

    expect(screen.getByText('이자 금액은 부채 잔액에 자동으로 더해집니다.')).toBeTruthy();
  });

  it('숫자 칸을 숫자로 바꿔 보낸다', async () => {
    renderPage();
    await settled();
    await openForm();

    await userEvent.type(screen.getByLabelText('이자 금액 (원) *'), '17000');
    await userEvent.type(screen.getByLabelText('메모'), '8월 이자');
    await userEvent.click(screen.getByRole('button', { name: '추가' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/debts/2/interest', {
      log_date: '2026-08-06', rate: 6.5, interest_amount: 17000, memo: '8월 이자',
    }));
    const sent = post.mock.calls[0][1];
    expect(typeof sent.rate).toBe('number');
    expect(typeof sent.interest_amount).toBe('number');
  });

  it('금리를 고쳐 넣으면 그 값으로 보낸다', async () => {
    renderPage();
    await settled();
    await openForm();

    await userEvent.clear(screen.getByLabelText('현재 금리 (%) *'));
    await userEvent.type(screen.getByLabelText('현재 금리 (%) *'), '7.25');
    await userEvent.type(screen.getByLabelText('이자 금액 (원) *'), '18000');
    await userEvent.click(screen.getByRole('button', { name: '추가' }));

    // 변동금리라 이번 달 금리가 부채에 적힌 값과 다를 수 있다.
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/debts/2/interest',
      expect.objectContaining({ rate: 7.25 })));
  });

  it('성공하면 폼을 닫고 목록을 다시 읽는다', async () => {
    renderPage();
    await settled();
    const before = get.mock.calls.length;
    await openForm();

    await userEvent.type(screen.getByLabelText('이자 금액 (원) *'), '17000');
    await userEvent.click(screen.getByRole('button', { name: '추가' }));

    await waitFor(() => expect(screen.queryByLabelText('이자 금액 (원) *')).toBeNull());
    expect(screen.getByRole('heading', { name: '부채 현황' })).toBeTruthy();
    expect(get.mock.calls.length).toBeGreaterThan(before);
  });

  it('실패하면 사유를 알리고 폼을 닫지 않는다', async () => {
    post.mockRejectedValue(new Error('금리는 0 이상이어야 해요'));
    renderPage();
    await settled();
    await openForm();

    await userEvent.type(screen.getByLabelText('이자 금액 (원) *'), '17000');
    await userEvent.click(screen.getByRole('button', { name: '추가' }));

    expect(await screen.findByText('금리는 0 이상이어야 해요')).toBeTruthy();
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));
    expect(screen.getByLabelText('이자 금액 (원) *').value).toBe('17000');
  });

  it('취소하면 닫는다', async () => {
    renderPage();
    await settled();
    await openForm();

    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.queryByLabelText('이자 금액 (원) *')).toBeNull();
  });
});
