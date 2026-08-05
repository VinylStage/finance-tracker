import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import SettlementReclassifySection, { toCriteria, impactLine } from './SettlementReclassifySection';
import { ConfirmProvider } from './ConfirmProvider';
import { withRo } from '../lib/settlementLabels';

// 결제방식 일괄 재분류의 화면 쪽(#289). 서버 왕복은 test/settlementReclassify.test.js 가 본다.
//
// **여기서 고정하는 것은 "사용자가 무엇을 승인하는지 아는가" 다.**
// 건수만 물으면 통장 숫자가 왜 갑자기 늘었는지 모른 채 승인하게 된다.

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('../lib/api', () => ({
  api: { get, post },
  ApiError: class ApiError extends Error {},
}));

const METHODS = [
  { id: 1, name: '신용카드', type: '신용', is_active: 1 },
  { id: 2, name: '현금', type: '현금성', is_active: 1 },
];

const PLAN = {
  target: { settlement: 'deferred', payment_method_id: 1, payment_method_name: '신용카드' },
  count: 3,
  samples: [
    { id: 11, date: '2026-07-05', merchant: '스타벅스', amount: 30000, before: 'immediate', after: 'deferred' },
  ],
  impact: [{
    accountId: 7, accountName: '주거래통장',
    balanceBefore: 1000000, balanceAfter: 1100000, balanceDelta: 100000,
    cardUnpaidBefore: 0, cardUnpaidAfter: 100000,
  }],
  preview_token: 'tok-1',
  undoable: true,
};

function setup() {
  return render(
    <ConfirmProvider>
      <SettlementReclassifySection paymentMethods={METHODS} />
    </ConfirmProvider>,
  );
}

const pickMethod = () => userEvent.selectOptions(screen.getByLabelText('결제수단'), '1');

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  post.mockResolvedValue(PLAN);
});

describe('A. 프리뷰', () => {
  it('A-1. 결제수단을 고르기 전에는 서버를 안 부른다', async () => {
    setup();
    await new Promise((r) => setTimeout(r, 350));
    expect(post).not.toHaveBeenCalled();
  });

  it('A-2. 고르면 프리뷰를 부르고 건수를 보여준다', async () => {
    setup();
    await pickMethod();

    await waitFor(() => expect(post).toHaveBeenCalledWith(
      '/api/settlement/reclassify/preview',
      expect.objectContaining({ payment_method_id: 1, settlement: 'deferred' }),
    ));
    expect(await screen.findByText(/3건을/)).toBeTruthy();
  });

  it('A-3. 잔액이 어떻게 달라지는지 보여준다', async () => {
    // 이 작업의 결과는 건수가 아니라 잔액이다.
    setup();
    await pickMethod();

    const line = await screen.findByText(/주거래통장 잔액이/);
    expect(line.textContent).toContain('1,000,000원');
    expect(line.textContent).toContain('1,100,000원');
  });

  it('A-4. 늘어난 잔액이 돈이 생긴 게 아니라고 말한다', async () => {
    // 카드 미결제액을 같이 안 보여주면 쓸 수 있는 돈이 늘었다고 읽는다.
    setup();
    await pickMethod();

    const line = await screen.findByText(/주거래통장 잔액이/);
    expect(line.textContent).toContain('카드 미결제액');
  });

  it('A-5. 바꿀 게 없으면 그렇게 말한다', async () => {
    post.mockResolvedValue({ ...PLAN, count: 0, samples: [], impact: [] });
    setup();
    await pickMethod();

    expect(await screen.findByText(/바꿀 거래가 없어요/)).toBeTruthy();
  });

  it('A-6. 프리뷰가 실패해도 화면이 안 죽는다', async () => {
    post.mockRejectedValue(new Error('결제수단을 골라 주세요.'));
    setup();
    await pickMethod();

    expect(await screen.findByText('결제수단을 골라 주세요.')).toBeTruthy();
  });
});

describe('B. 확인 후에만 실행한다', () => {
  it('B-1. 확인 문구에 잔액 변화가 들어간다', async () => {
    setup();
    await pickMethod();
    await screen.findByText(/3건을/);

    await userEvent.click(screen.getByRole('button', { name: /3건 바꾸기/ }));

    // 건수만 묻고 넘어가면 무엇을 승인하는지 모른 채 승인하게 된다.
    // 프리뷰 패널에도 같은 문장이 있으므로 확인 문구만 골라 본다.
    const dialog = await screen.findByText(/바꿀까요\?/);
    expect(dialog.textContent).toContain('주거래통장 잔액이');
    expect(dialog.textContent).toContain('1,100,000원');
    expect(dialog.textContent).toContain('되돌리기로 되돌릴 수 있어요');
  });

  it('B-2. 취소하면 아무것도 안 바꾼다', async () => {
    setup();
    await pickMethod();
    await screen.findByText(/3건을/);
    post.mockClear();

    await userEvent.click(screen.getByRole('button', { name: /3건 바꾸기/ }));
    await userEvent.click(await screen.findByRole('button', { name: '취소' }));

    expect(post).not.toHaveBeenCalledWith('/api/settlement/reclassify', expect.anything());
  });

  it('B-3. 확인하면 지문과 함께 실행한다', async () => {
    setup();
    await pickMethod();
    await screen.findByText(/3건을/);

    post.mockResolvedValue({ ok: true, updated: 3, target: PLAN.target, impact: PLAN.impact });
    await userEvent.click(screen.getByRole('button', { name: /3건 바꾸기/ }));
    await userEvent.click(await screen.findByRole('button', { name: '확인' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith(
      '/api/settlement/reclassify',
      expect.objectContaining({ preview_token: 'tok-1' }),
    ));
    expect(await screen.findByText(/3건을 바꿨습니다/)).toBeTruthy();
  });

  it('B-4. 대상이 달라졌으면 그 사실을 알린다', async () => {
    setup();
    await pickMethod();
    await screen.findByText(/3건을/);

    post.mockRejectedValue(new Error('미리보기를 본 뒤 대상이 달라졌어요. 다시 확인하고 바꿔 주세요.'));
    await userEvent.click(screen.getByRole('button', { name: /3건 바꾸기/ }));
    await userEvent.click(await screen.findByRole('button', { name: '확인' }));

    expect(await screen.findByText(/대상이 달라졌어요/)).toBeTruthy();
  });
});

describe('C. 조건 변환과 문구', () => {
  it('C-1. 빈 칸은 조건에서 뺀다', () => {
    // 빈 문자열을 그대로 보내면 서버가 조건으로 해석할 여지가 생긴다.
    expect(toCriteria({ payment_method_id: '1', settlement: 'deferred', from: '', to: '' }))
      .toEqual({ payment_method_id: 1, settlement: 'deferred', from: undefined, to: undefined });
  });

  it('C-2. 방향을 글자로도 말한다', () => {
    // 색이나 기호만으로 구분하면 못 읽는 사용자가 생긴다(#191).
    const up = impactLine({ accountName: '통장', balanceBefore: 100, balanceAfter: 200, balanceDelta: 100, cardUnpaidBefore: 0, cardUnpaidAfter: 100 });
    const down = impactLine({ accountName: '통장', balanceBefore: 200, balanceAfter: 100, balanceDelta: -100, cardUnpaidBefore: 100, cardUnpaidAfter: 0 });

    expect(up).toContain('늘어요');
    expect(down).toContain('줄어요');
  });

  it('C-3. 잔액이 안 바뀌면 그렇게 말한다', () => {
    const same = impactLine({ accountName: '통장', balanceBefore: 100, balanceAfter: 100, balanceDelta: 0, cardUnpaidBefore: 0, cardUnpaidAfter: 0 });
    expect(same).toBe('통장 잔액은 그대로예요.');
  });

  it('C-4. 내부 값이 화면에 안 샌다', () => {
    const line = impactLine(PLAN.impact[0]);
    expect(line).not.toMatch(/deferred|immediate|settlement|balanceDelta/);
  });
});

// 조사(으로/로)는 라벨마다 다르다. 하나로 박아 두면 셋 중 하나는 반드시 틀린
// 문장이 되고, 그건 사용자 화면에 그대로 보인다.
describe('D. 조사', () => {
  it('D-1. 받침에 따라 으로/로 를 가른다', () => {
    expect(withRo('카드 사용')).toBe('카드 사용으로');    // ㅇ 받침
    expect(withRo('즉시 결제')).toBe('즉시 결제로');      // 받침 없음
    expect(withRo('카드대금 인출')).toBe('카드대금 인출로'); // ㄹ 받침
  });

  it('D-2. 따옴표로 감싸도 안쪽 글자를 본다', () => {
    // 화면은 라벨을 따옴표로 감싸 넘긴다. 맨 끝만 보면 늘 '로' 가 된다.
    expect(withRo("'카드 사용'")).toBe("'카드 사용'으로");
    expect(withRo('‘카드 사용’')).toBe('‘카드 사용’으로');
    expect(withRo('‘즉시 결제’')).toBe('‘즉시 결제’로');
  });

  it('D-3. 한글이 없으면 내부 값이 안 샌다', () => {
    expect(withRo(null)).toBe('로');
    expect(withRo('')).toBe('로');
    expect(withRo(undefined)).not.toContain('undefined');
  });
});
