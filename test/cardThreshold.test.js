'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');

const { prevPeriodFor, computeThreshold, thresholdOf } = require('../src/services/cardThreshold');

// 전월 실적 구간과 합산(#276).
//
// **이 파일이 지키는 것은 "구간이 달력 월이 아니다" 다.** 마감일 6일 카드의
// 전월 실적은 6/7 ~ 7/6 이지 7/1 ~ 7/31 이 아니다. 이게 어긋나면 마감일
// 근처 결제가 통째로 다른 구간에 잡히고, 사용자는 실적을 채웠다고 믿었는데
// 혜택을 못 받는다.

const card = (over) => ({ statement_close_day: 6, prev_month_threshold: null, ...over });

describe('A. 실적 구간은 마감일에서 마감일까지다', () => {
  test('A-1. 마감일 6일이면 8월 초 기준 전월 실적은 6/7 ~ 7/6 이다', () => {
    const p = prevPeriodFor('2026-08-04', card());
    assert.deepEqual(p, { start: '2026-06-07', end: '2026-07-06', resolved: true });
  });

  test('A-2. 마감일 당일은 아직 이번 구간이다', () => {
    // billingMonthInfo 가 `day <= closeDay` 를 이번 달 마감으로 보는 것과 같다.
    // 8/6 결제는 8/6 마감분에 들어가므로, 8/6 시점의 전월 실적은 그대로다.
    const p = prevPeriodFor('2026-08-06', card());
    assert.equal(p.end, '2026-07-06', '마감일 당일에 구간이 넘어갔다');
  });

  test('A-3. 마감일 다음 날 구간이 한 칸 움직인다', () => {
    const p = prevPeriodFor('2026-08-07', card());
    assert.deepEqual(p, { start: '2026-07-07', end: '2026-08-06', resolved: true });
  });

  test('A-4. 마감일 31일은 2월에 말일로 접힌다', () => {
    // 2026년 2월은 28일까지다. 31일 마감은 2/28 로 접힌다.
    const p = prevPeriodFor('2026-03-15', card({ statement_close_day: 31 }));
    assert.deepEqual(p, { start: '2026-02-01', end: '2026-02-28', resolved: true });
  });

  test('A-5. 접힌 마감일 다음 구간은 1일에 시작한다', () => {
    // 6/30 마감(31일이 접힘) 다음 날은 7/1 이다. 마감일에서 하루를 빼는 식으로
    // 계산하면 7/1 이 아니라 8/1 이나 6/31 같은 값이 나온다.
    const p = prevPeriodFor('2026-08-15', card({ statement_close_day: 31 }));
    assert.deepEqual(p, { start: '2026-07-01', end: '2026-07-31', resolved: true });
  });

  test('A-6. 연말을 넘어간다', () => {
    const p = prevPeriodFor('2027-01-04', card());
    assert.deepEqual(p, { start: '2026-11-07', end: '2026-12-06', resolved: true });
  });

  test('A-7. 구간은 양 끝을 포함하고 겹치지 않는다', () => {
    // 8/7 구간의 시작(7/7)은 8/4 구간의 끝(7/6) 바로 다음 날이어야 한다.
    // 하루라도 벌어지면 그 날 결제가 어느 구간에도 안 잡힌다.
    const earlier = prevPeriodFor('2026-08-04', card());
    const later = prevPeriodFor('2026-08-07', card());
    assert.equal(earlier.end, '2026-07-06');
    assert.equal(later.start, '2026-07-07');
  });
});

describe('B. 마감일을 모르면 추측하지 않는다', () => {
  test('B-1. 미설정이면 지난 달력 월로 떨어지고 그걸 알린다', () => {
    const p = prevPeriodFor('2026-08-04', card({ statement_close_day: null }));
    assert.deepEqual(p, { start: '2026-07-01', end: '2026-07-31', resolved: false });
  });

  test('B-2. 카드 정보 자체가 없어도 던지지 않는다', () => {
    assert.equal(prevPeriodFor('2026-08-04', null).resolved, false);
  });

  test('B-3. 범위 밖 마감일은 미설정으로 본다', () => {
    for (const bad of [0, 32, -1, '6', 6.5, NaN]) {
      assert.equal(
        prevPeriodFor('2026-08-04', card({ statement_close_day: bad })).resolved,
        false,
        `${JSON.stringify(bad)} 를 유효한 마감일로 받았다`,
      );
    }
  });

  test('B-4. 폴백도 연말을 넘어간다', () => {
    const p = prevPeriodFor('2027-01-15', card({ statement_close_day: null }));
    assert.deepEqual(p, { start: '2026-12-01', end: '2026-12-31', resolved: false });
  });

  test('B-5. 날짜 형식이 틀리면 던진다', () => {
    // 조용히 0원을 돌려주면 실적 미달로 잘못 판정된다. 이건 호출부 버그다.
    for (const bad of ['2026-8-4', '20260804', '', null, undefined]) {
      assert.throws(() => prevPeriodFor(bad, card()), TypeError);
    }
  });
});

describe('C. 실적 조건', () => {
  test('C-1. 미설정은 조건 없음이다', () => {
    assert.equal(thresholdOf({ prev_month_threshold: null }), null);
    assert.equal(thresholdOf({}), null);
    assert.equal(thresholdOf(null), null);
  });

  test('C-2. 0 이하도 조건 없음이다', () => {
    // "0원 이상 쓰면 혜택" 은 조건이 아니다.
    assert.equal(thresholdOf({ prev_month_threshold: 0 }), null);
    assert.equal(thresholdOf({ prev_month_threshold: -1 }), null);
  });

  test('C-3. 조건이 없으면 채운 것으로 본다', () => {
    // compareCards 의 thresholdMet 계약과 같다.
    const r = computeThreshold({ cardProduct: card(), transactions: [], asOf: '2026-08-04' });
    assert.equal(r.threshold, null);
    assert.equal(r.met, true);
    assert.equal(r.shortfall, 0);
  });
});

describe('D. 합산', () => {
  const tx = (over) => ({ date: '2026-06-20', amount: 10000, origin: 'manual', major_type: '선택지출', ...over });
  const withThreshold = card({ prev_month_threshold: 300000 });

  const run = (transactions, cardProduct = withThreshold) =>
    computeThreshold({ cardProduct, transactions, asOf: '2026-08-04' });

  test('D-1. 구간 안의 거래만 센다', () => {
    const r = run([
      tx({ date: '2026-06-06' }),          // 구간 직전
      tx({ date: '2026-06-07' }),          // 시작일 — 포함
      tx({ date: '2026-07-06' }),          // 마감일 — 포함
      tx({ date: '2026-07-07' }),          // 구간 직후
    ]);
    assert.equal(r.counted, 2, '경계가 어긋났다');
    assert.equal(r.spend, 20000);
  });

  test('D-2. 파생 거래는 빠진다', () => {
    // 할부금·리볼빙 수수료·이자·상환은 원 결제가 따로 있다. 같이 세면 한 번
    // 쓴 돈이 두 번 실적에 잡힌다.
    const r = run([
      tx(),
      tx({ origin: 'installment' }),
      tx({ origin: 'revolving' }),
      tx({ origin: 'debt_interest' }),
      tx({ origin: 'debt_repayment' }),
    ]);
    assert.equal(r.spend, 10000, '파생 거래가 실적에 들어갔다');
    assert.equal(r.excluded.derived, 4);
  });

  test('D-3. 반복거래는 실제 결제라 포함된다', () => {
    const r = run([tx({ origin: 'recurring' })]);
    assert.equal(r.spend, 10000, '반복거래를 파생으로 잘못 뺐다');
  });

  test('D-4. 수입은 빠진다', () => {
    const r = run([tx(), tx({ major_type: '수입', amount: 5000000 })]);
    assert.equal(r.spend, 10000, '수입이 실적에 들어갔다');
    assert.equal(r.excluded.income, 1);
  });

  test('D-5. 실적을 채우면 met 이 참이다', () => {
    assert.equal(run([tx({ amount: 299999 })]).met, false);
    assert.equal(run([tx({ amount: 300000 })]).met, true, '딱 맞췄는데 미달로 봤다');
    assert.equal(run([tx({ amount: 300001 })]).met, true);
  });

  test('D-6. 모자란 금액을 알려준다', () => {
    const r = run([tx({ amount: 250000 })]);
    assert.equal(r.shortfall, 50000);
    // 넘겼을 때 음수가 나오면 화면이 "-5만원 남음" 을 찍는다.
    assert.equal(run([tx({ amount: 400000 })]).shortfall, 0);
  });

  test('D-7. 빈 목록과 잘못된 입력을 견딘다', () => {
    assert.equal(run([]).spend, 0);
    assert.equal(run(null).spend, 0);
    assert.equal(run([null, undefined]).spend, 0);
    assert.equal(run([tx({ amount: 'x' })]).spend, 0, '숫자가 아닌 금액이 NaN 으로 샜다');
  });

  test('D-8. 추정임을 항상 실어 보낸다', () => {
    // 카드사의 실적 제외 항목(세금·상품권·선불충전 등)을 우리는 모른다.
    // 그래서 이 합계는 실제 실적보다 크게 나오고, met 이 실제보다 쉽게
    // 참이 된다. 화면이 이 플래그를 보고 한계를 말해야 한다.
    assert.equal(run([tx()]).estimated, true);
    assert.equal(run([]).estimated, true);
  });

  test('D-9. 마감일 미설정이면 구간과 함께 그 사실도 넘어온다', () => {
    const r = run([tx({ date: '2026-07-15' })], card({ statement_close_day: null, prev_month_threshold: 300000 }));
    assert.equal(r.period.resolved, false);
    assert.equal(r.spend, 10000, '달력 월 폴백 구간이 안 잡혔다');
  });
});
