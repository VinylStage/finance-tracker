import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CardPolicySection from './CardPolicySection';
import { ConfirmProvider } from './ConfirmProvider';

// #271 인수 기준의 화면 쪽. 서버 왕복은 cardPolicyRangeRoute.test.js 가 본다.
// 여기서는 "무엇을 보내는가" 와 "무엇을 보여주는가" 만 고정한다.

const { get, post, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), del: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: { get, post, del },
  ApiError: class ApiError extends Error {},
}));

const CARDS = [
  { id: 1, name: '신한카드', type: '신용', is_active: 1 },
  { id: 2, name: '옛날카드', type: '신용', is_active: 0 },
  { id: 3, name: '현금', type: '현금성', is_active: 1 },
];

const policyRow = (months, over = {}) => ({
  id: months, payment_method_id: 1, months,
  policy_type: '무이자', annual_rate: 0, free_months: 0,
  effective_from: '2026-01-01', effective_to: null, memo: null,
  ...over,
});

function setup(policies = []) {
  get.mockResolvedValue({ data: policies });
  return render(
    <ConfirmProvider>
      <CardPolicySection paymentMethods={CARDS} />
    </ConfirmProvider>
  );
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  del.mockReset();
  post.mockResolvedValue({ ok: true, created: 2 });
  del.mockResolvedValue({ ok: true, deleted: 2 });
});

describe('결제수단 선택', () => {
  it('비활성 결제수단과 카드가 아닌 수단은 고를 수 없다', async () => {
    // 현금·계좌이체에 할부 정책을 물어보는 목록은 무엇을 골라야 할지 헷갈리게 한다.
    setup();
    const select = await screen.findByLabelText('결제수단');
    const names = [...select.querySelectorAll('option')].map((o) => o.textContent);
    expect(names).toEqual(['신한카드']);
  });

  it('신용으로 분류된 것이 없으면 전체를 보여준다', async () => {
    // 유형을 다르게 적어 둔 사용자가 화면에서 잠기면 안 된다.
    get.mockResolvedValue({ data: [] });
    render(
      <ConfirmProvider>
        <CardPolicySection paymentMethods={[{ id: 9, name: '기타카드', type: '기타', is_active: 1 }]} />
      </ConfirmProvider>
    );
    const select = await screen.findByLabelText('결제수단');
    expect([...select.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['기타카드']);
  });

  it('결제수단이 없으면 무엇을 해야 하는지 안내한다', () => {
    get.mockResolvedValue({ data: [] });
    render(
      <ConfirmProvider>
        <CardPolicySection paymentMethods={[]} />
      </ConfirmProvider>
    );
    expect(screen.getByText(/결제수단이 아직 없어요/)).toBeTruthy();
    expect(screen.getByText(/결제수단 관리에서 카드를 먼저 추가/)).toBeTruthy();
  });
});

describe('빈 상태', () => {
  it('정책이 없으면 다음 행동을 알려준다', async () => {
    setup([]);
    expect(await screen.findByText(/할부 정책이 없어요/)).toBeTruthy();
    // "없습니다" 로 끝내지 않는다 — 무엇을 할 수 있는지가 있어야 한다(#197).
    expect(screen.getByText(/구간 추가로 시작해 보세요/)).toBeTruthy();
  });
});

describe('목록 표시', () => {
  it('개월수별 행을 구간으로 묶어 보여준다', async () => {
    setup([policyRow(2), policyRow(3), policyRow(4, { policy_type: '유이자', annual_rate: 15.9 })]);
    expect(await screen.findByText('2~3개월')).toBeTruthy();
    expect(screen.getByText('4개월')).toBeTruthy();
    // 세 행이 두 줄로 접힌다.
    expect(screen.getAllByRole('listitem').length).toBe(2);
  });

  it('적용 기간과 정책 내용을 함께 보여준다', async () => {
    setup([policyRow(2, { policy_type: '부분무이자', annual_rate: 15.9, free_months: 2 })]);
    expect(await screen.findByText(/앞 2회차 무이자, 이후 연 15.9%/)).toBeTruthy();
    expect(screen.getByText('2026-01-01부터')).toBeTruthy();
  });

  it('화면 어디에도 내부 필드명이 나오지 않는다', async () => {
    const { container } = setup([policyRow(2), policyRow(3)]);
    await screen.findByText('2~3개월');
    expect(container.textContent).not.toMatch(
      /policy_type|annual_rate|free_months|effective_from|payment_method_id|months/
    );
  });
});

describe('정책 종류별 입력 노출', () => {
  it('무이자면 이자율·면제개월을 받지 않는다', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByText('+ 구간 추가'));
    expect(screen.queryByLabelText('연 이자율(%)')).toBeNull();
    expect(screen.queryByLabelText('무이자 개월')).toBeNull();
  });

  it('유이자면 이자율만 받는다', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByText('+ 구간 추가'));
    await user.selectOptions(screen.getByLabelText('정책 종류'), '유이자');
    expect(screen.getByLabelText('연 이자율(%)')).toBeTruthy();
    expect(screen.queryByLabelText('무이자 개월')).toBeNull();
  });

  it('부분무이자면 둘 다 받는다', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByText('+ 구간 추가'));
    await user.selectOptions(screen.getByLabelText('정책 종류'), '부분무이자');
    expect(screen.getByLabelText('연 이자율(%)')).toBeTruthy();
    expect(screen.getByLabelText('무이자 개월')).toBeTruthy();
  });
});

describe('저장', () => {
  it('구간을 그대로 보낸다 — 화면이 개월수마다 요청하지 않는다', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByText('+ 구간 추가'));
    await user.clear(screen.getByLabelText('시작 개월'));
    await user.type(screen.getByLabelText('시작 개월'), '2');
    await user.clear(screen.getByLabelText('종료 개월'));
    await user.type(screen.getByLabelText('종료 개월'), '12');
    await user.type(screen.getByLabelText('적용 시작일'), '2026-01-01');
    await user.click(screen.getByText('저장'));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [path, body] = post.mock.calls[0];
    expect(path).toBe('/api/card-policies/range');
    expect(body.from_month).toBe(2);
    expect(body.to_month).toBe(12);
  });

  it('감춘 입력은 0 으로 보낸다', async () => {
    // 유이자로 이자율을 적어두고 무이자로 바꾸면, 남은 값이 그대로 가서
    // 서버가 "무이자에는 이자율을 넣을 수 없습니다" 로 막는다.
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByText('+ 구간 추가'));
    await user.selectOptions(screen.getByLabelText('정책 종류'), '유이자');
    await user.type(screen.getByLabelText('연 이자율(%)'), '15.9');
    await user.selectOptions(screen.getByLabelText('정책 종류'), '무이자');
    await user.type(screen.getByLabelText('적용 시작일'), '2026-01-01');
    await user.click(screen.getByText('저장'));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1].annual_rate).toBe(0);
  });

  it('겹침 오류를 폼 옆에 남긴다', async () => {
    const user = userEvent.setup();
    setup();
    post.mockRejectedValue(new Error('2, 3개월에 적용 기간이 겹치는 정책이 이미 있습니다. 기간이나 개월수 구간을 조정해 주세요.'));

    await user.click(await screen.findByText('+ 구간 추가'));
    await user.type(screen.getByLabelText('적용 시작일'), '2026-01-01');
    await user.click(screen.getByText('저장'));

    // 모달로 띄우고 사라지게 두면 어느 값을 고쳐야 하는지 보면서 수정할 수 없다.
    const alertNode = await screen.findByRole('alert');
    expect(alertNode.textContent).toMatch(/2, 3개월에 적용 기간이 겹치는/);
    expect(screen.getByLabelText('시작 개월')).toBeTruthy();
  });
});

describe('삭제', () => {
  it('몇 건이 사라지는지 알리고 확인을 받는다', async () => {
    const user = userEvent.setup();
    setup([policyRow(2), policyRow(3)]);
    await user.click(await screen.findByLabelText('2~3개월 구간 삭제'));

    expect(await screen.findByText(/개월수 2건이 함께 사라집니다/)).toBeTruthy();
    await user.click(screen.getByText('지우기'));
    await waitFor(() => expect(del).toHaveBeenCalledTimes(1));
    expect(del.mock.calls[0][0]).toMatch(/from_month=2&to_month=3/);
  });

  it('취소하면 지우지 않는다', async () => {
    const user = userEvent.setup();
    setup([policyRow(2), policyRow(3)]);
    await user.click(await screen.findByLabelText('2~3개월 구간 삭제'));
    await user.click(await screen.findByText('취소'));
    expect(del).not.toHaveBeenCalled();
  });
});
