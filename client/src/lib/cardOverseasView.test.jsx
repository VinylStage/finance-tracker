import { describe, it, expect } from 'vitest';
import { evidenceLabel, backfillSummary } from './cardOverseasView';

// 해외 표시 백필 문구(#710 · ADR 0008).
//
// ADR 0008 이 프리뷰에 요구하는 것은 「몇 건인가」 가 아니라 **「무엇이 왜
// 바뀌는가」** 다. 근거가 문구에서 빠지면 사용자는 건수만 보고 승인하게 되고,
// 그건 확인이 아니라 통보다. 그래서 여기서 보는 것은 **근거가 살아 있는가** 다.

describe('evidenceLabel', () => {
  it('A-1. 내부 값을 그대로 보여주지 않는다', () => {
    expect(evidenceLabel('currency')).not.toContain('currency');
    expect(evidenceLabel('country')).not.toContain('country');
    expect(evidenceLabel('currency')).toMatch(/[가-힣]/);
  });

  it('A-2. 두 근거가 서로 다른 말을 한다 — 뭉치면 구분이 사라진다', () => {
    expect(evidenceLabel('currency')).not.toBe(evidenceLabel('country'));
  });

  it('A-3. 모르는 값도 사람 말로 떨어진다', () => {
    expect(evidenceLabel('something-new')).toMatch(/[가-힣]/);
    expect(evidenceLabel(undefined)).toMatch(/[가-힣]/);
  });
});

describe('backfillSummary', () => {
  const base = (over = {}) => ({
    count: 3,
    amount: 52722,
    byEvidence: { currency: 1, country: 2 },
    samples: [
      { id: 1, merchant: 'ANTHROPIC,USD:5.50', amount: 8116, evidence: 'currency' },
      { id: 2, merchant: 'ANTHROPIC   SAN FRANCISCO USA', amount: 12106, evidence: 'country' },
      { id: 3, merchant: 'OPENAI      SAN FRANCISCO USA', amount: 32500, evidence: 'country' },
    ],
    ...over,
  });

  it('B-1. 채울 것이 없으면 아무 말도 하지 않는다 — 빈 상자를 그리지 않는다', () => {
    expect(backfillSummary(null)).toBe(null);
    expect(backfillSummary(undefined)).toBe(null);
    expect(backfillSummary({ count: 0, amount: 0, samples: [] })).toBe(null);
  });

  it('B-2. 건수와 금액을 한 줄로 적는다', () => {
    expect(backfillSummary(base()).headline).toBe('해외로 표시할 결제 3건 · 52,722원');
  });

  it('B-3. 근거를 나눠 센다 — 국가 표시 쪽이 오탐 여지가 커서 따로 봐야 한다', () => {
    const r = backfillSummary(base());
    expect(r.evidence).toContain('외화 표시 1건');
    expect(r.evidence).toContain('국가 표시 2건');
  });

  it('B-4. 근거가 한 종류뿐이어도 적는다 — 빠지면 확인이 아니다', () => {
    const r = backfillSummary(base({ byEvidence: { currency: 3 }, count: 3 }));
    expect(r.evidence).toContain('외화 표시 3건');
    expect(r.evidence).not.toContain('국가 표시');
  });

  it('B-5. 근거가 안 실려 와도 죽지 않고 무엇을 봤는지는 말한다', () => {
    const r = backfillSummary(base({ byEvidence: undefined }));
    expect(r.evidence).toMatch(/명세서/);
  });

  it('B-6. 「이름이 영문이라 해외」 로 읽히는 말을 쓰지 않는다', () => {
    // 판정 근거는 카드사가 남긴 표시다(ADR 0010). 문구가 «영문 가맹점» 을
    // 말하면 사용자는 규칙을 반대로 이해하고, 안 잡힌 건을 버그로 신고한다.
    const r = backfillSummary(base());
    expect(`${r.headline} ${r.evidence}`).not.toMatch(/영문|외국계|해외 서비스/);
  });

  it('B-7. 목록이 잘렸을 때만 «외 N건» 을 말한다', () => {
    expect(backfillSummary(base({ count: 18 })).more).toBe('외 15건');
    expect(backfillSummary(base()).more).toBe(null);
  });
});
