import { describe, it, expect } from 'vitest';
import {
  comparisonView, tierLine, thresholdLine, estimateReason, periodText,
} from './cardStrategyView';

const PERIOD = { start: '2026-07-01', end: '2026-07-31' };

const tier = (over = {}) => ({ min_spend: 0, rate: 1, label: '40만원 미만', ...over });

const th = (over = {}) => ({
  spend: 320000,
  period: PERIOD,
  tier: tier(),
  nextTier: null,
  toNextTier: 0,
  ...over,
});

describe('tierLine — 구간에 못 든 경우', () => {
  it('다음 구간이 있으면 얼마 남았는지 말한다', () => {
    const out = tierLine(th({ tier: null, nextTier: tier({ min_spend: 100000 }), toNextTier: 40000 }));
    expect(out.label).toBe('구간 미달');
    expect(out.tone).toBe('warn');
    expect(out.text).toBe('2026-07-01 ~ 2026-07-31에 320,000원 썼어요. 첫 구간까지 40,000원 남았어요.');
  });

  it('다음 구간이 없으면 남은 금액을 말하지 않는다', () => {
    const out = tierLine(th({ tier: null, nextTier: null, toNextTier: 40000 }));
    expect(out.label).toBe('구간 미달');
    expect(out.text).toBe('2026-07-01 ~ 2026-07-31에 320,000원 썼어요.');
  });
});

describe('tierLine — 구간에 든 경우', () => {
  it('가장 높은 구간이면 그렇다고 말한다', () => {
    const out = tierLine(th({ tier: tier({ label: '40만원 이상', rate: 2 }), nextTier: null }));
    expect(out.label).toBe('40만원 이상');
    expect(out.tone).toBe('ok');
    expect(out.text).toBe('2026-07-01 ~ 2026-07-31에 320,000원 써서 가장 높은 구간이에요. 적립 2%.');
  });

  it('다음 구간이 있으면 그 이름과 남은 금액을 말한다', () => {
    const out = tierLine(th({
      tier: tier(),
      nextTier: tier({ min_spend: 400000, rate: 2, label: '40만원 이상' }),
      toNextTier: 80000,
    }));
    expect(out.label).toBe('40만원 미만');
    expect(out.text).toBe('2026-07-01 ~ 2026-07-31에 320,000원 썼어요. 적립 1%. 40만원 이상 구간까지 80,000원 남았어요.');
  });

  it('구간 이름이 없으면 하한 금액으로 부른다', () => {
    const out = tierLine(th({
      tier: tier({ min_spend: 150000, label: null }),
      nextTier: tier({ min_spend: 400000, label: null }),
      toNextTier: 80000,
    }));
    expect(out.label).toBe('150,000원 이상');
    expect(out.text).toContain('400,000원 이상 구간까지');
  });

  it('요율이 비어 있으면 적립률을 아예 말하지 않는다', () => {
    const out = tierLine(th({ tier: tier({ rate: null }), nextTier: null }));
    expect(out.tone).toBe('neutral');
    expect(out.text).toBe('2026-07-01 ~ 2026-07-31에 320,000원 써서 가장 높은 구간이에요.');
  });

  it('요율이 0 이면 좋은 상태로 칠하지 않는다', () => {
    const out = tierLine(th({ tier: tier({ rate: 0 }), nextTier: null }));
    expect(out.tone).toBe('neutral');
    expect(out.text).toContain('적립 0%.');
  });

  it('기간이 없으면 전월이라고 부른다', () => {
    const out = tierLine(th({ period: null, nextTier: null }));
    expect(out.text).toBe('전월에 320,000원 써서 가장 높은 구간이에요. 적립 1%.');
  });
});

describe('thresholdLine', () => {
  it('실적 정보가 없으면 아무 줄도 만들지 않는다', () => {
    expect(thresholdLine(null)).toBe(null);
    expect(thresholdLine(undefined)).toBe(null);
  });

  it('구간이 등록돼 있으면 구간 문구로 넘긴다', () => {
    const out = thresholdLine(th({ tiers: [tier()], nextTier: null }));
    expect(out.label).toBe('40만원 미만');
    expect(out.text).toContain('가장 높은 구간이에요');
  });

  it('구간 배열이 비어 있으면 구간 문구로 넘기지 않는다', () => {
    const out = thresholdLine({ tiers: [], threshold: null, spend: 0, period: PERIOD });
    expect(out.label).toBe('실적 조건 없음');
  });
});

describe('estimateReason', () => {
  it('카드가 없으면 빈 문자열이다', () => {
    expect(estimateReason(null)).toBe('');
    expect(estimateReason(undefined)).toBe('');
  });

  it('실적 미달인데 붙을 혜택이 있으면 그것도 말한다', () => {
    const out = estimateReason({ thresholdUnmet: true, applied: { rate: 2 } });
    expect(out).toBe('적립률 2% 혜택이 있는데 전월 실적을 못 채웠어요.');
  });

  it('실적 미달이고 붙을 혜택도 없으면 그것만 말한다', () => {
    expect(estimateReason({ thresholdUnmet: true, applied: null })).toBe('전월 실적을 못 채웠어요.');
  });

  it('걸러진 이유가 하나도 없으면 해당 혜택이 없다고 말한다', () => {
    expect(estimateReason({ applied: null, skipped: [] })).toBe('해당하는 혜택이 없어요.');
    expect(estimateReason({ applied: null })).toBe('해당하는 혜택이 없어요.');
  });
});

describe('comparisonView — 응답에 칸이 빠졌을 때', () => {
  it('결제 목록 칸이 없으면 결제가 없는 것으로 친다', () => {
    const out = comparisonView({ data: { comparable: true, totalGap: 0 } });
    expect(out.state).toBe('no-transactions');
  });

  it('카드별 목록 칸이 없으면 카드 이름 없이 차액만 말한다', () => {
    const out = comparisonView({
      data: { comparable: true, totalGap: 5000, details: [{ id: 1 }] },
    });
    expect(out.headline).toBe('다른 카드였다면 5,000원 더 받았어요.');
    expect(out.byCard).toHaveLength(0);
  });
});

describe('periodText', () => {
  it('기간이 없으면 전월이다', () => {
    expect(periodText(null)).toBe('전월');
    expect(periodText(undefined)).toBe('전월');
  });
});

describe('tierLine — 요율 칸이 아예 없는 구간', () => {
  it('요율 칸이 없어도 적립률을 말하지 않는다', () => {
    // rate 키 자체를 뺀다. null 로 두면 판정을 지워도 결과가 같아 검사가 안 된다.
    const noRate = { min_spend: 0, label: '기본 구간' };
    const out = tierLine(th({ tier: noRate, nextTier: null }));
    expect(out.tone).toBe('neutral');
    expect(out.text).toBe('2026-07-01 ~ 2026-07-31에 320,000원 써서 가장 높은 구간이에요.');
  });

  it('다음 구간이 남아 있어도 요율이 없으면 좋은 상태로 칠하지 않는다', () => {
    const out = tierLine(th({
      tier: tier({ rate: null }),
      nextTier: tier({ min_spend: 400000, rate: 2, label: '40만원 이상' }),
      toNextTier: 80000,
    }));
    expect(out.tone).toBe('neutral');
    expect(out.text).toBe('2026-07-01 ~ 2026-07-31에 320,000원 썼어요. 40만원 이상 구간까지 80,000원 남았어요.');
  });
});
