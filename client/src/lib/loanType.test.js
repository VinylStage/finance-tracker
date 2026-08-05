import { describe, it, expect } from 'vitest';
import {
  LOAN_TYPE_OPTIONS,
  loanTypeLabel,
  loanTypeFields,
  loanTypeHint,
  supportsProjection,
  creditUsageRatio,
} from './loanType';

// 이 모듈은 대출 유형에 대한 **화면의 말과 규칙을 한 곳에 모은 곳**이다(#329).
// 테스트가 하나도 없어서 구문 25% / 분기 0% 였다.
//
// 조용히 깨지면 두 가지가 난다.
//   1. 내부 값(`credit_line`)이 화면에 그대로 새거나(#231)
//   2. 한도 막대가 잘못된 폭으로 그려진다
// 둘 다 사용자가 보고 판단하는 것이라 조용한 실패가 그대로 오해가 된다.

describe('loanTypeLabel', () => {
  it('아는 유형은 사람이 읽는 말로 바꾼다', () => {
    expect(loanTypeLabel('general')).toBe('일반');
    expect(loanTypeLabel('credit_line')).toBe('마이너스통장');
  });

  it('모르는 값이 와도 내부 값을 그대로 내보내지 않는다', () => {
    // 서버가 새 유형을 추가했는데 화면이 아직 모르는 상황. 그때 `credit_line`
    // 같은 내부 문자열이 화면에 뜨면 안 된다(#231).
    for (const unknown of ['revolving', '', null, undefined, 'CREDIT_LINE']) {
      const label = loanTypeLabel(unknown);
      expect(label).toBe('일반');
      expect(label).not.toContain('_');
    }
  });
});

describe('loanTypeFields', () => {
  it('마이너스통장만 한도와 이자일을 쓴다', () => {
    expect(loanTypeFields('credit_line')).toEqual({ credit_limit: true, interest_day: true });
    expect(loanTypeFields('general')).toEqual({ credit_limit: false, interest_day: false });
  });

  it('모르는 값은 일반 취급이라 한도 입력이 열리지 않는다', () => {
    // 열리면 사용자가 값을 넣는데 서버는 그 유형에서 그 필드를 안 쓴다.
    expect(loanTypeFields('없는유형').credit_limit).toBe(false);
  });
});

describe('loanTypeHint', () => {
  it('유형마다 다른 설명을 준다', () => {
    expect(loanTypeHint('general')).not.toBe(loanTypeHint('credit_line'));
  });

  it('설명에 내부 필드명이 없다', () => {
    for (const t of ['general', 'credit_line', '없는유형']) {
      const hint = loanTypeHint(t);
      expect(hint).toBeTruthy();
      for (const internal of ['credit_line', 'interest_day', 'credit_limit', 'loan_type']) {
        expect(hint).not.toContain(internal);
      }
    }
  });
});

describe('supportsProjection', () => {
  it('서버가 daily 라고 할 때만 참이다', () => {
    expect(supportsProjection({ interest_settings: { interest_basis: 'daily' } })).toBe(true);
    expect(supportsProjection({ interest_settings: { interest_basis: 'monthly' } })).toBe(false);
  });

  it('설정이 없으면 거짓이고 던지지 않는다', () => {
    // 목록 응답에 interest_settings 가 빠질 수 있다. 여기서 터지면 부채 화면이
    // 통째로 안 뜬다.
    for (const input of [undefined, null, {}, { interest_settings: null }]) {
      expect(supportsProjection(input)).toBeFalsy();
    }
  });

  it('유형이 아니라 서버 설정을 본다', () => {
    // loan_type 으로 판정하면 서버가 계산 방식을 바꿨을 때 화면만 어긋난다.
    expect(supportsProjection({
      loan_type: 'credit_line',
      interest_settings: { interest_basis: 'monthly' },
    })).toBe(false);
  });
});

describe('creditUsageRatio', () => {
  it('사용액을 한도로 나눈 백분율이다', () => {
    expect(creditUsageRatio({ used: 3000000, credit_limit: 5000000 })).toBe(60);
    expect(creditUsageRatio({ used: 0, credit_limit: 5000000 })).toBe(0);
  });

  it('한도를 넘으면 100 에서 자른다', () => {
    // 막대 폭으로 쓰이므로 100 을 넘기면 칸 밖으로 삐져나온다.
    expect(creditUsageRatio({ used: 7000000, credit_limit: 5000000 })).toBe(100);
  });

  it('한도가 없거나 0 이면 0 이다', () => {
    // 0 으로 나누면 Infinity 가 되고 그대로 style width 에 들어간다.
    for (const input of [
      undefined, null, {},
      { used: 100, credit_limit: 0 },
      { used: 100, credit_limit: null },
    ]) {
      expect(creditUsageRatio(input)).toBe(0);
    }
  });

  it('음수 사용액은 0 으로 본다', () => {
    // 상환이 과하게 들어가 잔액이 음수가 된 경우. 막대가 반대로 그려지면 안 된다.
    expect(creditUsageRatio({ used: -500000, credit_limit: 5000000 })).toBe(0);
  });

  it('숫자가 아닌 값에도 0 을 준다', () => {
    expect(creditUsageRatio({ used: '삼백만', credit_limit: 5000000 })).toBe(0);
  });
});

describe('LOAN_TYPE_OPTIONS', () => {
  it('SPEC 이 아는 유형을 전부 고를 수 있다', () => {
    // 목록에 없는 유형은 사용자가 선택할 수 없다. SPEC 에만 추가하고 목록에
    // 넣지 않으면 그 유형은 화면에서 만들 수 없는 채로 남는다.
    const values = LOAN_TYPE_OPTIONS.map((o) => o.value);
    expect(values).toContain('general');
    expect(values).toContain('credit_line');
  });

  it('선택지 라벨이 loanTypeLabel 과 같다', () => {
    for (const o of LOAN_TYPE_OPTIONS) {
      expect(o.label).toBe(loanTypeLabel(o.value));
    }
  });
});
