import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import CardOverseasSection from './CardOverseasSection';

// 해외 표시 백필 화면(#710 · ADR 0008).
//
// 여기서 보는 것은 **게이트가 화면에서도 지켜지는가** 다 — 확인 없이 쓰지 않는가,
// 근거를 보여주는가, 서버가 막았을 때(409) 사용자를 다시 보게 하는가.
//
// 서버 쪽 게이트는 `test/cardOverseasRoute.test.js` 가 따로 못박는다. 둘 다
// 필요하다 — 화면만 막으면 원칙이 반쪽이고, 서버만 막으면 사용자가 왜 막혔는지
// 모른다.

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const { confirmFn, alertFn } = vi.hoisted(() => ({ confirmFn: vi.fn(), alertFn: vi.fn() }));

vi.mock('../lib/api', () => ({
  api: { get, post, put: vi.fn(), del: vi.fn(), raw: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

vi.mock('./ConfirmProvider', () => ({
  useConfirm: () => ({ confirm: confirmFn, alert: alertFn }),
}));

// 가맹점 이름은 전부 실제로 명세서에 찍히는 모양을 흉내낸 것이다. 표기 모양이
// 이 기능의 존재 이유라 그 모양만은 실제와 같아야 한다.
const PLAN = {
  count: 3,
  amount: 52722,
  byEvidence: { currency: 1, country: 2 },
  samples: [
    { id: 1, merchant: 'ANTHROPIC,USD:5.50', amount: 8116, evidence: 'currency' },
    { id: 2, merchant: 'ANTHROPIC   SAN FRANCISCO USA', amount: 12106, evidence: 'country' },
    { id: 3, merchant: 'OPENAI      SAN FRANCISCO USA', amount: 32500, evidence: 'country' },
  ],
  preview_token: 'tok-1',
  undoable: true,
};

const EMPTY = { count: 0, amount: 0, byEvidence: {}, samples: [], preview_token: 'tok-0', undoable: true };

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  confirmFn.mockReset();
  alertFn.mockReset();
});

async function renderWith(plan) {
  get.mockResolvedValue(plan);
  render(<CardOverseasSection />);
  await waitFor(() => expect(screen.queryByText('확인 중...')).toBeNull());
}

describe('CardOverseasSection', () => {
  it('C-1. 열자마자 프리뷰를 부른다 — **GET 이다**, 쓰기가 아니라 조회다', async () => {
    await renderWith(PLAN);
    expect(get).toHaveBeenCalledWith('/api/card-overseas/backfill/preview');
    expect(post).not.toHaveBeenCalled();
  });

  it('C-2. 건수·금액과 **근거**를 보여준다 — 건수만 보여주면 통보다', async () => {
    await renderWith(PLAN);
    expect(screen.getByText('해외로 표시할 결제 3건 · 52,722원')).toBeTruthy();
    expect(screen.getByText(/외화 표시 1건/)).toBeTruthy();
    expect(screen.getByText(/국가 표시 2건/)).toBeTruthy();
  });

  it('C-3. 사례를 가맹점 이름 그대로 보여준다 — 무엇이 바뀌는지 눈으로 봐야 한다', async () => {
    await renderWith(PLAN);
    expect(screen.getByText('ANTHROPIC,USD:5.50')).toBeTruthy();
    // testing-library 가 공백을 하나로 줄여 읽는다. 명세서의 여러 칸 공백은
    // 표시의 일부가 아니라 정렬이라 줄어도 상관없다.
    expect(screen.getByText('ANTHROPIC SAN FRANCISCO USA')).toBeTruthy();
  });

  it('C-4. 채울 것이 없으면 버튼을 그리지 않는다', async () => {
    await renderWith(EMPTY);
    expect(screen.queryByRole('button', { name: /표시하기/ })).toBeNull();
    expect(screen.getByText(/채울 것이 없어요/)).toBeTruthy();
  });

  it('C-5. 확인을 거절하면 쓰지 않는다 — 화면에서도 게이트가 선다', async () => {
    await renderWith(PLAN);
    confirmFn.mockResolvedValue(false);

    await userEvent.click(screen.getByRole('button', { name: /3건 표시하기/ }));

    expect(confirmFn).toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled(); // 쓰기는 한 번도 안 나갔다
  });

  it('C-6. 확인하면 **프리뷰 지문을 실어** 쓴다 — 서버가 대조할 것이 있어야 한다', async () => {
    await renderWith(PLAN);
    confirmFn.mockResolvedValue(true);
    post.mockResolvedValueOnce({ ok: true, updated: 3, remaining: 0 });
    get.mockResolvedValueOnce(EMPTY);

    await userEvent.click(screen.getByRole('button', { name: /3건 표시하기/ }));

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/api/card-overseas/backfill', { preview_token: 'tok-1' });
    });
  });

  it('C-7. 되돌릴 수 있다는 것을 확인 문구에 적는다', async () => {
    await renderWith(PLAN);
    confirmFn.mockResolvedValue(false);

    await userEvent.click(screen.getByRole('button', { name: /3건 표시하기/ }));

    expect(confirmFn.mock.calls[0][0]).toMatch(/되돌/);
  });

  it('C-8. 끝나면 결과와 남은 건수를 말한다 — 부분 완료가 정상이다', async () => {
    await renderWith(PLAN);
    confirmFn.mockResolvedValue(true);
    post.mockResolvedValueOnce({ ok: true, updated: 2, remaining: 1 });
    get.mockResolvedValueOnce({ ...EMPTY, count: 1 });

    await userEvent.click(screen.getByRole('button', { name: /3건 표시하기/ }));

    await waitFor(() => expect(screen.getByText(/2건을 해외결제로 표시했어요/)).toBeTruthy());
    expect(screen.getByText(/아직 1건 남았어요/)).toBeTruthy();
  });

  it('C-9. 서버가 409 로 막으면 그 문구를 보여주고 다시 보게 한다', async () => {
    await renderWith(PLAN);
    confirmFn.mockResolvedValue(true);
    alertFn.mockResolvedValue(undefined);
    post.mockRejectedValueOnce(new Error('미리보기를 본 뒤 대상이 달라졌어요. 다시 확인하고 채워 주세요.'));

    await userEvent.click(screen.getByRole('button', { name: /3건 표시하기/ }));

    await waitFor(() => expect(alertFn).toHaveBeenCalled());
    expect(alertFn.mock.calls[0][0]).toMatch(/대상이 달라졌어요/);
    // 막힌 뒤에는 프리뷰를 다시 받아 지금 상태를 보여준다.
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it('C-10. 판정 기준을 「명세서의 표시」 라고 못박아 말한다', async () => {
    // 판정 근거는 카드사가 남긴 표시다(ADR 0010). 사용자가 규칙을 「영문
    // 가맹점이면 해외」 로 오해하면, 안 잡힌 `Adobe` · `Temu` 를 버그로 신고한다.
    // 그래서 화면은 **아니라고 먼저 말한다.**
    await renderWith(PLAN);
    const body = document.body.textContent;
    expect(body).toMatch(/명세서/);
    expect(body).toMatch(/이름이 영문이라고 해외로 보지는 않아요/);
  });
});
