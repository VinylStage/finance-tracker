'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');

const { computeBalance, projectBalance } = require('../src/services/accountBalance');

// 잔액을 "오늘까지" 로 자르고(#382) 미래는 추이로 분리한다(#291).
//
// **기준일을 주입할 수 있어야 이 파일이 성립한다.** 오늘에 의존하면 내일 깨진다.

const ACC = { opening_balance: 1000000, opening_date: '2026-01-01' };
const TODAY = '2026-08-04';

const tx = (over) => ({ date: '2026-03-01', amount: 10000, direction: 'out', ...over });

describe('A. 잔액은 기준일까지만 센다 (#382)', () => {
  test('A-1. 미래 날짜 거래는 잔액에서 빠지지 않는다', () => {
    const r = computeBalance(ACC, [tx({ date: '2027-06-01', amount: 500000 })], { asOf: TODAY });
    assert.equal(r.balance, 1000000, '미래 거래가 잔액을 줄였다');
    assert.equal(r.counted, 0);
    assert.equal(r.upcoming, 1, '예정 인출로 세야 한다');
  });

  test('A-2. 기준일 당일은 포함한다', () => {
    const r = computeBalance(ACC, [tx({ date: TODAY, amount: 30000 })], { asOf: TODAY });
    assert.equal(r.balance, 970000);
    assert.equal(r.counted, 1);
    assert.equal(r.upcoming, 0);
  });

  test('A-3. 기준일 다음 날부터 예정이다', () => {
    const r = computeBalance(ACC, [tx({ date: '2026-08-05', amount: 30000 })], { asOf: TODAY });
    assert.equal(r.balance, 1000000);
    assert.equal(r.upcoming, 1);
  });

  test('A-4. upcoming 을 skipped 에 섞지 않는다', () => {
    // skipped 는 화면에 보여줄 이유가 없는 값이고, upcoming 은 보여줘야 한다.
    const r = computeBalance(ACC, [
      tx({ date: '2027-01-01' }),
      tx({ date: '2025-12-31' }),  // 기준 잔액 이전
      tx({ date: 'bad-date' }),
    ], { asOf: TODAY });
    assert.equal(r.upcoming, 1);
    assert.equal(r.skipped, 2);
    assert.equal(r.counted, 0);
  });

  test('A-5. 미래 날짜의 카드 사용은 deferred 이지 upcoming 이 아니다', () => {
    // 아직 통장과 무관하다. 통장에서 빠질 것(upcoming)과 섞으면 두 번 센다.
    const r = computeBalance(ACC, [
      tx({ date: '2027-01-01', settlement: 'deferred', billing_month: '2027-02' }),
    ], { asOf: TODAY });
    assert.equal(r.deferred, 1);
    assert.equal(r.upcoming, 0);
    assert.equal(r.balance, 1000000);
  });

  test('A-6. 기준일을 안 주면 오늘을 쓴다', () => {
    const r = computeBalance(ACC, []);
    assert.match(r.asOf, /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('B. 미래 잔액 추이', () => {
  test('B-1. 예정 인출이 그 달에 반영된다', () => {
    const r = projectBalance(ACC, [
      tx({ date: '2026-09-01', amount: 300000 }),
      tx({ date: '2026-10-01', amount: 200000 }),
    ], { asOf: TODAY, horizonMonths: 3 });

    assert.equal(r.start, 1000000);
    assert.deepEqual(r.months.map((m) => m.month), ['2026-09', '2026-10', '2026-11']);
    assert.equal(r.months[0].balance, 700000);
    assert.equal(r.months[1].balance, 500000);
    assert.equal(r.months[2].balance, 500000, '변동 없는 달도 이어져야 한다');
  });

  test('B-2. 변동 없는 달도 건너뛰지 않는다', () => {
    // 빈 달을 빼면 화면에서 시간 간격이 왜곡된다.
    const r = projectBalance(ACC, [tx({ date: '2026-11-01', amount: 100000 })], { asOf: TODAY, horizonMonths: 4 });
    assert.equal(r.months.length, 4);
    assert.equal(r.months[0].change, 0);
    assert.equal(r.months[2].change, -100000);
  });

  test('B-3. 카드값은 쓴 달이 아니라 청구월에 빠진다', () => {
    const r = projectBalance(ACC, [
      tx({ date: '2026-08-01', amount: 400000, settlement: 'deferred', billing_month: '2026-09' }),
    ], { asOf: TODAY, horizonMonths: 2 });

    assert.equal(r.months[0].month, '2026-09');
    assert.equal(r.months[0].change, -400000, '청구월에 안 잡혔다');
    assert.equal(r.months[1].change, 0);
  });

  test('B-4. 청구월을 모르는 카드값은 추이에 넣지 않는다', () => {
    // 언제 빠질지 모르는데 넣으면 없는 확신을 만든다. 건수는 card_unpaid 가 알린다.
    const r = projectBalance(ACC, [
      tx({ date: '2026-08-01', amount: 400000, settlement: 'deferred' }),
    ], { asOf: TODAY, horizonMonths: 2 });

    assert.deepEqual(r.months.map((m) => m.change), [0, 0]);
  });

  test('B-5. 이미 지난 거래는 start 에 있고 추이에 또 넣지 않는다', () => {
    const r = projectBalance(ACC, [tx({ date: '2026-07-01', amount: 100000 })], { asOf: TODAY, horizonMonths: 2 });
    assert.equal(r.start, 900000, '지난 거래가 start 에 반영돼야 한다');
    assert.deepEqual(r.months.map((m) => m.change), [0, 0], '추이에 두 번 잡혔다');
  });

  test('B-6. 수입도 반영된다', () => {
    const r = projectBalance(ACC, [
      tx({ date: '2026-09-15', amount: 2000000, direction: 'in' }),
    ], { asOf: TODAY, horizonMonths: 1 });
    assert.equal(r.months[0].balance, 3000000);
  });
});

describe('C. 마이너스 전환 시점 — 이 기능의 실질적 가치', () => {
  test('C-1. 처음 음수가 되는 달을 짚는다', () => {
    const r = projectBalance(ACC, [
      tx({ date: '2026-09-01', amount: 600000 }),
      tx({ date: '2026-10-01', amount: 600000 }),
      tx({ date: '2026-11-01', amount: 600000 }),
    ], { asOf: TODAY, horizonMonths: 4 });

    assert.equal(r.months[0].balance, 400000);
    assert.equal(r.months[1].balance, -200000);
    assert.equal(r.negativeFrom, '2026-10', '마이너스 전환 시점이 안 잡혔다');
  });

  test('C-2. 한 번 잡히면 뒤로 밀리지 않는다', () => {
    const r = projectBalance(ACC, [
      tx({ date: '2026-09-01', amount: 2000000 }),
      tx({ date: '2026-10-01', amount: 5000000, direction: 'in' }),
    ], { asOf: TODAY, horizonMonths: 3 });
    assert.equal(r.negativeFrom, '2026-09', '뒤에 회복돼도 첫 시점을 말해야 한다');
  });

  test('C-3. 마이너스통장은 잔액이 음수여도 한도 안이면 경고하지 않는다', () => {
    // 일반 계좌였다면 -50만은 경고 대상이다. 마이너스통장은 한도까지가
    // 여유이므로 아직 쓸 수 있는 돈이 있다.
    const credit = { opening_balance: 0, opening_date: '2026-01-01', credit_limit: 1000000 };
    const r = projectBalance(credit, [
      tx({ date: '2026-09-01', amount: 500000 }),
      tx({ date: '2026-10-01', amount: 300000 }),
    ], { asOf: TODAY, horizonMonths: 3 });

    assert.equal(r.months[0].balance, -500000);
    assert.equal(r.months[1].balance, -800000, '누적 -80만, 한도 100만 안');
    assert.equal(r.negativeFrom, null, '한도 안인데 경고했다');
  });

  test('C-4. 한도를 넘기면 그때 잡는다', () => {
    const credit = { opening_balance: 0, opening_date: '2026-01-01', credit_limit: 1000000 };
    const r = projectBalance(credit, [
      tx({ date: '2026-09-01', amount: 1500000 }),
    ], { asOf: TODAY, horizonMonths: 2 });
    assert.equal(r.negativeFrom, '2026-09');
  });

  test('C-5. 끝까지 여유가 있으면 null 이다', () => {
    const r = projectBalance(ACC, [tx({ date: '2026-09-01', amount: 1000 })], { asOf: TODAY, horizonMonths: 3 });
    assert.equal(r.negativeFrom, null);
  });
});

describe('D. 반영 범위를 스스로 밝힌다', () => {
  test('D-1. 무엇을 반영했는지 돌려준다', () => {
    // 화면이 "무엇을 반영했고 무엇을 안 했는지" 를 말해야 한다. 예측을
    // 단정적으로 제시하면 사용자가 그대로 믿고 손해를 본다.
    const r = projectBalance(ACC, [], { asOf: TODAY });
    assert.deepEqual(r.includes, ['scheduled', 'card-unpaid']);
    // 대출 상환 스케줄은 데이터로 존재하지 않으므로 반영 대상이 아니다.
    assert.ok(!r.includes.includes('debt-repayment'));
  });

  test('D-2. 기본 기간은 6개월이다', () => {
    const r = projectBalance(ACC, [], { asOf: TODAY });
    assert.equal(r.months.length, 6);
  });

  test('D-3. 잘못된 기간은 기본값으로 떨어진다', () => {
    for (const bad of [0, -1, 1.5, '6', null]) {
      assert.equal(projectBalance(ACC, [], { asOf: TODAY, horizonMonths: bad }).months.length, 6);
    }
  });

  test('D-4. 연말을 넘어간다', () => {
    const r = projectBalance(ACC, [], { asOf: '2026-11-20', horizonMonths: 3 });
    assert.deepEqual(r.months.map((m) => m.month), ['2026-12', '2027-01', '2027-02']);
  });

  test('D-5. 거래가 배열이 아니어도 던지지 않는다', () => {
    const r = projectBalance(ACC, null, { asOf: TODAY });
    assert.equal(r.start, 1000000);
    assert.deepEqual(r.months, []);
  });
});
