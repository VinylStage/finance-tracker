import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Settings from './Settings';
import { ConfirmProvider } from '../components/ConfirmProvider';

// 전체 거래내역 삭제(#363). 되돌릴 수 없는 유일한 동작이라 관문이 셋이다 —
// 입력 문구, 확인 대화상자, 그리고 서버가 요구하는 확인 토큰. 셋 중 하나라도
// 조용히 풀리면 한 번의 오조작으로 원장이 비므로, 세 관문을 각각 잠근다.
//
// 서버 쪽은 test/ 의 라우트 테스트가 본다. 여기서는 **무엇을 보내는가**와
// **언제 보내지 않는가**만 고정한다.
//
// 절 단위로 파일을 나눈다. 설정 화면은 절이 열두 개고 '저장'·'삭제' 같은 글자가
// 여러 절에 겹친다. 한 파일에 몰면 다른 절 작업과 서로 밟는다.

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, put, del },
  ApiError: class ApiError extends Error {},
}));

function mockApi() {
  get.mockImplementation((url) => {
    if (url.startsWith('/api/categories')) return Promise.resolve([]);
    if (url.startsWith('/api/payment-methods')) return Promise.resolve([]);
    if (url.startsWith('/api/settings')) return Promise.resolve({ initial_balance: 0, monthly_income: 0 });
    if (url.startsWith('/api/recurring-rules')) return Promise.resolve([]);
    if (url.startsWith('/api/accounts')) return Promise.resolve({ data: [] });
    return Promise.resolve([]);
  });
}

const renderSettings = () => render(<ConfirmProvider><Settings /></ConfirmProvider>);

const dangerSection = async () => {
  const h = await screen.findByRole('heading', { name: '위험 구역' });
  return within(h.closest('section'));
};

beforeEach(() => {
  vi.clearAllMocks();
  mockApi();
});

describe('전체 삭제 버튼의 잠금', () => {
  it('아무것도 입력하지 않았으면 잠겨 있다', async () => {
    renderSettings();
    const danger = await dangerSection();

    expect(danger.getByRole('button', { name: '전체 거래내역 삭제' }).disabled).toBe(true);
  });

  it('문구가 틀리면 잠긴 채로 둔다', async () => {
    renderSettings();
    const danger = await dangerSection();

    await userEvent.type(danger.getByRole('textbox'), '전체 삭제');

    // 공백 하나만 달라도 통과하면 관문이 아니다.
    expect(danger.getByRole('button', { name: '전체 거래내역 삭제' }).disabled).toBe(true);
  });

  it('문구가 정확히 맞아야 열린다', async () => {
    renderSettings();
    const danger = await dangerSection();

    await userEvent.type(danger.getByRole('textbox'), '전체삭제');

    expect(danger.getByRole('button', { name: '전체 거래내역 삭제' }).disabled).toBe(false);
  });

  // 핸들러 안에도 같은 문구 검사가 한 겹 더 있다(Settings.jsx:1273). 그쪽은
  // 여기서 잠그지 못한다 — disabled 가 살아 있는 한 DOM 으로는 핸들러에 닿을
  // 수 없고(fireEvent 로 직접 던져도 막힌다), 컴포넌트가 export 되지 않아
  // 핸들러만 떼어 부를 수도 없다. 지우면 이 파일은 그대로 통과한다.
  //
  // **없는 신호를 통과로 읽지 않기 위해 적어 둔다.** 저 줄을 지워도 되는 게
  // 아니라, 이 층위의 테스트로는 검증되지 않는 층이 하나 더 있다는 뜻이다.
});

describe('삭제 실행', () => {
  const armAndClick = async () => {
    renderSettings();
    const danger = await dangerSection();
    await userEvent.type(danger.getByRole('textbox'), '전체삭제');
    await userEvent.click(danger.getByRole('button', { name: '전체 거래내역 삭제' }));
    return danger;
  };

  it('대화상자에서 확인해야 삭제한다', async () => {
    del.mockResolvedValue({ ok: true, deleted: 3 });
    await armAndClick();

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/되돌릴 수 없습니다/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: '전체 삭제' }));

    await waitFor(() => expect(del).toHaveBeenCalled());
  });

  it('대화상자에서 취소하면 부르지 않는다', async () => {
    await armAndClick();

    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(del).not.toHaveBeenCalled();
  });

  it('서버가 요구하는 확인 토큰까지 실어 보낸다', async () => {
    del.mockResolvedValue({ ok: true, deleted: 3 });
    await armAndClick();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '전체 삭제' }));

    // 화면의 관문 둘과 별개로, API 를 직접 부르는 경로까지 막는 토큰이다.
    // 여기서 빠지면 서버 방어선이 화면 코드에 의해 무력화된다.
    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/transactions', {
      all: true,
      confirm: 'DELETE_ALL',
    }));
  });

  it('삭제한 건수를 알린다', async () => {
    del.mockResolvedValue({ ok: true, deleted: 2212 });
    const danger = await armAndClick();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '전체 삭제' }));

    // 자릿수 구분은 넣지 않는다. 금액이 아니라 건수라 formatWon 을 태우지 않고,
    // 지금 표기가 그렇다 — 바꾸려면 이 줄이 먼저 실패해야 한다.
    expect(await danger.findByText('2212건이 삭제되었습니다.')).toBeTruthy();
  });

  it('성공하면 입력 문구를 비워 다시 잠근다', async () => {
    del.mockResolvedValue({ ok: true, deleted: 1 });
    const danger = await armAndClick();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '전체 삭제' }));

    await waitFor(() => expect(danger.getByRole('textbox').value).toBe(''));
    // 문구가 남아 있으면 버튼이 열린 채로 있어 연타로 또 부를 수 있다.
    expect(danger.getByRole('button', { name: '전체 거래내역 삭제' }).disabled).toBe(true);
  });

  it('서버가 ok 가 아니면 사유를 그대로 보여준다', async () => {
    del.mockResolvedValue({ ok: false, error: '확인 토큰이 올바르지 않습니다' });
    const danger = await armAndClick();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '전체 삭제' }));

    expect(await danger.findByText('오류: 확인 토큰이 올바르지 않습니다')).toBeTruthy();
  });

  it('요청 자체가 실패해도 사유를 보여준다', async () => {
    del.mockRejectedValue(new Error('서버에 연결할 수 없습니다'));
    const danger = await armAndClick();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '전체 삭제' }));

    expect(await danger.findByText('오류: 서버에 연결할 수 없습니다')).toBeTruthy();
  });

  it('실패한 뒤에도 버튼이 다시 눌린다', async () => {
    del.mockRejectedValue(new Error('일시적 오류'));
    const danger = await armAndClick();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '전체 삭제' }));
    await danger.findByText('오류: 일시적 오류');

    // deleting 이 안 풀리면 '삭제 중...' 인 채로 굳어 재시도할 수 없다.
    expect(danger.getByRole('button', { name: '전체 거래내역 삭제' }).disabled).toBe(false);
  });
});
