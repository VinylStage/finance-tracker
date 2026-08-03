'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
  computeSchedule, scheduleTotals, addMonths, isFreeMonth,
} = require('../src/services/interest/installment');

const FREE = { policy_type: '무이자', annual_rate: 0, free_from_sequence: 0 };
const PAID = { policy_type: '유이자', annual_rate: 15.9, free_from_sequence: 0 };
// "6개월 부분무이자(4회차부터 면제)" — 카드사 안내 표기 그대로.
const PARTIAL = { policy_type: '부분무이자', annual_rate: 15.9, free_from_sequence: 4 };

describe('addMonths — 청구월 계산', () => {
  test('같은 해 안', () => assert.strictEqual(addMonths('2026-08', 3), '2026-11'));
  test('연말을 넘긴다', () => assert.strictEqual(addMonths('2026-11', 3), '2027-02'));
  test('0 은 그대로', () => assert.strictEqual(addMonths('2026-08', 0), '2026-08'));
  test('12개월은 정확히 1년', () => assert.strictEqual(addMonths('2026-08', 12), '2027-08'));
  test('두 자리 패딩', () => assert.strictEqual(addMonths('2026-01', 8), '2026-09'));
  test('12월 경계', () => assert.strictEqual(addMonths('2026-12', 1), '2027-01'));
});

describe('isFreeMonth — 면제 구간', () => {
  test('무이자는 전 회차 면제', () => {
    for (const s of [1, 6, 12]) assert.strictEqual(isFreeMonth(FREE, s), true);
  });
  test('유이자는 면제 없음', () => {
    for (const s of [1, 6, 12]) assert.strictEqual(isFreeMonth(PAID, s), false);
  });
  test('부분무이자는 면제 시작 회차부터 면제 — 앞이 아니라 뒤가 면제다', () => {
    // 방향이 뒤집혀 이자가 실제의 40% 만 잡혔던 결함의 회귀 테스트(#267 수정).
    // 앞 회차일수록 할부잔액이 커서 수수료도 크고, 그 비싼 구간이 고객 부담이다.
    assert.strictEqual(isFreeMonth(PARTIAL, 1), false);
    assert.strictEqual(isFreeMonth(PARTIAL, 3), false);
    assert.strictEqual(isFreeMonth(PARTIAL, 4), true);
    assert.strictEqual(isFreeMonth(PARTIAL, 12), true);
  });

  test('면제 시작 회차가 0 이면 면제가 없다', () => {
    const none = { policy_type: '부분무이자', annual_rate: 15.9, free_from_sequence: 0 };
    for (const s of [1, 6, 12]) assert.strictEqual(isFreeMonth(none, s), false);
  });
});

describe('입력 검증', () => {
  const base = { totalAmount: 120000, months: 12, policy: FREE, startBillingMonth: '2026-08' };
  test('months 2 미만 거부', () => {
    assert.throws(() => computeSchedule({ ...base, months: 1 }));
    assert.doesNotThrow(() => computeSchedule({ ...base, months: 2 }));
  });
  test('금액이 정수가 아니면 거부', () => {
    assert.throws(() => computeSchedule({ ...base, totalAmount: 1000.5 }));
    assert.throws(() => computeSchedule({ ...base, totalAmount: 0 }));
    assert.throws(() => computeSchedule({ ...base, totalAmount: -1000 }));
  });
  test('정책이 없으면 거부', () => {
    assert.throws(() => computeSchedule({ ...base, policy: null }));
  });
});

describe('무이자', () => {
  const s = computeSchedule({ totalAmount: 1200000, months: 12, policy: FREE, startBillingMonth: '2026-08' });

  test('회차 수가 개월수와 같다', () => assert.strictEqual(s.length, 12));
  test('이자가 전부 0', () => assert.ok(s.every((r) => r.interest === 0)));
  test('원금 합계가 총액과 정확히 일치', () => {
    assert.strictEqual(scheduleTotals(s).principal, 1200000);
  });
  test('마지막 잔액이 0', () => assert.strictEqual(s[s.length - 1].remaining_principal, 0));
  test('청구월이 순차로 증가', () => {
    assert.strictEqual(s[0].billing_month, '2026-08');
    assert.strictEqual(s[11].billing_month, '2027-07');
  });
});

describe('유이자 — 잔액 기준', () => {
  const s = computeSchedule({ totalAmount: 1200000, months: 12, policy: PAID, startBillingMonth: '2026-08' });

  test('원금 합계가 총액과 정확히 일치', () => {
    assert.strictEqual(scheduleTotals(s).principal, 1200000);
  });

  test('이자가 회차마다 줄어든다 — 잔액 기준이라는 뜻', () => {
    for (let i = 1; i < s.length; i += 1) {
      assert.ok(s[i].interest < s[i - 1].interest,
        `${i + 1}회차 이자(${s[i].interest})가 이전(${s[i - 1].interest})보다 작아야 한다`);
    }
  });

  test('첫 회차 이자 = 총액 × 월이자율', () => {
    assert.strictEqual(s[0].interest, Math.floor(1200000 * (15.9 / 12 / 100)));
  });

  test('총액 기준이 아니다 — 모든 이자가 같으면 실패', () => {
    const allSame = s.every((r) => r.interest === s[0].interest);
    assert.strictEqual(allSame, false);
  });

  test('이자 합계가 0보다 크다', () => assert.ok(scheduleTotals(s).interest > 0));
});

describe('부분무이자', () => {
  const s = computeSchedule({ totalAmount: 1200000, months: 12, policy: PARTIAL, startBillingMonth: '2026-08' });

  test('앞 3회차는 고객 부담이라 이자가 붙는다', () => {
    for (let i = 0; i < 3; i += 1) assert.ok(s[i].interest > 0, `${i + 1}회차`);
  });
  test('4회차부터 면제', () => {
    for (let i = 3; i < 12; i += 1) assert.strictEqual(s[i].interest, 0, `${i + 1}회차`);
  });
  test('원금 합계가 총액과 정확히 일치', () => {
    assert.strictEqual(scheduleTotals(s).principal, 1200000);
  });
  test('유이자보다 총 이자가 적다', () => {
    const paid = computeSchedule({ totalAmount: 1200000, months: 12, policy: PAID, startBillingMonth: '2026-08' });
    assert.ok(scheduleTotals(s).interest < scheduleTotals(paid).interest);
  });

  test('면제 시작 회차 0 이면 유이자와 같다', () => {
    const z = computeSchedule({
      totalAmount: 1200000, months: 12, startBillingMonth: '2026-08',
      policy: { policy_type: '부분무이자', annual_rate: 15.9, free_from_sequence: 0 },
    });
    const paid = computeSchedule({ totalAmount: 1200000, months: 12, policy: PAID, startBillingMonth: '2026-08' });
    assert.strictEqual(scheduleTotals(z).interest, scheduleTotals(paid).interest);
  });

  test('면제 시작 회차가 마지막이면 마지막 회차만 면제', () => {
    const n = computeSchedule({
      totalAmount: 1200000, months: 12, startBillingMonth: '2026-08',
      policy: { policy_type: '부분무이자', annual_rate: 15.9, free_from_sequence: 12 },
    });
    assert.ok(n.slice(0, 11).every((r) => r.interest > 0));
    assert.strictEqual(n[11].interest, 0);
  });

  test('KB 안내 예시를 그대로 재현한다 — 6개월(4회차부터 면제)', () => {
    // 600,000원 연 15.9%. 잔액 기준 월할이라 1회차가 가장 비싸다.
    const s = computeSchedule({
      totalAmount: 600000, months: 6, startBillingMonth: '2026-09',
      policy: { policy_type: '부분무이자', annual_rate: 15.9, free_from_sequence: 4 },
    });
    assert.deepStrictEqual(s.map((r) => r.interest), [7950, 6625, 5300, 0, 0, 0]);
    assert.strictEqual(scheduleTotals(s).interest, 19875);
  });
});

describe('끝수 처리', () => {
  test('나누어떨어지지 않아도 원금 합계가 정확하다', () => {
    // 1,000,000 / 7 = 142857.14...
    const s = computeSchedule({ totalAmount: 1000000, months: 7, policy: FREE, startBillingMonth: '2026-08' });
    assert.strictEqual(scheduleTotals(s).principal, 1000000);
    assert.strictEqual(s[s.length - 1].remaining_principal, 0);
  });

  test('끝수는 첫 회차에 얹는다', () => {
    // 카드사 공시: "월납입액 = 할부 이용대금 / 할부기간(월단위)
    // (단, 1원 미만의 금액은 첫 회의 월납입액에 포함)" — 표준약관 기반(#316).
    // 처음에는 마지막 회차에 몰아줬는데 실제 관행과 반대였다.
    const s = computeSchedule({ totalAmount: 1000000, months: 7, policy: FREE, startBillingMonth: '2026-08' });
    const base = Math.floor(1000000 / 7);
    const remainder = 1000000 - base * 7;

    assert.ok(remainder > 0, '끝수가 없는 조합이면 이 테스트가 아무것도 검증하지 못한다');
    assert.strictEqual(s[0].principal, base + remainder, '첫 회차가 끝수를 안 받았다');
    assert.ok(s.slice(1).every((r) => r.principal === base), '나머지 회차는 균등해야 한다');
  });

  test('끝수가 0이면 전 회차가 균등하다', () => {
    // 나누어떨어지는 경우까지 첫 회차만 튀면 안 된다.
    const s = computeSchedule({ totalAmount: 133713, months: 3, policy: FREE, startBillingMonth: '2026-08' });
    assert.deepStrictEqual(s.map((r) => r.principal), [44571, 44571, 44571]);
  });

  test('실거래 사례 — 끝수가 첫 회차로 간다', () => {
    // 실사용 DB 의 할부 2건. 끝수가 1원·3원이라 방향이 틀려도 합계 검사로는
    // 안 걸린다. 회차별로 못 박아 둔다.
    const y = computeSchedule({ totalAmount: 232897, months: 6, policy: FREE, startBillingMonth: '2026-08' });
    assert.deepStrictEqual(y.map((r) => r.principal), [38817, 38816, 38816, 38816, 38816, 38816]);

    const k = computeSchedule({ totalAmount: 283823, months: 5, policy: FREE, startBillingMonth: '2026-07' });
    assert.deepStrictEqual(k.map((r) => r.principal), [56767, 56764, 56764, 56764, 56764]);
  });

  test('여러 금액·개월수 조합에서 합계가 항상 일치', () => {
    for (const amount of [1, 999, 100000, 1234567, 9999999]) {
      for (const months of [2, 3, 7, 12, 24, 36]) {
        const s = computeSchedule({ totalAmount: amount, months, policy: PAID, startBillingMonth: '2026-08' });
        assert.strictEqual(scheduleTotals(s).principal, amount, `${amount}원 ${months}개월`);
        assert.strictEqual(s[s.length - 1].remaining_principal, 0, `${amount}원 ${months}개월 잔액`);
      }
    }
  });
});

describe('조기 완납 (#269 확정 요건)', () => {
  const args = { totalAmount: 1200000, months: 12, policy: PAID, startBillingMonth: '2026-08' };

  test('완납월까지만 회차가 생긴다', () => {
    const s = computeSchedule({ ...args, paidOffOn: '2026-10-15' });
    assert.strictEqual(s.length, 3);
    assert.strictEqual(s[2].billing_month, '2026-10');
  });

  test('완납 회차가 잔여 원금 전액을 싣는다', () => {
    const s = computeSchedule({ ...args, paidOffOn: '2026-10-15' });
    assert.strictEqual(scheduleTotals(s).principal, 1200000);
    assert.strictEqual(s[2].remaining_principal, 0);
  });

  test('완납하면 총 이자가 정상 진행보다 작다', () => {
    const full = computeSchedule(args);
    const early = computeSchedule({ ...args, paidOffOn: '2026-10-15' });
    assert.ok(scheduleTotals(early).interest < scheduleTotals(full).interest,
      '완납 이자가 더 작아야 한다 — 자르기만 하면 이 단언이 통과하지 않는다');
  });

  test('완납 이후 회차의 이자는 아예 발생하지 않는다', () => {
    const early = computeSchedule({ ...args, paidOffOn: '2026-10-15' });
    assert.ok(early.every((r) => r.billing_month <= '2026-10'));
  });

  test('첫 회차 완납', () => {
    const s = computeSchedule({ ...args, paidOffOn: '2026-08-20' });
    assert.strictEqual(s.length, 1);
    assert.strictEqual(s[0].principal, 1200000);
    assert.strictEqual(s[0].remaining_principal, 0);
  });

  test('완납일이 시작 전이면 회차가 없다', () => {
    const s = computeSchedule({ ...args, paidOffOn: '2026-07-01' });
    assert.strictEqual(s.length, 0);
  });

  test('완납일이 종료 후면 정상 진행과 같다', () => {
    const full = computeSchedule(args);
    const late = computeSchedule({ ...args, paidOffOn: '2099-01-01' });
    assert.deepStrictEqual(late, full);
  });

  test('무이자 완납은 이자가 계속 0', () => {
    const s = computeSchedule({ ...args, policy: FREE, paidOffOn: '2026-10-15' });
    assert.ok(s.every((r) => r.interest === 0));
    assert.strictEqual(scheduleTotals(s).principal, 1200000);
  });
});

describe('계산 기준 — 카드사 공시값 대조 (#284 확정)', () => {
  // 비씨카드 상품공시실이 "100원당 수수료 1.66원" 을 연 19.90% 기준으로 적고,
  // "100원당 할부 수수료는 1회차에 부담하셔야 할 예상 금액입니다" 라고 단다.
  // 1회차 잔액은 언제나 전액이므로 이 값이 곧 월이자율 검증이 된다.
  //
  // 이 테스트가 깨지면 계산 기준이 월할에서 벗어난 것이다 — 근거는
  // services/interest/installment.js 머리주석에 있다.
  test('연 19.90% 의 1회차 수수료가 공시값(100원당 1.66원)과 맞는다', () => {
    const s = computeSchedule({
      totalAmount: 100000, months: 12, startBillingMonth: '2026-09',
      policy: { policy_type: '유이자', annual_rate: 19.9, free_from_sequence: 0 },
    });
    // 100,000원은 100원의 1,000배 → 1.66 × 1000 = 1,660원
    assert.strictEqual(s[0].interest, 1658); // floor(100000 × 0.199 / 12) = 1658
    assert.strictEqual(Math.round((s[0].interest / 1000) * 100) / 100, 1.66);
  });

  test('일할이었다면 나오지 않는 값이다', () => {
    // 30일 기준 일할이면 100원당 1.64원(= 1,635원), 31일이면 1.69원(= 1,690원).
    // 어느 쪽도 공시값 1.66 이 아니다.
    const daily30 = Math.floor(100000 * 0.199 * 30 / 365);
    const daily31 = Math.floor(100000 * 0.199 * 31 / 365);
    assert.notStrictEqual(daily30, 1658);
    assert.notStrictEqual(daily31, 1658);
  });

  test('이자는 잔액 기준이다 — 협회 공식의 할부잔액', () => {
    // 할부잔액 = 이용원금 − 기결제원금. 회차마다 원금만큼 줄어든다.
    const s = computeSchedule({
      totalAmount: 1200000, months: 12, startBillingMonth: '2026-09',
      policy: { policy_type: '유이자', annual_rate: 12, free_from_sequence: 0 },
    });
    assert.strictEqual(s[0].interest, Math.floor(1200000 * 0.12 / 12));
    assert.strictEqual(s[1].interest, Math.floor(1100000 * 0.12 / 12));
    assert.strictEqual(s[11].interest, Math.floor(100000 * 0.12 / 12));
  });
});
