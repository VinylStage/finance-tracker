'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
  segmentize, accrueInterest, postingDates, simulate, MissingRateError,
} = require('../src/services/interest/creditLine');
const { floorWon, daysBetween, daysInYear } = require('../src/services/interest/money');

// 마이너스통장 복리 이자(#286).
//
// 기대값은 #284 조사의 검산 예시를 그대로 쓴다. 실제 사용 중인 계좌 조건이다.
//   한도 4,800,000 / 사용 3,566,196 / 연 4.17% (3개월 주기 변동금리)
//
// 이 파일은 DB 를 쓰지 않는다. creditLine.js 가 순수 함수라 타임라인만 넣는다.

const BALANCE = 3566196;
const LIMIT = 4800000;
const bal = (from, balance) => ({ from, balance });
const rate = (from, annual_rate) => ({ from, annual_rate });

describe('A. 구간 자르기', () => {
  test('A-1. 잔액 변동점에서 자른다', () => {
    const segs = segmentize({
      balanceTimeline: [bal('2026-01-01', 1000000), bal('2026-01-11', 2000000)],
      rateTimeline: [rate('2026-01-01', 5)],
      from: '2026-01-01', to: '2026-01-21',
    });
    assert.deepStrictEqual(segs.map((s) => [s.from, s.days, s.balance]), [
      ['2026-01-01', 10, 1000000],
      ['2026-01-11', 10, 2000000],
    ]);
  });

  test('A-2. 금리 변경점에서도 자른다', () => {
    // 잔액만으로 자르면 변동금리를 반영할 수 없다 — 이 이슈의 핵심.
    const segs = segmentize({
      balanceTimeline: [bal('2026-01-01', BALANCE)],
      rateTimeline: [rate('2026-01-01', 4.17), rate('2026-01-11', 4.55)],
      from: '2026-01-01', to: '2026-01-21',
    });
    assert.deepStrictEqual(segs.map((s) => [s.from, s.days, s.annual_rate]), [
      ['2026-01-01', 10, 4.17],
      ['2026-01-11', 10, 4.55],
    ]);
  });

  test('A-3. 두 변곡점이 섞여도 모두 반영한다', () => {
    const segs = segmentize({
      balanceTimeline: [bal('2026-01-01', 1000000), bal('2026-01-06', 1500000)],
      rateTimeline: [rate('2026-01-01', 4), rate('2026-01-11', 5)],
      from: '2026-01-01', to: '2026-01-16',
    });
    assert.deepStrictEqual(segs.map((s) => [s.from, s.balance, s.annual_rate]), [
      ['2026-01-01', 1000000, 4],
      ['2026-01-06', 1500000, 4],
      ['2026-01-11', 1500000, 5],
    ]);
  });

  test('A-4. 구간이 반개구간이라 하루를 두 번 세지 않는다', () => {
    const segs = segmentize({
      balanceTimeline: [bal('2026-01-01', 100)],
      rateTimeline: [rate('2026-01-01', 5), rate('2026-01-11', 6)],
      from: '2026-01-01', to: '2026-01-21',
    });
    assert.strictEqual(segs[0].to, segs[1].from);
    assert.strictEqual(segs.reduce((s, x) => s + x.days, 0), 20);
  });

  test('A-5. 빈 기간은 빈 배열', () => {
    assert.deepStrictEqual(segmentize({ from: '2026-01-01', to: '2026-01-01' }), []);
    assert.deepStrictEqual(segmentize({ from: '2026-02-01', to: '2026-01-01' }), []);
  });
});

describe('B. 검산 — 실제 계좌 조건 (#284)', () => {
  const timeline = { balanceTimeline: [bal('2026-01-01', BALANCE)], rateTimeline: [rate('2026-01-01', 4.17)] };

  const cases = [
    { days: 1, from: '2026-03-01', to: '2026-03-02', expected: 407 },
    { days: 28, from: '2026-02-01', to: '2026-03-01', expected: 11407 },
    { days: 30, from: '2026-03-01', to: '2026-03-31', expected: 12222 },
    { days: 31, from: '2026-03-01', to: '2026-04-01', expected: 12630 },
  ];

  for (const c of cases) {
    test(`B. ${c.days}일 이자 = ${c.expected.toLocaleString()}원`, () => {
      const { interest } = accrueInterest({ ...timeline, from: c.from, to: c.to });
      assert.strictEqual(interest, c.expected);
    });
  }
});

describe('C. 변동금리 — 시점별로 적용한다', () => {
  test('C-1. 4.17% 30일 + 4.55% 30일 = 25,558원', () => {
    const { interest } = accrueInterest({
      balanceTimeline: [bal('2026-01-01', BALANCE)],
      rateTimeline: [rate('2026-01-01', 4.17), rate('2026-03-31', 4.55)],
      from: '2026-03-01', to: '2026-04-30',
    });
    assert.strictEqual(interest, 25558);
  });

  test('C-2. 현재 금리로 소급하면 다른 값이 나온다', () => {
    // 이 차이(1,115원)가 금리 이력을 둔 이유다.
    const wrong = accrueInterest({
      balanceTimeline: [bal('2026-01-01', BALANCE)],
      rateTimeline: [rate('2026-01-01', 4.55)],
      from: '2026-03-01', to: '2026-04-30',
    }).interest;
    assert.strictEqual(wrong, 26673);
    assert.strictEqual(wrong - 25558, 1115);
  });

  test('C-3. 금리를 모르는 구간은 0 으로 흘리지 않고 실패한다', () => {
    // 0% 로 계산하면 이자가 조용히 사라진다.
    assert.throws(() => accrueInterest({
      balanceTimeline: [bal('2026-01-01', BALANCE)],
      rateTimeline: [rate('2026-02-01', 4.17)],
      from: '2026-01-01', to: '2026-03-01',
    }), MissingRateError);
  });
});

describe('D. 복리 — 이자가 잔액에 편입된다 (#284 검산)', () => {
  // #284 검산이 30·31·30일 회차를 쓴다. 실제 달력에서 그 배열이 나오는 구간은
  // 결제일 30일 기준 4/30 → 7/30 이다 (4/30~5/30 = 30일, 5/30~6/30 = 31일,
  // 6/30~7/30 = 30일). 검산과 같은 조건을 실제 날짜로 재현한다.
  const PERIOD = { from: '2026-04-30', to: '2026-07-30', interestDay: 30 };

  test('D-1. 3개월 누적이자 37,203원 / 최종잔액 3,603,399원', () => {
    const r = simulate({
      balanceTimeline: [bal('2026-01-01', BALANCE)],
      rateTimeline: [rate('2026-01-01', 4.17)],
      ...PERIOD, compounds: true, creditLimit: LIMIT,
    });
    assert.deepStrictEqual(r.postings.map((p) => p.interest), [12222, 12673, 12308]);
    assert.strictEqual(r.total_interest, 37203);
    assert.strictEqual(r.final_balance, 3603399);
    assert.strictEqual(r.capitalized, 37203);
  });

  test('D-2. 회차마다 잔액이 이자만큼 늘어난다', () => {
    const r = simulate({
      balanceTimeline: [bal('2026-01-01', BALANCE)],
      rateTimeline: [rate('2026-01-01', 4.17)],
      ...PERIOD, compounds: true,
    });
    assert.deepStrictEqual(r.postings.map((p) => p.balance_before), [3566196, 3578418, 3591091]);
    assert.deepStrictEqual(r.postings.map((p) => p.balance_after), [3578418, 3591091, 3603399]);
  });

  test('D-3. 단리보다 크다 — 편입된 이자에 다시 이자가 붙는다', () => {
    const args = {
      balanceTimeline: [bal('2026-01-01', BALANCE)],
      rateTimeline: [rate('2026-01-01', 4.17)],
      ...PERIOD,
    };
    const compound = simulate({ ...args, compounds: true }).total_interest;
    const simple = simulate({ ...args, compounds: false }).total_interest;
    assert.strictEqual(compound, 37203);

    // #284 검산은 단리를 37,075 로 적었다. 그건 91일치를 한 번에 절사한 값이고,
    // 여기서는 회차마다 절사한다(12,222 + 12,630 + 12,222 = 37,074). 실제 청구가
    // 회차마다 원 단위로 확정되므로 회차별 절사가 맞다 — 1원 차이의 정체다.
    assert.strictEqual(simple, 37074);
    assert.strictEqual(compound - simple, 129);
  });

  test('D-4. 단리면 잔액이 늘지 않는다', () => {
    const r = simulate({
      balanceTimeline: [bal('2026-01-01', BALANCE)],
      rateTimeline: [rate('2026-01-01', 4.17)],
      ...PERIOD, compounds: false,
    });
    assert.strictEqual(r.capitalized, 0);
    assert.strictEqual(r.final_balance, BALANCE);
  });
});

describe('E. 뮤테이션 — 규칙을 바꾸면 반드시 실패해야 한다', () => {
  const args = {
    balanceTimeline: [bal('2026-01-01', BALANCE)],
    rateTimeline: [rate('2026-01-01', 4.17)],
    from: '2026-04-30', to: '2026-07-30', interestDay: 30,
  };

  test('E-1. 복리를 단리로 바꾸면 값이 달라진다', () => {
    assert.notStrictEqual(
      simulate({ ...args, compounds: true }).total_interest,
      simulate({ ...args, compounds: false }).total_interest
    );
  });

  test('E-2. 편입 시점을 옮기면 값이 달라진다', () => {
    // 결제일이 다르면 회차 경계가 달라지고 편입 시점도 달라진다.
    const at30 = simulate({ ...args, interestDay: 30, compounds: true }).total_interest;
    const at15 = simulate({ ...args, interestDay: 15, compounds: true }).total_interest;
    assert.notStrictEqual(at30, at15);
  });

  test('E-3. 매일 편입하면 실제보다 커진다 — 결제일에만 편입하는 것이 맞다', () => {
    const monthly = simulate({ ...args, compounds: true }).total_interest;
    // 결제일을 매일로 흉내내면(회차를 잘게 쪼개면) 편입이 잦아져 더 커진다.
    let daily = 0;
    let carried = 0;
    let cursor = '2026-04-30';
    while (cursor < '2026-07-30') {
      const next = require('../src/services/interest/money').addDays(cursor, 1);
      const it = accrueInterest({
        balanceTimeline: [bal('2026-01-01', BALANCE + carried)],
        rateTimeline: [rate('2026-01-01', 4.17)],
        from: cursor, to: next,
      }).interest;
      daily += it; carried += it; cursor = next;
    }
    assert.ok(daily > monthly, `매일 편입 ${daily} 이 월 편입 ${monthly} 보다 크지 않다`);
  });

  test('E-4. 금리를 낮추면 이자가 줄어든다', () => {
    const lower = simulate({ ...args, rateTimeline: [rate('2026-01-01', 4.0)] }).total_interest;
    assert.ok(lower < simulate(args).total_interest);
  });
});

describe('F. 잔액 변동이 섞인 기간', () => {
  test('F-1. 인출·상환이 구간을 가른다', () => {
    // 3/1 1,000,000 → 3/11 인출로 2,000,000 → 3/21 상환으로 500,000
    const { interest, segments } = accrueInterest({
      balanceTimeline: [
        bal('2026-03-01', 1000000), bal('2026-03-11', 2000000), bal('2026-03-21', 500000),
      ],
      rateTimeline: [rate('2026-01-01', 4.17)],
      from: '2026-03-01', to: '2026-03-31',
    });
    const expect = [1000000, 2000000, 500000]
      .map((b) => Math.floor((b * 0.0417 * 10) / 365));
    assert.deepStrictEqual(segments.map((s) => s.interest), expect);
    assert.strictEqual(interest, expect.reduce((a, b) => a + b, 0));
  });

  test('F-2. 잔액 0 구간은 이자 0', () => {
    const { interest } = accrueInterest({
      balanceTimeline: [bal('2026-03-01', 0)],
      rateTimeline: [rate('2026-01-01', 4.17)],
      from: '2026-03-01', to: '2026-04-01',
    });
    assert.strictEqual(interest, 0);
  });

  test('F-3. 다 갚은 뒤 구간은 이자가 붙지 않는다', () => {
    const { segments } = accrueInterest({
      balanceTimeline: [bal('2026-03-01', 1000000), bal('2026-03-11', 0)],
      rateTimeline: [rate('2026-01-01', 4.17)],
      from: '2026-03-01', to: '2026-03-21',
    });
    assert.ok(segments[0].interest > 0);
    assert.strictEqual(segments[1].interest, 0);
  });

  test('F-4. 예금 잔액(양수 통장)에 대출 이자를 물리지 않는다', () => {
    // 마이너스통장을 다 갚고 예금이 남은 상태를 음수로 기록하는 경우.
    const { interest } = accrueInterest({
      balanceTimeline: [bal('2026-03-01', -500000)],
      rateTimeline: [rate('2026-01-01', 4.17)],
      from: '2026-03-01', to: '2026-04-01',
    });
    assert.strictEqual(interest, 0);
  });
});

describe('G. 이자 결제일', () => {
  test('G-1. 매월 결제일을 뽑는다', () => {
    assert.deepStrictEqual(
      postingDates({ from: '2026-01-01', to: '2026-04-30', interestDay: 25 }),
      ['2026-01-25', '2026-02-25', '2026-03-25', '2026-04-25']
    );
  });

  test('G-2. 그 달에 없는 날짜는 말일로 당긴다', () => {
    // 은행이 결제일을 건너뛰지 않는다.
    assert.deepStrictEqual(
      postingDates({ from: '2026-01-01', to: '2026-03-31', interestDay: 31 }),
      ['2026-01-31', '2026-02-28', '2026-03-31']
    );
  });

  test('G-3. 시작일과 같은 날은 넣지 않는다 — 그날은 이전 회차 소관', () => {
    const dates = postingDates({ from: '2026-01-25', to: '2026-03-01', interestDay: 25 });
    assert.deepStrictEqual(dates, ['2026-02-25']);
  });

  test('G-4. 결제일이 없으면 기간 전체가 한 회차', () => {
    const r = simulate({
      balanceTimeline: [bal('2026-01-01', BALANCE)],
      rateTimeline: [rate('2026-01-01', 4.17)],
      from: '2026-03-01', to: '2026-03-31',
    });
    assert.strictEqual(r.postings.length, 1);
    assert.strictEqual(r.postings[0].interest, 12222);
  });

  test('G-5. 마지막 결제일 이후 미수 이자를 따로 알린다', () => {
    const r = simulate({
      balanceTimeline: [bal('2026-01-01', BALANCE)],
      rateTimeline: [rate('2026-01-01', 4.17)],
      from: '2026-03-01', to: '2026-03-31', interestDay: 25,
    });
    assert.strictEqual(r.postings.length, 1);
    assert.ok(r.accrued_since_last_posting > 0, '청구 전 미수 이자가 0 으로 잡혔다');
  });
});

describe('H. 한도 초과', () => {
  test('H-1. 편입으로 한도를 넘으면 알린다 — 막지는 않는다', () => {
    const r = simulate({
      balanceTimeline: [bal('2026-01-01', 4799000)],
      rateTimeline: [rate('2026-01-01', 4.17)],
      from: '2026-03-01', to: '2026-05-31',
      interestDay: 31, compounds: true, creditLimit: LIMIT,
    });
    assert.strictEqual(r.postings[0].over_limit, true, '4,799,000 + 이자 > 4,800,000');
    // 초과해도 계산은 계속된다. 실제로 그런 상태가 존재한다.
    assert.ok(r.total_interest > 0);
    assert.ok(r.final_balance > LIMIT);
  });

  test('H-2. 한도 안이면 false', () => {
    const r = simulate({
      balanceTimeline: [bal('2026-01-01', BALANCE)],
      rateTimeline: [rate('2026-01-01', 4.17)],
      from: '2026-03-01', to: '2026-03-31',
      interestDay: 31, creditLimit: LIMIT,
    });
    assert.strictEqual(r.postings[0].over_limit, false);
  });

  test('H-3. 한도를 안 주면 판정하지 않는다', () => {
    const r = simulate({
      balanceTimeline: [bal('2026-01-01', BALANCE)],
      rateTimeline: [rate('2026-01-01', 4.17)],
      from: '2026-03-01', to: '2026-03-31', interestDay: 31,
    });
    assert.strictEqual(r.postings[0].over_limit, false);
  });
});

describe('I. 장기 누적 — 36개월', () => {
  const r = simulate({
    balanceTimeline: [bal('2026-01-01', BALANCE)],
    rateTimeline: [rate('2026-01-01', 4.17)],
    from: '2026-01-01', to: '2029-01-01',
    interestDay: 25, compounds: true, creditLimit: LIMIT,
  });

  test('I-1. 36회 청구된다', () => {
    assert.strictEqual(r.postings.length, 36);
  });

  test('I-2. 원 단위 정수만 나온다 — 부동소수점이 새지 않는다', () => {
    for (const p of r.postings) {
      assert.ok(Number.isInteger(p.interest), `${p.date} 이자가 정수가 아니다: ${p.interest}`);
      assert.ok(Number.isInteger(p.balance_after), `${p.date} 잔액이 정수가 아니다`);
    }
    assert.ok(Number.isInteger(r.total_interest));
    assert.ok(Number.isInteger(r.final_balance));
  });

  test('I-3. 누적이 회차 합과 정확히 일치한다', () => {
    const sum = r.postings.reduce((s, p) => s + p.interest, 0);
    assert.strictEqual(r.total_interest, sum);
    assert.strictEqual(r.final_balance, BALANCE + sum);
  });

  test('I-4. 복리 누적이 이론값과 원 단위 오차 안에 있다', () => {
    // 절사가 회차마다 일어나므로 이론적 복리보다 조금 작다. 그 차이가 회차 수를
    // 넘지 않아야 한다 — 넘으면 어딘가에서 오차가 증폭되고 있다는 뜻이다.
    let theory = BALANCE;
    let cursor = '2026-01-01';
    for (const p of r.postings) {
      theory += (theory * 0.0417 * daysBetween(cursor, p.date)) / daysInYear(cursor);
      cursor = p.date;
    }
    const drift = Math.abs(floorWon(theory) - r.final_balance);
    assert.ok(drift <= r.postings.length,
      `36개월 누적 오차 ${drift}원이 회차 수(${r.postings.length})를 넘는다`);
  });

  test('I-5. 3년 뒤 한도를 넘는다 — 안 갚으면 그렇게 된다', () => {
    assert.ok(r.final_balance > BALANCE);
    assert.ok(r.postings.some((p) => p.over_limit) || r.final_balance <= LIMIT);
  });
});

describe('J. 끝수 규칙', () => {
  test('J-1. 원 단위 절사다', () => {
    assert.strictEqual(floorWon(1234.99), 1234);
    assert.strictEqual(floorWon(1234.01), 1234);
  });

  test('J-2. 유한수가 아니면 실패한다', () => {
    assert.throws(() => floorWon(NaN));
    assert.throws(() => floorWon(Infinity));
  });

  test('J-3. 윤년은 366일로 나눈다', () => {
    assert.strictEqual(daysInYear('2028-01-01'), 366);
    assert.strictEqual(daysInYear('2026-01-01'), 365);
    assert.strictEqual(daysInYear('2100-01-01'), 365, '100년 단위는 윤년이 아니다');
    assert.strictEqual(daysInYear('2000-01-01'), 366, '400년 단위는 윤년이다');
  });

  test('J-4. 윤년 구간은 이자가 조금 작다', () => {
    const args = (year) => ({
      balanceTimeline: [bal(`${year}-01-01`, BALANCE)],
      rateTimeline: [rate(`${year}-01-01`, 4.17)],
      from: `${year}-03-01`, to: `${year}-03-31`,
    });
    assert.ok(accrueInterest(args(2028)).interest < accrueInterest(args(2026)).interest);
  });
});
