import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import CardBenefitConditionFields from './CardBenefitConditionFields';

// 위 넷 말고 **아무것도 import 하지 않는다.** 특히 `@testing-library/jest-dom` 은
// 이 저장소에 설치돼 있지 않다 — 넣으면 «Failed to resolve import» 로 죽는다.
// 새 의존성을 추가하지 않는다.

const FORM = { max_amount: '', threshold_exempt: false, unified_cap_exempt: false };

function setup(overrides = {}) {
  const setField = vi.fn();
  render(
    <CardBenefitConditionFields
      form={{ ...FORM, ...overrides }}
      setField={setField}
      inp="test-input"
    />,
  );
  return { setField };
}

describe('CardBenefitConditionFields', () => {
  it('세 칸이 다 그려진다', () => {
    setup();
    
    expect(screen.getByLabelText('건당 최대 결제액 (선택)')).toBeTruthy();
    expect(screen.getByLabelText('실적 조건 없는 혜택')).toBeTruthy();
    expect(screen.getByLabelText('카드 통합 한도 밖')).toBeTruthy();
  });

  it('최대 결제액에 입력하면 setField가 호출된다', async () => {
    const { setField } = setup();
    await userEvent.type(screen.getByLabelText('건당 최대 결제액 (선택)'), '5');
    expect(setField).toHaveBeenCalledWith('max_amount', expect.anything());
  });

  it('최대 결제액은 form.max_amount를 그대로 보여준다', () => {
    setup({ max_amount: '100000' });
    expect(screen.getByLabelText('건당 최대 결제액 (선택)').value).toBe('100000');
  });

  it('실적 면제 체크박스를 켜면 setField가 호출된다', async () => {
    const { setField } = setup();
    await userEvent.click(screen.getByLabelText('실적 조건 없는 혜택'));
    expect(setField).toHaveBeenCalledWith('threshold_exempt', true);
  });

  it('이미 켜져 있으면 체크된 채로 그려지고, 누르면 false 로 올라간다', async () => {
    const { setField } = setup({ threshold_exempt: true });
    expect(screen.getByLabelText('실적 조건 없는 혜택').checked).toBe(true);
    await userEvent.click(screen.getByLabelText('실적 조건 없는 혜택'));
    expect(setField).toHaveBeenCalledWith('threshold_exempt', false);
  });

  it('통합 한도 밖 체크박스도 같다', async () => {
    const { setField } = setup({ unified_cap_exempt: false });
    await userEvent.click(screen.getByLabelText('카드 통합 한도 밖'));
    expect(setField).toHaveBeenCalledWith('unified_cap_exempt', true);
  });

  it('두 체크박스는 서로 독립이다', () => {
    setup({ threshold_exempt: true });
    expect(screen.getByLabelText('카드 통합 한도 밖').checked).toBe(false);
  });
});
