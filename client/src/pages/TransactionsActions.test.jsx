import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Transactions from './Transactions';
import { ConfirmProvider } from '../components/ConfirmProvider';

// 거래 내역 화면의 **쓰기 축** — 선택·일괄삭제·개별삭제·수정·반복규칙으로 넘기기.
//
// 뷰 상태(목록/달력, URL·세션)는 Transactions.test.jsx 가 본다(#476). 여기는
// 그 파일이 안 다루는 축만 잡는다. 같은 화면이라도 축이 다르면 파일을 나눈다.
//
// 이 축의 값어치는 **되돌릴 수 없는 동작 앞에 무엇이 서 있는가** 다. 일괄삭제는
// 이 앱에서 한 번에 가장 많은 것을 지우는 경로이고, 과거에 실거래 2,212건이
// 사라진 적이 있다.

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

// 이 화면은 wouter 의 useLocation 만 쓴다. 라우터를 통째로 세우지 않는다.
const navigate = vi.fn();
vi.mock('wouter', () => ({ useLocation: () => ['/transactions', navigate] }));

const YEAR = String(new Date().getFullYear());
const MONTH = `${YEAR}-03`;

const CATEGORIES = [
  { id: 7, name: '식비', major_type: '선택지출', is_active: 1 },
  { id: 8, name: '교통', major_type: '변동필수', is_active: 1 },
];

const TX_A = {
  id: 101, date: `${MONTH}-05`, merchant: '커피', amount: 4500, category_id: 7,
  category_name: '식비', major_type: '선택지출', payment_method_name: '하나카드',
};
const TX_B = {
  id: 102, date: `${MONTH}-07`, merchant: '지하철', amount: 1400,
  category_name: '교통', major_type: '변동필수', payment_method_name: '체크카드',
};

function mockGet({ items = [TX_A, TX_B] } = {}) {
  get.mockImplementation((url) => {
    if (url.startsWith('/api/transactions/years')) return Promise.resolve({ data: [YEAR] });
    if (url.startsWith('/api/transactions/summary/by-month')) {
      return Promise.resolve({ data: [{ month: MONTH, income: 0, expense: 5900, count: items.length }] });
    }
    // 폼이 여는 자동완성·집계 주소가 /api/transactions 로 시작한다. 목록과
    // 같은 답을 주면 거래 객체가 제안 버튼의 자식으로 들어가 화면이 죽는다.
    if (url.startsWith('/api/transactions/suggest')) return Promise.resolve({ data: [] });
    if (url.startsWith('/api/transactions/summary')) return Promise.resolve({ data: [] });
    if (url.startsWith('/api/transactions')) return Promise.resolve({ data: items, total: items.length });
    // 카테고리는 폼의 required 항목이다. 비워 두면 수정 폼이 제출되지 않아
    // "PUT 이 안 불렸다" 가 되고, 그건 화면 결함이 아니라 픽스처 문제다.
    if (url.startsWith('/api/categories')) return Promise.resolve(CATEGORIES);
    if (url.startsWith('/api/payment-methods')) return Promise.resolve([]);
    if (url.startsWith('/api/card-products')) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
}

const renderPage = () => render(<ConfirmProvider><Transactions /></ConfirmProvider>);
const dialog = () => screen.getByRole('dialog', { name: '' });

// 연도의 첫 달(현재 달이 있으면 그 달)은 화면이 알아서 펼친다. 여기서 헤더를
// 누르면 오히려 접혀서 거래가 사라진다 — 기다리기만 하면 된다.
const openMonth = () => screen.findByText('커피');

// 재조회가 일어났는지는 월별 요약 호출로 센다. 전체 GET 수를 세면 수정 창이
// 열릴 때 폼이 부르는 자동완성·카테고리 집계까지 함께 세어져, 재조회가 끊겨도
// 숫자가 늘어난다 — 실제로 그래서 돌연변이 두 건을 놓쳤다.
const reloadCount = () => get.mock.calls.filter(([u]) => u.includes('summary/by-month')).length;

const selectRow = (tx) => screen.getByRole('checkbox', {
  name: `${tx.date} ${tx.merchant} 거래 선택`,
});

beforeEach(() => {
  get.mockReset(); post.mockReset(); put.mockReset(); del.mockReset();
  navigate.mockReset();
  mockGet();
  post.mockResolvedValue({ id: 999 });
  put.mockResolvedValue({ ok: true });
  del.mockResolvedValue({ ok: true, deleted: 2 });
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/transactions');
});

afterEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/transactions');
});

describe('선택', () => {
  it('고르기 전에는 선택 관련 버튼이 없다', async () => {
    renderPage();
    await openMonth();

    // 아무것도 안 골랐는데 '선택 삭제' 가 떠 있으면 잘못 눌릴 자리가 하나 는다.
    expect(screen.queryByRole('button', { name: '선택 삭제' })).toBeNull();
  });

  it('고르면 몇 건인지 알린다', async () => {
    renderPage();
    await openMonth();

    await userEvent.click(selectRow(TX_A));

    expect(screen.getByText('1건 선택됨')).toBeTruthy();
    expect(screen.getByRole('button', { name: '선택 삭제' })).toBeTruthy();
  });

  it('다시 누르면 선택이 풀린다', async () => {
    renderPage();
    await openMonth();

    await userEvent.click(selectRow(TX_A));
    await userEvent.click(selectRow(TX_A));

    expect(screen.queryByText(/건 선택됨/)).toBeNull();
  });

  it('전체 선택이 그 달의 거래를 모두 고른다', async () => {
    renderPage();
    await openMonth();

    await userEvent.click(screen.getByRole('checkbox', { name: '전체 선택' }));

    expect(screen.getByText('2건 선택됨')).toBeTruthy();
  });

  it('전체 선택을 다시 누르면 모두 풀린다', async () => {
    renderPage();
    await openMonth();
    const all = screen.getByRole('checkbox', { name: '전체 선택' });

    await userEvent.click(all);
    await userEvent.click(all);

    expect(screen.queryByText(/건 선택됨/)).toBeNull();
  });

  it('선택 해제 버튼이 한 번에 푼다', async () => {
    renderPage();
    await openMonth();
    await userEvent.click(selectRow(TX_A));

    await userEvent.click(screen.getByRole('button', { name: '선택 해제' }));

    expect(screen.queryByText(/건 선택됨/)).toBeNull();
    expect(del).not.toHaveBeenCalled();
  });
});

describe('일괄 삭제', () => {
  const arm = async () => {
    renderPage();
    await openMonth();
    await userEvent.click(selectRow(TX_A));
    await userEvent.click(selectRow(TX_B));
    await userEvent.click(screen.getByRole('button', { name: '선택 삭제' }));
  };

  it('몇 건인지와 되돌릴 수 없다는 것을 함께 알린다', async () => {
    await arm();

    // 건수를 안 알리면 무엇을 지우는지 모르고 누른다.
    expect(within(dialog()).getByText(/선택한 2건을 삭제하시겠습니까\? 되돌릴 수 없습니다\./)).toBeTruthy();
    expect(del).not.toHaveBeenCalled();
  });

  it('확인하면 고른 id 만 보낸다', async () => {
    await arm();
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));

    // 서버가 id 목록으로 지운다. 목록이 어긋나면 고른 적 없는 거래가 사라진다(#465).
    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/transactions', { ids: [101, 102] }));
  });

  it('취소하면 지우지 않고 선택도 그대로 둔다', async () => {
    await arm();
    await userEvent.click(within(dialog()).getByRole('button', { name: '취소' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(del).not.toHaveBeenCalled();
    // 선택이 풀리면 다시 하나씩 골라야 한다.
    expect(screen.getByText('2건 선택됨')).toBeTruthy();
  });

  it('지우고 나면 선택을 비우고 목록을 다시 읽는다', async () => {
    await arm();
    const before = reloadCount();
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));

    await waitFor(() => expect(screen.queryByText(/건 선택됨/)).toBeNull());
    // 선택이 남아 있으면 이미 지운 id 로 또 부를 수 있다.
    await waitFor(() => expect(reloadCount()).toBeGreaterThan(before));
  });

  it('실패하면 사유를 알리고 선택을 지키다', async () => {
    del.mockRejectedValue(new Error('일부 거래가 잠겨 있어요'));
    await arm();
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));

    expect(await screen.findByText('일부 거래가 잠겨 있어요')).toBeTruthy();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '확인' }));
    expect(screen.getByText('2건 선택됨')).toBeTruthy();
  });
});

describe('개별 삭제', () => {
  const clickDelete = async () => {
    renderPage();
    await openMonth();
    const row = screen.getByText('커피').closest('div[class*="grid"], li, tr') || document.body;
    const btn = within(row).queryByRole('button', { name: '삭제' })
      || screen.getAllByRole('button', { name: '삭제' })[0];
    await userEvent.click(btn);
  };

  it('확인하면 그 한 건만 지운다', async () => {
    await clickDelete();
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));

    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/transactions/101'));
    // 일괄 경로와 달리 본문이 없다. 여기서 ids 를 실으면 의미가 달라진다.
    expect(del.mock.calls[0]).toHaveLength(1);
    // 지운 뒤 다시 안 읽으면 사라진 거래가 화면에 남는다.
    await waitFor(() => expect(reloadCount()).toBeGreaterThan(1));
  });

  it('취소하면 지우지 않는다', async () => {
    await clickDelete();
    await userEvent.click(within(dialog()).getByRole('button', { name: '취소' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(del).not.toHaveBeenCalled();
  });

  it('실패하면 사유를 알린다', async () => {
    del.mockRejectedValue(new Error('파생 거래는 지울 수 없어요'));
    await clickDelete();
    await userEvent.click(within(dialog()).getByRole('button', { name: '확인' }));

    expect(await screen.findByText('파생 거래는 지울 수 없어요')).toBeTruthy();
  });
});

describe('추가와 수정', () => {
  it('추가는 빈 폼으로 연다', async () => {
    renderPage();
    await openMonth();

    await userEvent.click(screen.getByRole('button', { name: '+ 거래 추가' }));

    expect(await screen.findByText('새 거래 추가')).toBeTruthy();
  });

  it('수정은 그 거래의 값으로 연다', async () => {
    renderPage();
    await openMonth();

    await userEvent.click(screen.getAllByRole('button', { name: '수정' })[0]);

    expect(await screen.findByText('거래 수정')).toBeTruthy();
    expect(screen.getByDisplayValue('커피')).toBeTruthy();
  });

  it('수정을 저장하면 POST 가 아니라 그 id 로 PUT 한다', async () => {
    renderPage();
    await openMonth();

    await userEvent.click(screen.getAllByRole('button', { name: '수정' })[0]);
    await screen.findByText('거래 수정');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/transactions/101',
      expect.objectContaining({ merchant: '커피' })));
    expect(post).not.toHaveBeenCalled();
  });

  it('저장하면 창을 닫고 목록을 다시 읽는다', async () => {
    renderPage();
    await openMonth();
    const before = reloadCount();

    await userEvent.click(screen.getAllByRole('button', { name: '수정' })[0]);
    await screen.findByText('거래 수정');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(screen.queryByText('거래 수정')).toBeNull());
    // 다시 안 읽으면 방금 고친 값이 목록에 안 뜬다. 되돌리기 스낵바(#301)도
    // 같은 신호를 타므로 여기서 끊기면 되돌릴 기회 자체가 사라진다.
    await waitFor(() => expect(reloadCount()).toBeGreaterThan(before));
  });

  it('수정을 저장한 뒤 추가를 열면 빈 폼이다', async () => {
    renderPage();
    await openMonth();

    await userEvent.click(screen.getAllByRole('button', { name: '수정' })[0]);
    await screen.findByText('거래 수정');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(screen.queryByText('거래 수정')).toBeNull());

    await userEvent.click(screen.getByRole('button', { name: '+ 거래 추가' }));

    // 저장 경로에서 editItem 을 안 비우면 '새 거래 추가' 라고 적힌 창에 남의
    // 값이 채워지고, 그대로 누르면 같은 거래가 하나 더 생긴다.
    expect(await screen.findByText('새 거래 추가')).toBeTruthy();
    expect(screen.queryByDisplayValue('커피')).toBeNull();
  });

  it('수정을 열었다 닫고 추가를 열면 빈 폼이다', async () => {
    renderPage();
    await openMonth();

    await userEvent.click(screen.getAllByRole('button', { name: '수정' })[0]);
    await screen.findByText('거래 수정');
    await userEvent.click(screen.getByRole('button', { name: '취소' }));
    await userEvent.click(screen.getByRole('button', { name: '+ 거래 추가' }));

    // editItem 이 남아 있으면 '새 거래 추가' 라고 적힌 창에 남의 값이 채워진다.
    expect(await screen.findByText('새 거래 추가')).toBeTruthy();
    expect(screen.queryByDisplayValue('커피')).toBeNull();
  });
});

// #280. 값은 세션 저장소로 넘긴다 — 쿼리 문자열로 넘기면 가맹점·메모가
// 주소창과 방문 기록에 남는다. 이 앱은 가계부라 그 값이 곧 사생활이다.
describe('반복 규칙으로 넘기기', () => {
  const clickMakeRecurring = async () => {
    renderPage();
    await openMonth();
    await userEvent.click(screen.getAllByRole('button', { name: /반복/ })[0]);
  };

  it('설정의 반복거래 절로 보낸다', async () => {
    await clickMakeRecurring();

    expect(navigate).toHaveBeenCalledWith('/settings#recurring');
  });

  it('값은 주소가 아니라 세션 저장소로 넘긴다', async () => {
    await clickMakeRecurring();

    const raw = window.sessionStorage.getItem('recurring-draft');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw).merchant).toBe('커피');
    // 주소창에 가맹점이 실리면 방문 기록에 남는다.
    expect(navigate.mock.calls[0][0]).not.toContain('커피');
  });

  it('금액도 함께 넘긴다', async () => {
    await clickMakeRecurring();

    const draft = JSON.parse(window.sessionStorage.getItem('recurring-draft'));
    expect(String(draft.amount)).toBe('4500');
  });
});
