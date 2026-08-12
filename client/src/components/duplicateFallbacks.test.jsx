import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DuplicateCandidates from './DuplicateCandidates';
import { ConfirmProvider } from './ConfirmProvider';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('../lib/api', () => ({
  api: { get, post },
  ApiError: class ApiError extends Error {},
}));

// 이름은 지어낸 것이다. 실제 가맹점 이름을 쓰지 않는다 — 이 저장소는 공개다.
const candidate = (over = {}) => ({
  transaction: {
    id: 1, date: '2026-07-06', merchant: '예시가맹점 갑', amount: 232897,
    payment_style: '할부', category_name: '쇼핑', memo: null,
  },
  installment_id: 1,
  installment_merchant: '예시가맹점 갑 주식회사',
  confidence: 'exact',
  days_apart: 0,
  matched_on: 'total',
  ...over,
});

// 두 엔드포인트를 구분해서 답한다. 같은 값을 둘 다에 주면 지나친 목록에 후보가
// 그대로 나타나 테스트가 잘못된 상태를 통과시킨다.
function setup(rows, dismissed = []) {
  get.mockImplementation((path) => {
    if (path === '/api/installments/duplicates/dismissed') return Promise.resolve({ data: dismissed });
    return Promise.resolve({ data: rows });
  });
  return render(<ConfirmProvider><DuplicateCandidates /></ConfirmProvider>);
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe('가맹점이 비어 있을 때', () => {
  it('목록에 가맹점 없음이라고 쓴다', async () => {
    setup([candidate({ transaction: { ...candidate().transaction, merchant: null } })]);
    expect(await screen.findByText(/가맹점 없음/)).toBeTruthy();
  });

  it('선택 라벨이 깨지지 않는다', async () => {
    setup([candidate({ transaction: { ...candidate().transaction, merchant: null } })]);
    const box = await screen.findByRole('checkbox');
    expect(box.getAttribute('aria-label')).toContain('2026-07-06');
    expect(box.getAttribute('aria-label')).toContain('선택');
  });
});

describe('확신도가 낯선 값일 때', () => {
  it('검토 문구로 되돌아간다', async () => {
    setup([candidate({ confidence: 'brand-new-value' })]);
    // Use a more flexible matcher to find the text
    expect(await screen.findByText(/할부로 적혀 있는데 등록된 할부가 없어요/)).toBeTruthy();
  });
});

describe('응답에 목록 칸이 없을 때', () => {
  it('빈 화면으로 버틴다', async () => {
    get.mockResolvedValue({});
    render(<ConfirmProvider><DuplicateCandidates /></ConfirmProvider>);
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(screen.queryByRole('checkbox')).toBe(null);
  });
});

describe('선택을 풀 때', () => {
  it('다시 누르면 풀리고 지우기 버튼이 사라진다', async () => {
    const user = userEvent.setup();
    setup([candidate()]);

    const box = await screen.findByRole('checkbox');
    await user.click(box);
    expect(screen.getByRole('button', { name: /지우기/ })).toBeTruthy();

    await user.click(box);
    expect(screen.queryByRole('button', { name: /지우기/ })).toBe(null);
  });
});

describe('지나친 목록에 가맹점이 없을 때', () => {
  it('괄호 붙은 표기로 자리를 지킨다', async () => {
    const user = userEvent.setup();
    setup([], [{ transaction_id: 9, date: '2026-06-02', merchant: null, amount: 15000 }]);

    await user.click(await screen.findByRole('button', { name: /중복 아니라고 한 것/ }));

    expect(await screen.findByText('(가맹점 없음)')).toBeTruthy();
  });
});
