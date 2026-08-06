import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Revolving from './Revolving';
import { ConfirmProvider } from '../components/ConfirmProvider';

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

// 폼의 기본 월은 오늘에서 온다. 실제 시계로 두면 달이 바뀌는 날 테스트가 뒤집힌다.
vi.mock('../lib/date', () => ({
  localYMD: () => '2026-08-06',
  localYearMonth: () => '2026-08',
}));

const ROW = {
  id: 5, month: '2026-07', payment_method_id: 2, payment_method_name: '현대카드',
  carried_balance: 400000, new_charge: 250000, paid_amount: 300000,
  interest: 8000, next_carried_balance: 358000,
};

// 카드명이 없는 기록. 있는 쪽과 한 픽스처로 겸하면 '—' 분기가 안 밟힌다.
const NO_CARD = {
  id: 6, month: '2026-06', payment_method_id: null, payment_method_name: null,
  carried_balance: 0, new_charge: 100000, paid_amount: 100000,
  interest: 0, next_carried_balance: 0,
};

const METHODS = [
  { id: 2, name: '현대카드' },
  { id: 3, name: '국민카드' },
];

function mockGet({ rows = [ROW], balance = 358000, methods = METHODS,
  listError = null, derived = [] } = {}) {
  get.mockImplementation((url) => {
    if (url.includes('/derived')) return Promise.resolve({ data: derived });
    if (url.startsWith('/api/revolving')) {
      return listError
        ? Promise.reject(listError)
        : Promise.resolve({ data: rows, current_carried_balance: balance });
    }
    if (url === '/api/payment-methods') return Promise.resolve(methods);
    return Promise.resolve({ data: [] });
  });
}

function renderPage() {
  return render(<ConfirmProvider><Revolving /></ConfirmProvider>);
}

const settled = () => waitFor(() => expect(screen.queryByText('로딩 중...')).toBeNull());

// 목록 요청만 골라낸다. 결제수단·파생거래 요청이 섞이면 재조회 횟수를 못 센다.
const listCalls = () => get.mock.calls.filter(([url]) => url.startsWith('/api/revolving?')
  || url === '/api/revolving');

beforeEach(() => {
  get.mockReset(); post.mockReset(); put.mockReset(); del.mockReset();
  post.mockResolvedValue({ ok: true });
  del.mockResolvedValue({ ok: true });
  window.location.hash = '';
});

afterEach(() => {
  window.location.hash = '';
});

describe('리볼빙 원장', () => {
  it('월별 기록과 현재 이월잔액을 보여준다', async () => {
    mockGet();
    renderPage();
    await settled();

    expect(screen.getByRole('cell', { name: '2026-07' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '현대카드' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '400,000원' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '250,000원' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '300,000원' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '8,000원' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '358,000원' })).toBeTruthy();
    expect(screen.getByText('358,000원', { selector: 'span' })).toBeTruthy();
  });

  it('이월잔액이 안 오면 0 으로 보여준다', async () => {
    get.mockImplementation((url) => {
      if (url.startsWith('/api/revolving')) return Promise.resolve({ data: [] });
      if (url === '/api/payment-methods') return Promise.resolve(METHODS);
      return Promise.resolve({ data: [] });
    });
    renderPage();
    await settled();

    // 없는 값이 undefined 로 새면 화면에 'NaN원' 이 뜬다.
    expect(screen.getByText('0원')).toBeTruthy();
  });

  it('카드가 없는 기록은 —— 로 표시한다', async () => {
    mockGet({ rows: [NO_CARD] });
    renderPage();
    await settled();

    expect(screen.getByRole('cell', { name: '—' })).toBeTruthy();
  });

  it('기록이 없으면 안내를 띄운다', async () => {
    mockGet({ rows: [] });
    renderPage();
    await settled();

    expect(screen.getByText('리볼빙 기록이 없습니다.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('목록을 못 불러오면 에러와 재시도를 띄운다', async () => {
    mockGet({ listError: new Error('서버에 연결할 수 없습니다') });
    renderPage();
    await settled();

    expect(screen.getByText('서버에 연결할 수 없습니다')).toBeTruthy();

    mockGet();
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(screen.getByRole('cell', { name: '2026-07' })).toBeTruthy());
  });
});

describe('카드 필터', () => {
  it('전체일 때는 질의문자열 없이 부른다', async () => {
    mockGet();
    renderPage();
    await settled();

    expect(listCalls()[0][0]).toBe('/api/revolving');
  });

  it('카드를 고르면 그 카드로 다시 부른다', async () => {
    mockGet();
    renderPage();
    await settled();

    await userEvent.selectOptions(screen.getByLabelText('카드 필터'), '3');

    // 필터가 주소에 안 실리면 화면만 바뀌고 서버는 전체를 계속 준다.
    await waitFor(() => expect(listCalls().at(-1)[0]).toBe('/api/revolving?payment_method_id=3'));
  });

  it('전체로 되돌리면 질의문자열을 뗀다', async () => {
    mockGet();
    renderPage();
    await settled();

    await userEvent.selectOptions(screen.getByLabelText('카드 필터'), '3');
    await waitFor(() => expect(listCalls().at(-1)[0]).toContain('payment_method_id=3'));

    await userEvent.selectOptions(screen.getByLabelText('카드 필터'), '');
    await waitFor(() => expect(listCalls().at(-1)[0]).toBe('/api/revolving'));
  });

  it('결제수단 목록을 선택지로 올린다', async () => {
    mockGet();
    renderPage();
    await settled();

    const names = within(screen.getByLabelText('카드 필터')).getAllByRole('option')
      .map(o => o.textContent);
    expect(names).toEqual(['전체 카드', '현대카드', '국민카드']);
  });
});

describe('수수료 거래 펼치기', () => {
  it('펼치면 그 기록의 파생거래를 부른다', async () => {
    mockGet();
    renderPage();
    await settled();

    const toggle = screen.getByRole('button', { name: /수수료 거래/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    await userEvent.click(toggle);

    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/revolving/5/derived'));
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('다시 누르면 접는다', async () => {
    mockGet();
    renderPage();
    await settled();

    const toggle = screen.getByRole('button', { name: /수수료 거래/ });
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute('aria-expanded')).toBe('true'));

    await userEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('한 번에 한 줄만 펼친다', async () => {
    mockGet({ rows: [ROW, NO_CARD] });
    renderPage();
    await settled();

    const toggles = screen.getAllByRole('button', { name: /수수료 거래/ });
    await userEvent.click(toggles[0]);
    await waitFor(() => expect(toggles[0].getAttribute('aria-expanded')).toBe('true'));

    await userEvent.click(toggles[1]);
    await waitFor(() => expect(toggles[1].getAttribute('aria-expanded')).toBe('true'));
    expect(toggles[0].getAttribute('aria-expanded')).toBe('false');
  });

  it('거래내역에서 넘어오면 그 줄을 펼친 채로 연다', async () => {
    window.location.hash = '#revolving-5';
    mockGet();
    renderPage();
    await settled();

    await waitFor(() => {
      const toggle = screen.getByRole('button', { name: /수수료 거래/ });
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
    });
    expect(document.getElementById('revolving-5')).toBeTruthy();
  });

  it('다른 화면의 해시로는 펼치지 않는다', async () => {
    window.location.hash = '#installment-5';
    mockGet();
    renderPage();
    await settled();

    expect(screen.getByRole('button', { name: /수수료 거래/ }).getAttribute('aria-expanded')).toBe('false');
  });
});

describe('월 기록 등록', () => {
  const openForm = async () => {
    await userEvent.click(screen.getByRole('button', { name: '+ 이번달 기록' }));
  };

  it('버튼이 폼을 열고 닫는다', async () => {
    mockGet();
    renderPage();
    await settled();

    await openForm();
    expect(screen.getByText('리볼빙 월 기록')).toBeTruthy();

    await openForm();
    expect(screen.queryByText('리볼빙 월 기록')).toBeNull();
  });

  it('월 기본값은 이번 달이다', async () => {
    mockGet();
    renderPage();
    await settled();

    await openForm();
    expect(screen.getByLabelText('월 *').value).toBe('2026-08');
  });

  it('저장하면 숫자 칸을 숫자로 바꿔 보낸다', async () => {
    mockGet();
    renderPage();
    await settled();

    await openForm();
    await userEvent.selectOptions(screen.getByLabelText('카드 *'), '2');
    await userEvent.type(screen.getByLabelText('이월잔액 (원)'), '400000');
    await userEvent.type(screen.getByLabelText('신규사용액 (원)'), '250000');
    await userEvent.type(screen.getByLabelText('납부액 (원) *'), '300000');
    await userEvent.type(screen.getByLabelText('이자 (원)'), '8000');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/revolving', {
      month: '2026-08',
      payment_method_id: 2,
      carried_balance: 400000,
      new_charge: 250000,
      paid_amount: 300000,
      interest: 8000,
    }));
  });

  it('비운 금액 칸은 빈 문자열이 아니라 0 으로 보낸다', async () => {
    mockGet();
    renderPage();
    await settled();

    await openForm();
    await userEvent.selectOptions(screen.getByLabelText('카드 *'), '2');
    await userEvent.type(screen.getByLabelText('납부액 (원) *'), '100000');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    const sent = post.mock.calls[0][1];
    // '' 가 그대로 가면 서버가 NULL 로 저장하고 이월 계산이 NaN 이 된다.
    expect(sent.carried_balance).toBe(0);
    expect(sent.new_charge).toBe(0);
    expect(sent.interest).toBe(0);
  });

  it('저장에 성공하면 폼을 닫고 목록을 다시 읽는다', async () => {
    mockGet();
    renderPage();
    await settled();
    const before = listCalls().length;

    await openForm();
    await userEvent.selectOptions(screen.getByLabelText('카드 *'), '2');
    await userEvent.type(screen.getByLabelText('납부액 (원) *'), '100000');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(screen.queryByText('리볼빙 월 기록')).toBeNull());
    expect(listCalls().length).toBeGreaterThan(before);
  });

  it('저장이 실패하면 폼 안에 사유를 띄우고 닫지 않는다', async () => {
    mockGet();
    post.mockRejectedValue(new Error('같은 달 기록이 이미 있습니다'));
    renderPage();
    await settled();

    await openForm();
    await userEvent.selectOptions(screen.getByLabelText('카드 *'), '2');
    await userEvent.type(screen.getByLabelText('납부액 (원) *'), '100000');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByText('같은 달 기록이 이미 있습니다')).toBeTruthy();
    // 모달이 아니라 폼 안에 붙는다. 폼이 닫히면 입력이 통째로 날아간다.
    expect(screen.getByText('리볼빙 월 기록')).toBeTruthy();
  });

  it('메시지 없는 실패에도 사유를 띄운다', async () => {
    mockGet();
    post.mockRejectedValue(new Error(''));
    renderPage();
    await settled();

    await openForm();
    await userEvent.selectOptions(screen.getByLabelText('카드 *'), '2');
    await userEvent.type(screen.getByLabelText('납부액 (원) *'), '100000');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByText('저장 실패')).toBeTruthy();
  });

  it('취소하면 폼을 닫고 남은 에러도 지운다', async () => {
    mockGet();
    post.mockRejectedValue(new Error('같은 달 기록이 이미 있습니다'));
    renderPage();
    await settled();

    await openForm();
    await userEvent.selectOptions(screen.getByLabelText('카드 *'), '2');
    await userEvent.type(screen.getByLabelText('납부액 (원) *'), '100000');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByText('같은 달 기록이 이미 있습니다')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: '취소' }));
    await openForm();

    // 지난 에러가 남아 있으면 새 입력을 시작하자마자 빨간 문구가 떠 있다.
    expect(screen.queryByText('같은 달 기록이 이미 있습니다')).toBeNull();
  });
});

describe('삭제', () => {
  it('확인하면 삭제하고 목록을 다시 읽는다', async () => {
    mockGet();
    renderPage();
    await settled();
    const before = listCalls().length;

    await userEvent.click(screen.getByRole('button', { name: '삭제' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '확인' }));

    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/revolving/5'));
    await waitFor(() => expect(listCalls().length).toBeGreaterThan(before));
  });

  it('취소하면 삭제하지 않는다', async () => {
    mockGet();
    renderPage();
    await settled();

    await userEvent.click(screen.getByRole('button', { name: '삭제' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(del).not.toHaveBeenCalled();
  });

  it('삭제가 실패하면 서버 메시지를 알린다', async () => {
    mockGet();
    del.mockRejectedValue(new Error('연결된 거래가 있어 삭제할 수 없습니다'));
    renderPage();
    await settled();

    await userEvent.click(screen.getByRole('button', { name: '삭제' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '확인' }));

    expect(await screen.findByText('연결된 거래가 있어 삭제할 수 없습니다')).toBeTruthy();
  });
});
