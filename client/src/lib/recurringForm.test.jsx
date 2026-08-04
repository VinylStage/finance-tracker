import { describe, it, expect } from 'vitest';
import {
  EMPTY_RULE_FORM, ruleToForm, formFromTransaction, formToBody,
  validateForm, describeSchedule, endOfMonthNote,
} from './recurringForm';

const TX = {
  id: 7, date: '2026-03-25', amount: 9900, merchant: '넷플릭스',
  category_id: 11, payment_method_id: 3, payment_style: '일시불', memo: '구독',
};

describe('A. 거래에서 규칙 만들기', () => {
  it('A-1. 가맹점·금액·카테고리·결제수단을 그대로 가져온다', () => {
    // 그 조합이 이미 거래내역에 있는데 다시 고르게 하는 것이 이 기능의 이유다.
    const f = formFromTransaction(TX);
    expect(f.merchant).toBe('넷플릭스');
    expect(f.amount).toBe('9900');
    expect(f.category_id).toBe('11');
    expect(f.payment_method_id).toBe('3');
  });

  it('A-2. 거래 날짜를 시작일로 쓰지 않는다', () => {
    // 과거 날짜를 시작일로 두면 저장하는 순간 따라잡기(#279)가 그 사이
    // 회차를 전부 만들어 버린다.
    const f = formFromTransaction(TX);
    expect(f.starts_on).not.toBe('2026-03-25');
    expect(f.starts_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('A-3. 날짜의 일자는 발생일 힌트로 쓴다', () => {
    // 25일에 낸 거래는 매월 25일에 나갈 가능성이 높다.
    expect(formFromTransaction(TX).day_of_month).toBe('25');
  });

  it('A-4. 날짜가 없거나 형식이 어긋나도 죽지 않는다', () => {
    expect(formFromTransaction({ ...TX, date: null }).day_of_month).toBe('1');
    expect(formFromTransaction({ ...TX, date: '2026/03/25' }).day_of_month).toBe('1');
  });

  it('A-5. 거래가 통째로 없어도 빈 폼을 돌려준다', () => {
    const f = formFromTransaction(undefined);
    expect(f.merchant).toBe('');
    expect(f.freq).toBe('monthly');
  });
});

describe('B. 폼 → 본문', () => {
  it('B-1. 일 단위 반복은 발생일을 보내지 않는다', () => {
    // 보내면 안 쓰는 값이 저장돼, 주기를 월로 바꿨을 때 사용자가 정한 적 없는
    // 날짜가 튀어나온다.
    const body = formToBody({ ...EMPTY_RULE_FORM, freq: 'daily', day_of_month: '25', starts_on: '2026-08-01' });
    expect(body.day_of_month).toBe(null);
  });

  it('B-2. 연 반복이 아니면 지정 월을 보내지 않는다', () => {
    const body = formToBody({ ...EMPTY_RULE_FORM, freq: 'monthly', month_of_year: '3', starts_on: '2026-08-01' });
    expect(body.month_of_year).toBe(null);
  });

  it('B-3. 종료일을 비우면 null 로 보낸다(무기한)', () => {
    expect(formToBody({ ...EMPTY_RULE_FORM, ends_on: '', starts_on: '2026-08-01' }).ends_on).toBe(null);
  });

  it('B-4. 간격이 비어 있으면 1 로 보낸다', () => {
    expect(formToBody({ ...EMPTY_RULE_FORM, interval: '', starts_on: '2026-08-01' }).interval).toBe(1);
  });

  it('B-5. 규칙 → 폼 → 본문 왕복에서 값이 안 바뀐다', () => {
    const rule = {
      category_id: 11, merchant: '월세', amount: 500000, freq: 'monthly', interval: 2,
      day_of_month: 5, month_of_year: null, starts_on: '2026-01-05', ends_on: '2026-12-05',
      payment_method_id: 3, payment_style: '일시불', memo: null,
    };
    const body = formToBody(ruleToForm(rule));
    expect(body).toMatchObject({
      category_id: 11, merchant: '월세', amount: 500000,
      freq: 'monthly', interval: 2, day_of_month: 5,
      starts_on: '2026-01-05', ends_on: '2026-12-05',
    });
  });
});

describe('C. 저장 전 검사', () => {
  const ok = { ...EMPTY_RULE_FORM, category_id: '11', merchant: '월세', amount: '500000', starts_on: '2026-01-05' };

  it('C-1. 제대로 채우면 통과한다', () => {
    expect(validateForm(ok)).toBe(null);
  });

  it('C-2. 종료일이 시작일보다 빠르면 막는다', () => {
    expect(validateForm({ ...ok, ends_on: '2025-12-31' })).toMatch(/종료일/);
  });

  it('C-3. 간격이 0 이면 막는다', () => {
    expect(validateForm({ ...ok, interval: '0' })).toMatch(/간격/);
  });

  it('C-4. 연 반복인데 월을 안 고르면 막는다', () => {
    expect(validateForm({ ...ok, freq: 'yearly', month_of_year: '' })).toMatch(/몇 월/);
  });

  it('C-5. 일 단위 반복은 발생일을 안 따진다', () => {
    // 화면에서 감춘 입력 때문에 저장이 막히면 사용자는 이유를 알 수 없다.
    expect(validateForm({ ...ok, freq: 'daily', day_of_month: '' })).toBe(null);
  });

  it('C-6. 시작일이 없으면 막는다', () => {
    expect(validateForm({ ...ok, starts_on: '' })).toMatch(/시작일/);
  });
});

describe('D. 일정 표기', () => {
  it('D-1. 매월', () => {
    expect(describeSchedule({ freq: 'monthly', interval: 1, day_of_month: 25 })).toBe('매월 25일');
  });

  it('D-2. 몇 개월마다', () => {
    expect(describeSchedule({ freq: 'monthly', interval: 2, day_of_month: 25 })).toBe('2개월마다 25일');
  });

  it('D-3. 매일과 며칠마다', () => {
    expect(describeSchedule({ freq: 'daily', interval: 1 })).toBe('매일');
    expect(describeSchedule({ freq: 'daily', interval: 3 })).toBe('3일마다');
  });

  it('D-4. 매년은 월까지 붙인다', () => {
    expect(describeSchedule({ freq: 'yearly', interval: 1, month_of_year: 3, day_of_month: 25 })).toBe('매년 3월 25일');
  });

  it('D-5. 값이 비어도 월 반복으로 읽는다', () => {
    // #278 이전에 만들어진 규칙은 freq/interval 이 비어 있을 수 있다.
    expect(describeSchedule({ day_of_month: 15 })).toBe('매월 15일');
  });
});

describe('E. 말일 안내', () => {
  it('E-1. 29일 이상이면 안내한다', () => {
    // 안 알려주면 2월에 날짜가 다른 것을 버그로 읽는다(#278 A안).
    expect(endOfMonthNote({ freq: 'monthly', day_of_month: '31' })).toMatch(/마지막 날/);
  });

  it('E-2. 28일 이하면 안내하지 않는다', () => {
    expect(endOfMonthNote({ freq: 'monthly', day_of_month: '25' })).toBe(null);
  });

  it('E-3. 일 단위 반복에는 안내하지 않는다', () => {
    expect(endOfMonthNote({ freq: 'daily', day_of_month: '31' })).toBe(null);
  });
});
