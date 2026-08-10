import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TransactionForm from './TransactionForm';

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({})),
    del: vi.fn(() => Promise.resolve({})),
  },
}));

const categories = [
  { id: 1, name: '식비', major_type: '변동필수', monthly_budget: 300000 },
  { id: 2, name: '급여', major_type: '수입', monthly_budget: null },
];
const paymentMethods = [{ id: 10, name: '신한카드', type: '신용' }];

// 결제수단 선택은 카드사와 카드상품을 한 값에 싣는다(#302). 접두사로 어느 쪽인지
// 구분한다 — 자세한 규칙과 그룹핑은 lib/paymentOptions.test.jsx 가 본다.
const PM_10 = 'pm:10';

function renderForm(props = {}) {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  render(
    <TransactionForm
      categories={categories}
      paymentMethods={paymentMethods}
      onSave={onSave}
      onCancel={onCancel}
      {...props}
    />
  );
  return { onSave, onCancel };
}

describe('TransactionForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('A. 필수 필드 검증', () => {
    it('날짜 입력에 required 속성이 있어야 한다', async () => {
      renderForm();
      const dateInput = screen.getByLabelText(/날짜 \*/);
      expect(dateInput.required).toBe(true);
    });

    it('금액 입력에 required 속성이 있어야 한다', async () => {
      renderForm();
      const amountInput = screen.getByLabelText(/금액 \(원\) \*/);
      expect(amountInput.required).toBe(true);
    });

    it('카테고리 선택에 required 속성이 있어야 한다', async () => {
      renderForm();
      const categorySelect = screen.getByLabelText(/카테고리 \*/);
      expect(categorySelect.required).toBe(true);
    });
  });

  describe('B. 제출 시 숫자 필드 변환', () => {
    it('금액, 카테고리ID, 결제수단ID가 숫자로 변환되어야 한다', async () => {
      const user = userEvent.setup();
      const { onSave } = renderForm();

      await user.type(screen.getByLabelText(/금액 \(원\) \*/), '50000');
      await user.selectOptions(screen.getByLabelText(/카테고리 \*/), '1');
      await user.selectOptions(screen.getByLabelText(/결제수단/), PM_10);

      const submitButton = screen.getByText('추가');
      await user.click(submitButton);

      expect(onSave).toHaveBeenCalledTimes(1);
      const args = onSave.mock.calls[0][0];
      expect(typeof args.amount).toBe('number');
      expect(args.amount).toBe(50000);
      expect(typeof args.category_id).toBe('number');
      expect(args.category_id).toBe(1);
      expect(typeof args.payment_method_id).toBe('number');
      expect(args.payment_method_id).toBe(10);
    });
  });

  describe('C. 결제수단이 없을 때 null로 넘어감', () => {
    it('결제수단을 선택하지 않으면 payment_method_id는 null이다', async () => {
      const user = userEvent.setup();
      const { onSave } = renderForm();

      await user.type(screen.getByLabelText(/금액 \(원\) \*/), '50000');
      await user.selectOptions(screen.getByLabelText(/카테고리 \*/), '1');

      const submitButton = screen.getByText('추가');
      await user.click(submitButton);

      expect(onSave).toHaveBeenCalledTimes(1);
      const args = onSave.mock.calls[0][0];
      expect(args.payment_method_id).toBeNull();
    });
  });

  describe('D. 기존 거래 수정 모드', () => {
    it('initial prop이 주어지면 해당 값으로 입력이 채워진다', async () => {
      const initial = {
        date: '2026-07-01', category_id: 1, amount: 12345,
        payment_method_id: 10, payment_style: '일시불',
        merchant: '스타벅스', memo: '테스트',
      };

      const { onSave } = renderForm({ initial });

      expect(screen.getByLabelText(/가맹점\/내용/).value).toBe('스타벅스');
      expect(screen.getByLabelText(/금액 \(원\) \*/).value).toBe('12345');

      const submitButton = screen.getByText('저장');
      await userEvent.click(submitButton);

      expect(onSave).toHaveBeenCalledTimes(1);
      const args = onSave.mock.calls[0][0];
      expect(args.amount).toBe(12345);
    });
  });

  describe('E. 예산 힌트', () => {
    it('카테고리를 선택하면 잔여예산 문구가 표시된다', async () => {
      renderForm();

      // 카테고리 선택
      await userEvent.selectOptions(screen.getByLabelText(/카테고리 \*/), '1');

      // 예산 힌트가 표시되는지 확인
      const budgetHint = screen.queryByText(/이번달/);
      expect(budgetHint).toBeTruthy();
    });
  });

  // 카드사 단위로는 전략 추천이 성립하지 않는다(#302). 여기서 상품을 고르지
  // 못하면 #276 의 계산이 먹을 데이터가 영영 안 생긴다.
  describe('F. 카드상품 단위 선택', () => {
    const cardProducts = [
      { id: 11, payment_method_id: 10, issuer: '신한카드', product_name: '신한 A카드' },
      { id: 12, payment_method_id: 10, issuer: '신한카드', product_name: '신한 B카드' },
    ];

    async function fillAndSubmit(user, selection) {
      await user.type(screen.getByLabelText(/금액 \(원\) \*/), '50000');
      await user.selectOptions(screen.getByLabelText(/카테고리 \*/), '1');
      if (selection) await user.selectOptions(screen.getByLabelText(/결제수단/), selection);
      await user.click(screen.getByText('추가'));
    }

    it('F-1. 카드가 상품명으로 표시된다 — 카드사는 보조 표기다', () => {
      renderForm({ cardProducts });
      expect(screen.getByRole('option', { name: '신한 A카드 · 신한카드' })).toBeTruthy();
    });

    it('F-2. 같은 카드사의 카드 두 장을 따로 고를 수 있다', () => {
      renderForm({ cardProducts });
      expect(screen.getByRole('option', { name: '신한 A카드 · 신한카드' })).toBeTruthy();
      expect(screen.getByRole('option', { name: '신한 B카드 · 신한카드' })).toBeTruthy();
    });

    it('F-3. 선택지가 카드·현금성·이체로 묶인다', () => {
      renderForm({
        cardProducts,
        paymentMethods: [
          ...paymentMethods,
          { id: 7, name: '현금', type: '현금성' },
          { id: 9, name: '자동이체', type: '이체' },
        ],
      });
      const groups = [...screen.getByLabelText(/결제수단/).querySelectorAll('optgroup')];
      expect(groups.map((g) => g.label)).toEqual(['카드', '현금성', '이체']);
    });

    it('F-4. 카드를 고르면 카드사와 카드가 함께 넘어간다', async () => {
      const user = userEvent.setup();
      const { onSave } = renderForm({ cardProducts });

      await fillAndSubmit(user, 'cp:12');

      const args = onSave.mock.calls[0][0];
      expect(args.card_product_id).toBe(12);
      expect(args.payment_method_id).toBe(10);
    });

    it('F-5. 카드사만 고르면 카드는 미상으로 넘어간다', async () => {
      const user = userEvent.setup();
      const { onSave } = renderForm({ cardProducts });

      await fillAndSubmit(user, PM_10);

      const args = onSave.mock.calls[0][0];
      expect(args.payment_method_id).toBe(10);
      expect(args.card_product_id).toBeNull();
    });

    it('F-6. 카드를 골랐다가 카드사로 되돌리면 카드가 지워진다', async () => {
      const user = userEvent.setup();
      const { onSave } = renderForm({ cardProducts });

      await user.selectOptions(screen.getByLabelText(/결제수단/), 'cp:12');
      await fillAndSubmit(user, PM_10);

      expect(onSave.mock.calls[0][0].card_product_id).toBeNull();
    });

    it('F-7. 아무것도 안 고르면 둘 다 null 이다', async () => {
      const user = userEvent.setup();
      const { onSave } = renderForm({ cardProducts });

      await fillAndSubmit(user, null);

      const args = onSave.mock.calls[0][0];
      expect(args.payment_method_id).toBeNull();
      expect(args.card_product_id).toBeNull();
    });

    it('F-8. 수정 모드에서 그 거래의 카드가 이미 골라져 있다', () => {
      renderForm({
        cardProducts,
        initial: {
          date: '2026-07-01', category_id: 1, amount: 12345,
          payment_method_id: 10, card_product_id: 11, payment_style: '일시불',
        },
      });
      expect(screen.getByLabelText(/결제수단/).value).toBe('cp:11');
    });

    it('F-9. 카드가 미상인 거래는 카드사만 골라져 있다', () => {
      renderForm({
        cardProducts,
        initial: {
          date: '2026-07-01', category_id: 1, amount: 12345,
          payment_method_id: 10, card_product_id: null, payment_style: '일시불',
        },
      });
      expect(screen.getByLabelText(/결제수단/).value).toBe(PM_10);
    });

    it('F-10. 수정 모드에서 카드만 바꿔도 나머지 값이 그대로 넘어간다', async () => {
      const user = userEvent.setup();
      const { onSave } = renderForm({
        cardProducts,
        initial: {
          date: '2026-07-01', category_id: 1, amount: 12345,
          payment_method_id: 10, card_product_id: 11, payment_style: '일시불',
          merchant: '스타벅스', memo: '테스트',
        },
      });

      await user.selectOptions(screen.getByLabelText(/결제수단/), 'cp:12');
      await user.click(screen.getByText('저장'));

      const args = onSave.mock.calls[0][0];
      expect(args.card_product_id).toBe(12);
      expect(args.merchant).toBe('스타벅스');
      expect(args.amount).toBe(12345);
    });

    it('F-11. 등록된 카드가 없으면 카드사 이름만 보인다 — 지금 화면 그대로다', () => {
      renderForm();
      expect(screen.getByRole('option', { name: '신한카드' })).toBeTruthy();
    });
  });

});
