import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TransactionForm from './TransactionForm';

// 손으로 넣는 결제의 해외 표시(#710).
//
// ─────────────────────────────────────────────────────────────────────────
// 이 배선은 **조용히 끊긴다**
//
// `transactions.is_overseas` 는 `NOT NULL DEFAULT 0` 이다. 폼이 이 값을 안
// 실어 보내도 저장은 성공하고, 전부 「국내」 로 들어갈 뿐이다. 오류가 아니라
// 그럴듯한 값이 나온다 — 사용자는 체크박스를 켜고 저장했는데 「해외 N% 적립」
// 이 안 붙는 것을 보고 혜택 데이터를 의심하게 된다.
//
// 추천(`CardEstimateHint`)도 같다. 서버는 **원장에 아직 없는 결제**의 해외
// 여부를 알 길이 없어서 폼이 알려 줘야 하는데, 안 보내면 국내로 보고 해외 전용
// 혜택을 후보에서 뺀다. 국내 혜택이 없는 카드는 그 순간 「해당하는 혜택이
// 없어요」 로만 보인다 — #688 이 저지른 것과 같은 모양의 거짓말이다.

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../lib/api', () => ({
  api: {
    get,
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({})),
    del: vi.fn(() => Promise.resolve({})),
  },
}));

const categories = [
  { id: 1, name: '식비', major_type: '변동필수', monthly_budget: 300000 },
];
const paymentMethods = [{ id: 10, name: '예시카드사', type: '신용' }];

async function renderForm(props = {}) {
  const onSave = vi.fn();
  render(
    <TransactionForm
      categories={categories}
      paymentMethods={paymentMethods}
      onSave={onSave}
      onCancel={vi.fn()}
      {...props}
    />
  );
  await act(async () => {});
  return { onSave };
}

// 필수 칸을 채운다. 금액만 넣으면 카테고리가 비어 제출 자체가 막힌다 —
// 그러면 「저장을 눌렀는데 onSave 가 안 불렸다」 가 되어 무엇이 틀렸는지
// 알 수 없다.
async function fill() {
  await userEvent.type(screen.getByLabelText(/금액 \(원\) \*/), '100000');
  await userEvent.selectOptions(screen.getByLabelText(/카테고리 \*/), '1');
}

// 추천 질의만 골라낸다. 폼은 최근 가맹점·이번달 지출도 같이 받아 온다.
function estimateCalls() {
  return get.mock.calls.map((c) => c[0]).filter((u) => typeof u === 'string' && u.includes('/estimate'));
}

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({ data: [] });
});

describe('TransactionForm — 해외결제 표시', () => {
  it('A-1. 체크박스가 있고 기본은 꺼져 있다', async () => {
    await renderForm();
    const box = screen.getByLabelText('해외결제예요');
    expect(box).toBeTruthy();
    expect(box.checked).toBe(false);
  });

  it('A-2. 무엇에 쓰이는지 적는다 — 안 적으면 아무도 안 켠다', async () => {
    await renderForm();
    expect(screen.getByText(/해외 N% 적립.*표시가 있어야 붙어요/)).toBeTruthy();
  });

  it('A-3. 임포트한 결제는 자동으로 표시된다는 것도 적는다', async () => {
    // 이 안내가 없으면 사용자는 들여온 수백 건을 손으로 확인하려 든다.
    await renderForm();
    expect(screen.getByText(/카드사 엑셀로 들여온.*자동으로 표시/)).toBeTruthy();
  });

  it('A-4. 켜서 저장하면 is_overseas 가 실려 나간다', async () => {
    const { onSave } = await renderForm();

    await fill();
    await userEvent.click(screen.getByLabelText('해외결제예요'));
    await userEvent.click(screen.getByRole('button', { name: /저장|추가/ }));

    expect(onSave).toHaveBeenCalled();
    expect(onSave.mock.calls[0][0].is_overseas).toBe(true);
  });

  it('A-5. 안 켜면 false 로 실려 나간다 — undefined 로 새면 서버가 못 가른다', async () => {
    const { onSave } = await renderForm();

    await fill();
    await userEvent.click(screen.getByRole('button', { name: /저장|추가/ }));

    expect(onSave.mock.calls[0][0].is_overseas).toBe(false);
  });

  it('A-6. 수정 화면은 저장된 값을 되살린다 — 안 그러면 저장하는 순간 표시가 지워진다', async () => {
    await renderForm({
      initial: {
        id: 1, date: '2026-01-11', category_id: 1, amount: 100000,
        payment_method_id: 10, card_product_id: null, payment_style: '일시불',
        merchant: 'ANTHROPIC', memo: '', is_overseas: 1,
      },
    });

    expect(screen.getByLabelText('해외결제예요').checked).toBe(true);
  });
});

describe('CardEstimateHint 배선 — 추천도 해외 여부를 알아야 한다', () => {
  it('B-1. 안 켜면 추천 질의에 is_overseas 를 안 싣는다', async () => {
    await renderForm();
    await userEvent.type(screen.getByLabelText(/금액 \(원\) \*/), '100000');

    await waitFor(() => expect(estimateCalls().length).toBeGreaterThan(0));
    expect(estimateCalls().every((u) => !u.includes('is_overseas'))).toBe(true);
  });

  it('B-2. 켜면 싣는다 — 서버는 원장에 없는 결제의 해외 여부를 알 길이 없다', async () => {
    await renderForm();
    await userEvent.type(screen.getByLabelText(/금액 \(원\) \*/), '100000');
    await userEvent.click(screen.getByLabelText('해외결제예요'));

    await waitFor(() => {
      expect(estimateCalls().some((u) => u.includes('is_overseas=1'))).toBe(true);
    });
  });
});
