import { describe, it, expect } from 'vitest';
import { conditionText } from './benefitConditionText';
import { formatWon } from './format';

describe('conditionText', () => {
  it('조건이 하나도 없으면 빈 문자열이다', () => {
    expect(conditionText({})).toBe('');
  });

  it('min_amount가 0이면 안 말한다', () => {
    expect(conditionText({ min_amount: 0 })).toBe('');
  });

  it('min_amount와 max_amount가 같이 있으면 순서대로 낸다', () => {
    const result = conditionText({ min_amount: 50000, max_amount: 100000 });
    expect(result).toBe(`건당 ${formatWon(50000)} 이상 · 건당 ${formatWon(100000)} 미만`);
  });

  it('날짜 조건을 낸다', () => {
    const result = conditionText({ rule_json: JSON.stringify({ kind: 'rate', when: { dates: ['10-01', '06-06'] } }) });
    expect(result).toContain('10/01 · 06/06 에만');
  });

  it('창별 금액 한도를 창 이름과 함께 낸다', () => {
    const result = conditionText({ rule_json: JSON.stringify({ caps: [ { window: 'transaction', amount: 4000 }, { window: 'day', amount: 20000 }, { window: 'month', amount: 10000 } ] }) });
    expect(result).toContain(`건당 ${formatWon(4000)}까지`);
    expect(result).toContain(`하루 ${formatWon(20000)}까지`);
    expect(result).toContain(`월 ${formatWon(10000)}까지`);
  });

  it('횟수 한도를 낸다', () => {
    const result = conditionText({ rule_json: JSON.stringify({ caps: [{ window: 'month', count: 1 }] }) });
    expect(result).toBe('월 1회');
  });

  it('한 창에 금액과 횟수가 다 있으면 금액이 먼저다', () => {
    const result = conditionText({ rule_json: JSON.stringify({ caps: [{ window: 'month', amount: 10000, count: 1 }] }) });
    expect(result).toBe(`월 ${formatWon(10000)}까지 · 월 1회`);
  });

  it('caps에 month 금액이 있으면 monthly_cap은 안 말한다', () => {
    const result = conditionText({ monthly_cap: 5000, rule_json: JSON.stringify({ caps: [{ window: 'month', amount: 10000 }] }) });
    expect(result).not.toContain(formatWon(5000));
  });

  it('caps가 없으면 monthly_cap을 말한다', () => {
    const result = conditionText({ monthly_cap: 5000 });
    expect(result).toBe(`월 ${formatWon(5000)}까지`);
  });

  it('두 면제 표시를 낸다', () => {
    const result = conditionText({ threshold_exempt: 1, unified_cap_exempt: 1 });
    expect(result).toBe('실적 조건 없음 · 카드 통합 한도 밖');
  });

  it('깨진 rule_json에 안 던진다', () => {
    const result = conditionText({ min_amount: 50000, rule_json: '{{{' });
    expect(result).toBe(`건당 ${formatWon(50000)} 이상`);
    
    const result2 = conditionText({ min_amount: 50000, rule_json: null });
    expect(result2).toBe(`건당 ${formatWon(50000)} 이상`);
  });
});
