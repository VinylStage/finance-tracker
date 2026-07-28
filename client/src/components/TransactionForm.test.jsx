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
const paymentMethods = [{ id: 10, name: '신한카드' }];

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
      await user.selectOptions(screen.getByLabelText(/결제수단/), '10');

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
});
