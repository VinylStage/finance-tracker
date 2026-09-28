import { describe, it, expect } from 'vitest';
import { benefitTargetLabel, benefitValueLabel, tierStatusLine, unmatchedSummary } from './cardDetailView';

describe('benefitTargetLabel', () => {
  it('A-1. 분류만 주어진 경우', () => {
    const result = benefitTargetLabel({ categoryName: '교통', merchantPattern: null });
    expect(result).toBe('교통');
  });

  it('A-2. 가맹점만 주어진 경우', () => {
    const result = benefitTargetLabel({ categoryName: null, merchantPattern: 'GS25' });
    expect(result).toMatch(/GS25/);
  });

  it('A-3. 둘 다 주어진 경우', () => {
    const result = benefitTargetLabel({ categoryName: '마트/편의점', merchantPattern: 'GS25' });
    expect(result).toMatch(/마트\/편의점/);
    expect(result).toMatch(/GS25/);
  });

  it('A-4. 둘 다 없을 경우', () => {
    const result = benefitTargetLabel({ categoryName: null, merchantPattern: null });
    expect(result).toBe('전 가맹점');
  });

  it('A-5. null 입력', () => {
    const result = benefitTargetLabel(null);
    expect(result).toBe('');
  });
});

describe('benefitValueLabel', () => {
  it('B-1. 할인, 요율 있음, 월 한도 없음', () => {
    const result = benefitValueLabel({ benefitType: '할인', rate: 1, monthlyCap: null });
    expect(result).toMatch(/1/);
    expect(result).toMatch(/할인/);
    expect(result).not.toMatch(/월/);
  });

  it('B-2. 적립, 요율 있음, 월 한도 있음', () => {
    const result = benefitValueLabel({ benefitType: '적립', rate: 2, monthlyCap: 100000 });
    expect(result).toMatch(/2/);
    expect(result).toMatch(/적립/);
    expect(result).toMatch(/100,000/);
  });

  it('B-3. 할인, 요율 없음, 월 한도 없음', () => {
    const result = benefitValueLabel({ benefitType: '할인', rate: null, monthlyCap: null });
    expect(result).toMatch(/할인/);
    expect(result).not.toMatch(/%/);
  });

  it('B-4. 적립, 요율 있음, 월 한도 있음 (소수)', () => {
    const result = benefitValueLabel({ benefitType: '적립', rate: 0.5, monthlyCap: 5000 });
    expect(result).toMatch(/0.5/);
    expect(result).toMatch(/5,000/);
  });

  it('B-5. null 입력', () => {
    const result = benefitValueLabel(null);
    expect(result).toBe('');
  });
});

describe('tierStatusLine', () => {
  describe('구간이 없는 카드', () => {
    it('C-1. 실적 조건을 채운 경우', () => {
      const result = tierStatusLine({ tiers: [], met: true });
      expect(result.headline).toMatch(/채웠/);
      expect(result.detail).toBeNull();
    });

    it('C-2. 실적이 모자랄 경우', () => {
      const result = tierStatusLine({ tiers: [], met: false });
      expect(result.headline).toMatch(/모자/);
      expect(result.detail).toBeNull();
    });

    it('C-3. null 입력', () => {
      const result = tierStatusLine(null);
      expect(result.headline).toBe('');
      expect(result.detail).toBeNull();
    });
  });

  describe('구간이 있는 카드', () => {
    const tiers = [
      { id: 1, min_spend: 0, rate: 1, label: '40만원 미만' },
      { id: 2, min_spend: 400000, rate: 2, label: '40만원 이상' }
    ];

    it('D-1. 첫 번째 구간에 해당하는 경우', () => {
      const result = tierStatusLine({
        tiers,
        met: true,
        tier: { id: 1, min_spend: 0, rate: 1, label: '40만원 미만' },
        toNextTier: 220403
      });
      expect(result.headline).toMatch(/40만원 미만/);
      expect(result.headline).toMatch(/1%/);
      expect(result.detail).toMatch(/220,403/);
    });

    it('D-2. 첫 번째 구간에 해당하는 경우 - detail 확인', () => {
      const result = tierStatusLine({
        tiers,
        met: true,
        tier: { id: 1, min_spend: 0, rate: 1, label: '40만원 미만' },
        toNextTier: 220403
      });
      expect(result.detail).toMatch(/220,403/);
    });

    it('D-3. 두 번째 구간에 해당하는 경우 - 마지막 구간', () => {
      const result = tierStatusLine({
        tiers,
        met: true,
        tier: { id: 2, min_spend: 400000, rate: 2, label: '40만원 이상' },
        toNextTier: 0
      });
      expect(result.detail).toMatch(/가장 높은/);
    });

    it('D-4. 구간에 해당하지 않는 경우', () => {
      const result = tierStatusLine({
        tiers,
        met: false,
        tier: null,
        nextTier: { id: 2, min_spend: 400000, rate: 2, label: '40만원 이상' },
        toNextTier: 300000
      });
      expect(result.headline).toMatch(/혜택이 붙지/);
      expect(result.detail).toMatch(/300,000/);
    });

    it('D-5. 다음 구간이 없는 경우', () => {
      const result = tierStatusLine({
        tiers,
        met: false,
        tier: null,
        nextTier: null
      });
      expect(result.detail).toBeNull();
    });
  });

  describe('요율이 비어 있는 구간', () => {
    const tiers = [
      { id: 5, min_spend: 100000, rate: null, label: '10만원 이상' }
    ];

    it('E-1. 구간 이름 포함', () => {
      const result = tierStatusLine({
        tiers,
        met: true,
        tier: { id: 5, min_spend: 100000, rate: null, label: '10만원 이상' },
        toNextTier: 0
      });
      expect(result.headline).toMatch(/10만원 이상/);
    });

    it('E-2. 요율이 비어 있음을 표시', () => {
      const result = tierStatusLine({
        tiers,
        met: true,
        tier: { id: 5, min_spend: 100000, rate: null, label: '10만원 이상' },
        toNextTier: 0
      });
      expect(result.headline).toMatch(/혜택마다/);
    });

    it('E-3. 요율 표시 안 함', () => {
      const result = tierStatusLine({
        tiers,
        met: true,
        tier: { id: 5, min_spend: 100000, rate: null, label: '10만원 이상' },
        toNextTier: 0
      });
      expect(result.headline).not.toMatch(/%/);
    });
  });
});

describe('unmatchedSummary', () => {
  const base = (over = {}) => ({
    merchants: [{ merchant: '씨유◯◯점', count: 3, amount: 27190 }],
    distinctCount: 1,
    count: 3,
    amount: 27190,
    ...over,
  });

  it('D-1. 없으면 아무 말도 하지 않는다 — 빈 상자를 그리지 않는다', () => {
    expect(unmatchedSummary(null)).toBe(null);
    expect(unmatchedSummary(undefined)).toBe(null);
    expect(unmatchedSummary({ merchants: [], distinctCount: 0, count: 0, amount: 0 })).toBe(null);
  });

  it('D-2. 곳 수·건수·금액을 한 줄로 적는다', () => {
    const r = unmatchedSummary(base());
    expect(r.headline).toBe('혜택이 붙지 않은 가맹점 1곳 · 3건 27,190원');
  });

  it('D-3. «혜택이 없다» 고 단정하지 않는다 — 표기가 갈려 못 찾았을 수 있다', () => {
    const r = unmatchedSummary(base());
    // 이 문구가 사라지면 화면이 다시 «없다» 고 단정하게 된다. #688 의 사고가
    // 정확히 그것이었다 — 있는 혜택을 없다고 말했다.
    expect(r.detail).toMatch(/표기가 달라|이름과 영수증 표기/);
    expect(r.detail).not.toMatch(/혜택이 없습니다|혜택이 없어요/);
  });

  it('D-4. 목록이 잘렸을 때만 «외 N곳» 을 말한다', () => {
    expect(unmatchedSummary(base({ distinctCount: 19 })).more).toBe('외 18곳');
  });

  it('D-5. 안 잘렸으면 «외 N곳» 을 말하지 않는다', () => {
    expect(unmatchedSummary(base()).more).toBe(null);
  });
});
