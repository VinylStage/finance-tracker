'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { estimateBilling, billingBasis } = require('../src/services/installmentBilling');

// #316 — 총 결제금액과 정책으로 월별 청구액을 계산한다.
//
// 계산 자체는 computeSchedule(#267 / ADR 0009 / #343)이 한다. 여기서 검증하는
// 것은 **그 스케줄을 입력 폼용 단일 값으로 요약할 때 무엇을 잃고 무엇을 밝히는가**
// 다. `installments` 는 monthly_amount / fee_per_month 를 한 값으로만 저장하는데
// 실제 스케줄은 회차마다 다르기 때문이다.

const FREE = { policy_type: '무이자', annual_rate: 0, free_from_sequence: 0 };
const PAID = { policy_type: '유이자', annual_rate: 19.9, free_from_sequence: 0 };
const PARTIAL = { policy_type: '부분무이자', annual_rate: 19.9, free_from_sequence: 4 };

const base = { totalAmount: 1200000, months: 6, startBillingMonth: '2026-08' };

describe('A. 무이자', () => {
  test('A-1. 원금만 균등하게 나눈다', () => {
    const e = estimateBilling({ ...base, policy: FREE });
    assert.strictEqual(e.rows.length, 6);
    assert.ok(e.rows.every((r) => r.interest === 0), '무이자인데 수수료가 붙었다');
    assert.strictEqual(e.monthly_amount, 200000);
    assert.strictEqual(e.fee_per_month, 0);
  });

  test('A-2. 나누어떨어지면 회차가 변하지 않는다고 알린다', () => {
    const e = estimateBilling({ ...base, policy: FREE });
    assert.strictEqual(e.varies.principal, false);
    assert.strictEqual(e.varies.interest, false);
  });

  test('A-3. 합계가 총액과 정확히 일치한다', () => {
    const e = estimateBilling({ ...base, policy: FREE });
    assert.strictEqual(e.totals.principal, 1200000);
    assert.strictEqual(e.totals.interest, 0);
    assert.strictEqual(e.totals.total, 1200000);
  });
});

describe('B. 유이자 — 잔액 기준 월할 (ADR 0009)', () => {
  test('B-1. 첫 회차 수수료가 총액 × 연이율 ÷ 12 다', () => {
    // ADR 0009 가 기각한 일할(× 일수 ÷ 365)이면 이 값이 달라진다.
    const e = estimateBilling({ ...base, policy: PAID });
    assert.strictEqual(e.fee_per_month, Math.floor(1200000 * 0.199 / 12));
    assert.strictEqual(e.fee_per_month, 19900);
  });

  test('B-2. 수수료가 회차마다 줄어든다 — 정액이 아니다', () => {
    const e = estimateBilling({ ...base, policy: PAID });
    const fees = e.rows.map((r) => r.interest);
    for (let i = 1; i < fees.length; i += 1) {
      assert.ok(fees[i] < fees[i - 1], `${i + 1}회차 수수료가 줄지 않았다: ${fees.join(', ')}`);
    }
    assert.strictEqual(e.varies.interest, true, '줄어드는데 varies 가 false 다');
  });

  test('B-3. 원금 합계는 총액 그대로다 — 수수료가 원금을 갉지 않는다', () => {
    const e = estimateBilling({ ...base, policy: PAID });
    assert.strictEqual(e.totals.principal, 1200000);
    assert.strictEqual(e.totals.total, 1200000 + e.totals.interest);
  });
});

describe('C. 부분무이자 — 뒤쪽 회차가 면제 (#267 수정 방향)', () => {
  test('C-1. free_from_sequence 회차부터 수수료가 0 이다', () => {
    // 앞쪽 면제로 뒤집히면 이 테스트가 잡는다. 실제로 그 방향으로 틀렸던 적이 있다.
    const e = estimateBilling({ ...base, policy: PARTIAL });
    const fees = e.rows.map((r) => r.interest);
    assert.ok(fees[0] > 0 && fees[1] > 0 && fees[2] > 0, `앞 3회차는 수수료가 붙어야 한다: ${fees.join(', ')}`);
    assert.deepStrictEqual(fees.slice(3), [0, 0, 0], '4회차부터 면제여야 한다');
  });

  test('C-2. 유이자보다 총 수수료가 적다', () => {
    const partial = estimateBilling({ ...base, policy: PARTIAL });
    const paid = estimateBilling({ ...base, policy: PAID });
    assert.ok(partial.totals.interest < paid.totals.interest);
  });
});

describe('D. 정책이 없을 때', () => {
  test('D-1. 원금만 나누고 수수료 0 으로 계산한다', () => {
    const e = estimateBilling({ ...base, policy: null });
    assert.strictEqual(e.totals.interest, 0);
    assert.strictEqual(e.totals.principal, 1200000);
  });

  test('D-2. 정책이 없다는 사실을 근거에 밝힌다', () => {
    // 조용히 0 으로 계산하고 넘어가면 실제 청구서에 수수료가 붙었을 때
    // 사용자는 앱이 틀렸다고 판단한다.
    const b = billingBasis(null, 'none');
    assert.strictEqual(b.policy_type, null);
    assert.strictEqual(b.source, 'none');
    assert.match(b.reason, /정책이 없어/);
    assert.match(b.reason, /다를 수 있어요/);
  });
});

describe('E. 끝수 — 단일 값 요약의 한계를 드러낸다', () => {
  // 10,000원 3개월 = 3,334 / 3,333 / 3,333 (#316 본문 사례)
  const odd = { totalAmount: 10000, months: 3, startBillingMonth: '2026-08', policy: FREE };

  test('E-1. 첫 회차가 크다 (#343)', () => {
    const e = estimateBilling(odd);
    assert.deepStrictEqual(e.rows.map((r) => r.principal), [3334, 3333, 3333]);
  });

  test('E-2. 대표값은 첫 회차 기준이다', () => {
    const e = estimateBilling(odd);
    assert.strictEqual(e.monthly_amount, 3334);
  });

  test('E-3. 회차가 균등하지 않다는 사실을 알린다', () => {
    // 대표값만 보여주고 넘어가면 사용자는 2회차 청구서를 보고 앱이 틀렸다고 본다.
    const e = estimateBilling(odd);
    assert.strictEqual(e.varies.principal, true);
  });

  test('E-4. 끝수가 있어도 합계는 총액 그대로다', () => {
    const e = estimateBilling(odd);
    assert.strictEqual(e.totals.principal, 10000);
  });

  test('E-5. 여러 조합에서 합계가 항상 일치', () => {
    for (const totalAmount of [1, 999, 100000, 1234567, 9999999]) {
      for (const months of [2, 3, 7, 12, 24, 36]) {
        const e = estimateBilling({ totalAmount, months, policy: PAID, startBillingMonth: '2026-08' });
        assert.strictEqual(e.totals.principal, totalAmount, `${totalAmount}원 ${months}개월`);
      }
    }
  });
});

describe('F. 계산 근거 문구', () => {
  test('F-1. 무이자', () => {
    assert.match(billingBasis(FREE, 'base').reason, /무이자/);
  });

  test('F-2. 부분무이자는 면제 시작 회차를 말한다', () => {
    const b = billingBasis(PARTIAL, 'base');
    assert.match(b.reason, /4회차부터/);
    assert.strictEqual(b.free_from_sequence, 4);
  });

  test('F-3. 부분무이자인데 시작 회차가 비면 그 사실을 밝힌다', () => {
    // 0 이면 isFreeMonth 가 전 회차 유이자로 처리한다. 조용히 넘어가면
    // 사용자는 부분무이자로 등록했는데 왜 전부 수수료가 붙는지 모른다.
    const b = billingBasis({ ...PARTIAL, free_from_sequence: 0 }, 'base');
    assert.match(b.reason, /비어 있어요/);
  });

  test('F-4. 유이자는 잔액 기준임을 말한다', () => {
    const b = billingBasis(PAID, 'base');
    assert.match(b.reason, /남은 금액/);
    assert.match(b.reason, /줄어/);
  });

  test('F-5. 어느 경로로 뽑힌 정책인지 남긴다', () => {
    // 화면이 "이 카드의 기본 정책" 과 "온라인쇼핑 전용 정책" 을 구분해 말해야 한다.
    assert.strictEqual(billingBasis(FREE, 'category').source, 'category');
    assert.strictEqual(billingBasis(FREE, 'base').source, 'base');
  });

  test('F-6. 내부 용어가 문구에 새지 않는다', () => {
    for (const p of [FREE, PAID, PARTIAL, null]) {
      const r = billingBasis(p, 'base').reason;
      for (const bad of ['policy_type', 'free_from_sequence', 'annual_rate', 'computeSchedule', 'null']) {
        assert.ok(!r.includes(bad), `내부 용어 노출: ${r}`);
      }
    }
  });
});
