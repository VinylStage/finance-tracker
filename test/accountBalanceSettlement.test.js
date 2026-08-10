'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');

const { computeBalance, cardUnpaid } = require('../src/services/accountBalance');

// 잔액 계산이 현금흐름 시점을 이해한다(#289 → #291 선행).
//
// **`deferred` 가 통장 잔액에서 빠지는 것**이 요구사항의 핵심이다. 신용카드로
// 긁은 돈은 아직 통장에 있고, 카드대금이 빠질 때 `settlement` 거래가 줄인다.
//
// accounts-balance.test.js 는 이 축이 없던 시절의 계산을 고정한다. 그 파일이
// 계속 통과해야 한다 — settlement 를 안 보내던 호출부의 동작이 안 바뀌어야 한다.

const ACC = { opening_balance: 100000, opening_date: '2026-01-01' };

const tx = (over) => ({ date: '2026-03-01', amount: 10000, direction: 'out', ...over });

describe('A. computeBalance — deferred 는 잔액에서 빠진다', () => {
  test('A-1. 신용카드 사용은 통장을 줄이지 않는다', () => {
    const r = computeBalance(ACC, [tx({ settlement: 'deferred', amount: 30000 })]);
    assert.equal(r.balance, 100000, 'deferred 가 잔액을 줄였다');
    assert.equal(r.counted, 0);
    assert.equal(r.deferred, 1);
  });

  test('A-2. 카드대금 인출은 통장을 줄인다', () => {
    const r = computeBalance(ACC, [tx({ settlement: 'settlement', amount: 30000 })]);
    assert.equal(r.balance, 70000);
    assert.equal(r.counted, 1);
    assert.equal(r.deferred, 0);
  });

  test('A-3. 셋이 섞이면 immediate 와 settlement 만 잡힌다', () => {
    const r = computeBalance(ACC, [
      tx({ settlement: 'immediate', amount: 5000 }),
      tx({ settlement: 'deferred', amount: 30000 }),
      tx({ settlement: 'deferred', amount: 20000 }),
      tx({ settlement: 'settlement', amount: 50000 }),
    ]);
    assert.equal(r.balance, 100000 - 5000 - 50000);
    assert.equal(r.counted, 2);
    assert.equal(r.deferred, 2);
  });

  test('A-4. settlement 이 없으면 immediate 로 본다 — 기존 동작 유지', () => {
    // 021 의 DEFAULT 와 같다. 이 단언이 깨지면 컬럼을 안 보내던 호출부의
    // 잔액이 조용히 달라진다.
    const r = computeBalance(ACC, [tx({ amount: 30000 })]);
    assert.equal(r.balance, 70000);
    assert.equal(r.counted, 1);
    assert.equal(r.deferred, 0);
  });

  test('A-5. 수입도 deferred 면 빠진다', () => {
    // 방향과 시점은 다른 축이다. deferred 인 수입은 아직 통장에 안 들어왔다.
    const r = computeBalance(ACC, [tx({ direction: 'in', settlement: 'deferred', amount: 50000 })]);
    assert.equal(r.balance, 100000);
    assert.equal(r.deferred, 1);
  });

  test('A-6. deferred 를 skipped 에 섞지 않는다', () => {
    // skipped 는 "날짜가 이상하거나 기준일 이전" 이다. 화면이 사용자에게 보여줄
    // 이유가 없는 값이고, deferred 는 반대로 보여줘야 한다.
    const r = computeBalance(ACC, [
      tx({ settlement: 'deferred' }),
      tx({ date: '2025-12-31' }),   // 기준일 이전
      tx({ date: 'not-a-date' }),   // 형식 이상
    ]);
    assert.equal(r.deferred, 1);
    assert.equal(r.skipped, 2);
    assert.equal(r.counted, 0);
  });

  test('A-8. 알 수 없는 값은 immediate 로 취급한다 — 어디에서도 사라지면 안 된다', () => {
    // DB 에 CHECK 를 걸지 않았고(#289) 복원이 걸러 주지만, 그래도 값이 샐 수
    // 있다. 그때 이 거래가 잔액에도 미결제액에도 안 잡히면 **돈이 조용히
    // 사라진다.** 안전한 쪽(즉시 차감)으로 떨어뜨린다.
    const rows = [tx({ settlement: '이상한값', amount: 30000 })];
    const bal = computeBalance(ACC, rows);
    const unpaid = cardUnpaid(rows);

    assert.equal(bal.balance, 70000, '알 수 없는 값이 잔액에서 빠졌다');
    assert.equal(bal.counted, 1);
    assert.equal(bal.deferred, 0);
    assert.equal(unpaid.total, 0, '알 수 없는 값이 미결제액에 잡혔다');
  });

  test('A-7. 기준일 이전의 deferred 는 deferred 로 세지 않는다', () => {
    // 이미 반영된 구간이다. 두 번 세면 안내 문구의 건수가 틀린다.
    const r = computeBalance(ACC, [tx({ date: '2025-12-31', settlement: 'deferred' })]);
    assert.equal(r.skipped, 1);
    assert.equal(r.deferred, 0);
  });
});

describe('B. cardUnpaid — 미결제액', () => {
  test('B-1. deferred 합에서 settlement 합을 뺀다', () => {
    const r = cardUnpaid([
      tx({ settlement: 'deferred', amount: 30000, billing_month: '2026-04' }),
      tx({ settlement: 'deferred', amount: 20000, billing_month: '2026-04' }),
      tx({ settlement: 'settlement', amount: 50000, billing_month: '2026-04' }),
    ]);
    assert.equal(r.total, 0);
    assert.deepEqual(r.byMonth['2026-04'], { deferred: 50000, settled: 50000, unpaid: 0 });
  });

  test('B-2. 아직 안 빠진 달이 남는다', () => {
    const r = cardUnpaid([
      tx({ settlement: 'deferred', amount: 30000, billing_month: '2026-04' }),
      tx({ settlement: 'settlement', amount: 30000, billing_month: '2026-04' }),
      tx({ settlement: 'deferred', amount: 45000, billing_month: '2026-05' }),
    ]);
    assert.equal(r.total, 45000);
    assert.equal(r.byMonth['2026-04'].unpaid, 0);
    assert.equal(r.byMonth['2026-05'].unpaid, 45000);
  });

  test('B-3. immediate 는 미결제액과 무관하다', () => {
    const r = cardUnpaid([
      tx({ settlement: 'immediate', amount: 99999 }),
      tx({ amount: 88888 }),
    ]);
    assert.equal(r.total, 0);
    assert.deepEqual(r.byMonth, {});
  });

  test('B-4. 음수를 0 으로 자르지 않는다 — 데이터가 어긋났다는 신호다', () => {
    const r = cardUnpaid([
      tx({ settlement: 'settlement', amount: 70000, billing_month: '2026-04' }),
      tx({ settlement: 'deferred', amount: 30000, billing_month: '2026-04' }),
    ]);
    assert.equal(r.total, -40000, '음수가 감춰졌다');
    assert.equal(r.byMonth['2026-04'].unpaid, -40000);
  });

  test('B-5. 청구월을 모르는 건은 unassigned 로 뺀다', () => {
    // 카드 청구 주기를 아직 입력하지 않은 상태다(#290 의 폴백). 화면이
    // "청구월을 모르는 거래 N건" 을 안내할 수 있어야 한다.
    const r = cardUnpaid([
      tx({ settlement: 'deferred', amount: 30000 }),
      tx({ settlement: 'deferred', amount: 20000, billing_month: '2026-4' }), // 형식 불량
      tx({ settlement: 'deferred', amount: 10000, billing_month: '2026-04' }),
    ]);
    assert.equal(r.total, 60000, '총액에는 전부 잡혀야 한다');
    assert.equal(r.unassigned.count, 2);
    assert.equal(r.unassigned.deferred, 50000);
    assert.equal(r.byMonth['2026-04'].unpaid, 10000);
  });

  test('B-6. 빈 입력과 잘못된 입력', () => {
    assert.deepEqual(cardUnpaid([]), { total: 0, byMonth: {}, unassigned: { deferred: 0, settled: 0, count: 0 } });
    assert.equal(cardUnpaid(null).total, 0);
    assert.equal(cardUnpaid(undefined).total, 0);
  });
});

describe('C. 두 값은 별개 축이다', () => {
  test('C-1. 같은 거래 묶음에서 잔액과 미결제액이 각각 나온다', () => {
    // 통장에 있는 돈과 나갈 예정인 돈을 한 숫자로 합치면 사용자가 어느 쪽을
    // 보는지 알 수 없다. #291 화면이 둘을 병기하는 근거다.
    const rows = [
      tx({ settlement: 'immediate', amount: 5000 }),
      tx({ settlement: 'deferred', amount: 30000, billing_month: '2026-04' }),
    ];
    const bal = computeBalance(ACC, rows);
    const unpaid = cardUnpaid(rows);

    assert.equal(bal.balance, 95000, '통장에는 아직 카드값이 남아 있다');
    assert.equal(unpaid.total, 30000, '나갈 예정인 돈');
    assert.equal(bal.deferred, 1, '화면이 "카드로 쓴 1건" 을 말할 수 있다');
  });
});
