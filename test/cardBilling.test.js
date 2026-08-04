'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');

const { billingMonthFor, billingMonthInfo } = require('../src/services/cardBilling');

// #290. 이 함수가 틀리면 청구월이 통째로 어긋나고 잔액 추적이 전부 틀어진다.
// 그래서 기대값을 우리가 만들어내지 않고 **#284 조사의 KB국민카드 매핑표를
// 그대로 검산 예시로 쓴다**(인수 기준).
//
//   결제일  이용기간
//    1일    전전월 18일 ~ 전월 17일   → 마감 17일
//   14일    전월 1일 ~ 전월 말일      → 마감 말일
//   20일    전월 7일 ~ 당월 6일       → 마감 6일
//   27일    전월 14일 ~ 당월 13일     → 마감 13일
//
// 각 행마다 **이용기간의 마지막 날과 그 다음 날** 을 넣는다. 경계가 규칙의
// 전부이고, 가운데 날짜는 경계가 맞으면 저절로 맞는다.

const KB_1 = { billing_cycle_day: 1, statement_close_day: 17 };
const KB_14 = { billing_cycle_day: 14, statement_close_day: 31 }; // 31 = 말일
const KB_20 = { billing_cycle_day: 20, statement_close_day: 6 };
const KB_27 = { billing_cycle_day: 27, statement_close_day: 13 };

describe('A. #284 KB국민카드 매핑 검산', () => {
  test('A-1. 결제일 1일 — 4/1 청구분은 2/18 ~ 3/17', () => {
    assert.equal(billingMonthFor('2026-02-18', KB_1), '2026-04');
    assert.equal(billingMonthFor('2026-03-17', KB_1), '2026-04');
    // 하루 넘기면 5/1 청구분(3/18 ~ 4/17)이다.
    assert.equal(billingMonthFor('2026-03-18', KB_1), '2026-05');
  });

  test('A-2. 결제일 14일 — 4/14 청구분은 3/1 ~ 3/31', () => {
    assert.equal(billingMonthFor('2026-03-01', KB_14), '2026-04');
    assert.equal(billingMonthFor('2026-03-31', KB_14), '2026-04');
    assert.equal(billingMonthFor('2026-04-01', KB_14), '2026-05');
  });

  test('A-3. 결제일 20일 — 3/20 청구분은 2/7 ~ 3/6', () => {
    assert.equal(billingMonthFor('2026-02-07', KB_20), '2026-03');
    assert.equal(billingMonthFor('2026-03-06', KB_20), '2026-03');
    // 마감 다음 날부터는 4/20 청구분(3/7 ~ 4/6)이다.
    assert.equal(billingMonthFor('2026-03-07', KB_20), '2026-04');
  });

  test('A-4. 결제일 27일 — 3/27 청구분은 2/14 ~ 3/13', () => {
    assert.equal(billingMonthFor('2026-02-14', KB_27), '2026-03');
    assert.equal(billingMonthFor('2026-03-13', KB_27), '2026-03');
    assert.equal(billingMonthFor('2026-03-14', KB_27), '2026-04');
  });
});

describe('B. 결제일이 마감일보다 앞이냐 뒤냐 — 몇 달 뒤 청구인가', () => {
  // 같은 마감일(13일)에 결제일만 바꿔 본다. 결제일이 마감보다 뒤면 같은 달에
  // 결제되고, 앞이거나 같으면 그 달에는 이미 지났으므로 다음 달이다.
  test('B-1. 결제일 > 마감일이면 같은 달 청구', () => {
    assert.equal(billingMonthFor('2026-03-10', { billing_cycle_day: 27, statement_close_day: 13 }), '2026-03');
  });

  test('B-2. 결제일 < 마감일이면 다음 달 청구', () => {
    assert.equal(billingMonthFor('2026-03-10', { billing_cycle_day: 5, statement_close_day: 13 }), '2026-04');
  });

  test('B-3. 결제일 == 마감일이면 다음 달 청구', () => {
    // 마감 당일에 그 마감분을 결제할 수는 없다. 다음 달로 본다.
    assert.equal(billingMonthFor('2026-03-10', { billing_cycle_day: 13, statement_close_day: 13 }), '2026-04');
  });
});

describe('C. 월·연 넘김', () => {
  test('C-1. 12월 구매가 이듬해 1월 청구로 넘어간다', () => {
    assert.equal(billingMonthFor('2026-12-15', KB_14), '2027-01');
  });

  test('C-2. 마감을 넘긴 12월 구매도 연도가 올라간다', () => {
    // 12/7 은 12월 마감(6일)을 넘겼으므로 1월 마감분, 결제일 20 > 마감 6 이라 같은 달.
    assert.equal(billingMonthFor('2026-12-07', KB_20), '2027-01');
  });

  test('C-3. 마감을 넘긴 12월 구매 + 다음 달 결제면 2월까지 간다', () => {
    // 12/18 → 1월 마감(17일) → 결제일 1 <= 17 이라 다음 달 → 2027-02
    assert.equal(billingMonthFor('2026-12-18', KB_1), '2027-02');
  });
});

describe('D. 2월 — 마감일을 그 달에 있는 날로 접는다', () => {
  test('D-1. 마감 31일은 2월에 말일(28일)로 접힌다', () => {
    // 2026-02 는 28일까지다. 2/28 은 마감 당일이므로 2월 마감분이다.
    assert.equal(billingMonthFor('2026-02-28', KB_14), '2026-03');
  });

  test('D-2. 윤년 2월은 29일까지 접힌다', () => {
    assert.equal(billingMonthFor('2028-02-29', KB_14), '2028-03');
  });

  test('D-3. 마감 30일도 2월에는 28일로 접힌다', () => {
    const card = { billing_cycle_day: 27, statement_close_day: 30 };
    assert.equal(billingMonthFor('2026-02-28', card), '2026-03');
    // 3월에는 30일이 실재하므로 접히지 않는다 — 3/31 은 4월 마감분이다.
    assert.equal(billingMonthFor('2026-03-30', card), '2026-04');
    assert.equal(billingMonthFor('2026-03-31', card), '2026-05');
  });

  test('D-4. 접기는 마감 판정에만 쓰고, 몇 달 뒤 청구인지는 설정값으로 본다', () => {
    // 마감 30 / 결제 29 → 29 <= 30 이라 다음 달 청구다. 2월에 마감이 28로
    // 접혀도 이 관계는 그대로여야 한다 — 접힌 값(28)으로 비교하면 29 > 28 이
    // 되어 같은 달 청구로 뒤집힌다.
    const card = { billing_cycle_day: 29, statement_close_day: 30 };
    assert.equal(billingMonthFor('2026-02-20', card), '2026-03');
  });
});

describe('E. 청구 주기를 모를 때 — 폴백', () => {
  // 모르는데 추측해서 옮기면 사용자가 보기에 거래가 이유 없이 다른 달에 가 있다.
  // 옮기지 않는 쪽이 안전하다.
  test('E-1. 카드 정보가 아예 없으면 구매일의 달력 월', () => {
    assert.equal(billingMonthFor('2026-03-15', null), '2026-03');
    assert.equal(billingMonthFor('2026-03-15', undefined), '2026-03');
  });

  test('E-2. 두 컬럼 중 하나라도 비어 있으면 폴백', () => {
    assert.equal(billingMonthFor('2026-03-15', { billing_cycle_day: 14, statement_close_day: null }), '2026-03');
    assert.equal(billingMonthFor('2026-03-15', { billing_cycle_day: null, statement_close_day: 31 }), '2026-03');
    assert.equal(billingMonthFor('2026-03-15', {}), '2026-03');
  });

  test('E-3. 범위 밖·정수 아닌 값도 폴백', () => {
    for (const bad of [0, 32, -1, 14.5, '14', NaN]) {
      assert.equal(
        billingMonthFor('2026-03-15', { billing_cycle_day: bad, statement_close_day: 13 }),
        '2026-03',
        `billing_cycle_day=${String(bad)} 가 폴백되지 않았다`
      );
    }
  });

  test('E-4. 폴백인지 계산 결과인지 호출부가 구분할 수 있다', () => {
    // 화면이 "청구월" 과 "청구 주기 미설정" 을 다르게 보여줘야 한다.
    assert.deepEqual(billingMonthInfo('2026-03-15', null), { billingMonth: '2026-03', resolved: false });
    assert.deepEqual(billingMonthInfo('2026-03-15', KB_20), { billingMonth: '2026-04', resolved: true });
  });
});

describe('F. 잘못된 입력', () => {
  test('F-1. 날짜 형식이 아니면 던진다 — 조용히 오늘로 떨어지면 안 된다', () => {
    for (const bad of ['2026-3-15', '20260315', '', null, undefined, '2026-03-15T00:00:00Z']) {
      assert.throws(() => billingMonthFor(bad, KB_20), TypeError, `${String(bad)} 가 통과됐다`);
    }
  });
});
