import { describe, it, expect } from 'vitest';
import { LOAN_TYPE_OPTIONS, loanTypeLabel, loanTypeFields, loanTypeHint, supportsProjection, creditUsageRatio } from './loanType';

describe('유형별 명세', () => {
  it('두 유형만 고를 수 있다', () => {
    // 내부 값이 화면에 새면 사용자가 '마이너스통장' 대신 'credit_line' 을 읽는다(#231)
    expect(LOAN_TYPE_OPTIONS).toHaveLength(2);
    expect(LOAN_TYPE_OPTIONS.map(o => o.value)).toEqual(['general', 'credit_line']);
    expect(LOAN_TYPE_OPTIONS.some(o => o.label.includes('credit_line'))).toBe(false);
  });

  it('유형마다 의미 있는 입력이 다르다', () => {
    // 서버(`services/interest/index.js`)도 같은 조합을 요구한다. 여기가 어긋나면 화면에서 못 넣는 값을 서버가 요구하거나 그 반대가 된다
    expect(loanTypeFields('general')).toEqual({ credit_limit: false, interest_day: false });
    expect(loanTypeFields('credit_line')).toEqual({ credit_limit: true, interest_day: true });
  });

  it('라벨과 안내문이 유형마다 다르다', () => {
    expect(loanTypeLabel('general')).toBe('일반');
    expect(loanTypeLabel('credit_line')).toBe('마이너스통장');
    expect(loanTypeHint('general')).not.toBe(loanTypeHint('credit_line'));
    expect(loanTypeHint('general')).not.toBe('');
    expect(loanTypeHint('credit_line')).not.toBe('');
  });

  it('모르는 유형은 일반으로 떨어진다 — 화면이 비지 않는다', () => {
    // 서버가 새 유형을 먼저 내려보내면 화면이 먼저 깨진다. 떨어뜨리면 안내문이 조금 안 맞을 뿐 화면은 뜬다
    const unknownValues = ['보통대출', null, undefined, '', 'GENERAL', 0];
    unknownValues.forEach(value => {
      expect(loanTypeLabel(value)).toBe('일반');
      expect(loanTypeFields(value)).toEqual({ credit_limit: false, interest_day: false });
      expect(loanTypeHint(value)).toBe(loanTypeHint('general'));
    });
  });
});

describe('supportsProjection', () => {
  it('일 단위 계산일 때만 기간별 이자를 지원한다', () => {
    expect(supportsProjection({ interest_settings: { interest_basis: 'daily' } })).toBe(true);
    expect(supportsProjection({ interest_settings: { interest_basis: 'monthly' } })).toBe(false);
  });

  it('설정이 없거나 debt 자체가 없어도 죽지 않는다', () => {
    // 목록을 그리는 중에 던지면 대출 화면 전체가 안 뜬다
    expect(supportsProjection(undefined)).toBe(false);
    expect(supportsProjection(null)).toBe(false);
    expect(supportsProjection({})).toBe(false);
    expect(supportsProjection({ interest_settings: null })).toBe(false);
  });
});

describe('creditUsageRatio', () => {
  it('사용률을 퍼센트로 낸다', () => {
    expect(creditUsageRatio({ used: 300000, credit_limit: 1000000 })).toBe(30);
    expect(creditUsageRatio({ used: 0, credit_limit: 1000000 })).toBe(0);
  });

  it('한도를 넘으면 100 에서 자른다', () => {
    // 안 자르면 막대가 칸 밖으로 삐져나가 옆 요소를 밀어낸다
    expect(creditUsageRatio({ used: 1500000, credit_limit: 1000000 })).toBe(100);
  });

  it('음수는 0 으로 본다', () => {
    expect(creditUsageRatio({ used: -50000, credit_limit: 1000000 })).toBe(0);
  });

  it('한도가 없거나 0 이면 0 — 나누기를 막는다', () => {
    // 막지 않으면 Infinity 나 NaN 이 막대 폭(`width: NaN%`)으로 나가 막대가 아예 안 그려진다
    expect(creditUsageRatio(null)).toBe(0);
    expect(creditUsageRatio(undefined)).toBe(0);
    expect(creditUsageRatio({})).toBe(0);
    expect(creditUsageRatio({ used: 100, credit_limit: 0 })).toBe(0);
  });
});
