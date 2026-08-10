'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');

const { prevPeriodFor, computeThreshold, thresholdOf } = require('../src/services/cardThreshold');

// 전월 실적 구간과 합산(#276).
//
// **이 파일이 지키는 것은 "실적 기간은 청구 기간이 아니다" 다.**
//
// 처음엔 마감일 ~ 마감일로 잡았다가 고쳤다. 결제일 25일 카드에서 2026-02
// 실적조건 40만원이면 마감일 기준 321,394원(미달) / 달력월 403,054원(충족)
// 으로 **판정이 뒤집힌다.** 사용자가 자격을 채웠는데 앱이 혜택을 0 으로 계산해
// 추천에서 떨어뜨린다.

const card = (over) => ({ prev_month_threshold: null, ...over });

describe('A. 실적 구간은 전월 달력월이다', () => {
  test('A-1. 8월 초 기준 전월 실적은 7/1 ~ 7/31 이다', () => {
    assert.deepEqual(prevPeriodFor('2026-08-04'), { start: '2026-07-01', end: '2026-07-31' });
  });

  test('A-2. 달 안에서는 며칠이든 같은 구간이다', () => {
    // 마감일 기준이면 날짜에 따라 구간이 움직였다. 달력월은 안 움직인다.
    for (const day of ['01', '04', '15', '25', '31']) {
      assert.deepEqual(
        prevPeriodFor(`2026-08-${day}`),
        { start: '2026-07-01', end: '2026-07-31' },
        `8/${day} 에서 구간이 달라졌다`,
      );
    }
  });

  test('A-3. 2월 말일이 그 해에 맞는다', () => {
    assert.deepEqual(prevPeriodFor('2026-03-15'), { start: '2026-02-01', end: '2026-02-28' });
    assert.deepEqual(prevPeriodFor('2028-03-15'), { start: '2028-02-01', end: '2028-02-29' });
  });

  test('A-4. 31일에 물어도 30일 달이 안 깨진다', () => {
    // 5/31 의 전월은 4/1~4/30 이다. 날짜를 그대로 빼면 4/31 이 나온다.
    assert.deepEqual(prevPeriodFor('2026-05-31'), { start: '2026-04-01', end: '2026-04-30' });
  });

  test('A-5. 연초에 전년으로 넘어간다', () => {
    assert.deepEqual(prevPeriodFor('2027-01-04'), { start: '2026-12-01', end: '2026-12-31' });
  });

  test('A-6. 카드 정보를 받지 않는다', () => {
    // 실적 구간은 카드마다 다르지 않다. 마감일·결제일이 정하는 것은 청구
    // 기간이지 실적 기간이 아니다. 인자를 받으면 언젠가 누가 그걸 쓴다.
    assert.equal(prevPeriodFor.length, 1);
  });
});

describe('B. 마감일·결제일에 흔들리지 않는다', () => {
  test('B-1. 마감일을 무엇으로 주든 구간이 같다', () => {
    // 예전 구현은 여기서 구간이 카드마다 달라졌다.
    const expected = { start: '2026-07-01', end: '2026-07-31' };
    for (const closeDay of [1, 6, 11, 25, 31, null, undefined, 0, 99]) {
      const c = computeThreshold({
        cardProduct: card({ statement_close_day: closeDay, billing_cycle_day: 25 }),
        transactions: [], asOf: '2026-08-04',
      });
      assert.deepEqual(c.period, expected, `마감일 ${closeDay} 에서 구간이 달라졌다`);
    }
  });

  test('B-2. 카드 정보 자체가 없어도 구간이 나온다', () => {
    const c = computeThreshold({ cardProduct: null, transactions: [], asOf: '2026-08-04' });
    assert.deepEqual(c.period, { start: '2026-07-01', end: '2026-07-31' });
  });

  test('B-3. 못 풀었다는 상태가 없다', () => {
    // 달력월은 언제나 정확히 정해진다. resolved 같은 단서를 남기면 화면이
    // "마감일을 설정하면 정확해집니다" 같은 틀린 안내를 하게 된다.
    const c = computeThreshold({ cardProduct: card(), transactions: [], asOf: '2026-08-04' });
    assert.deepEqual(Object.keys(c.period).sort(), ['end', 'start']);
  });

  test('B-4. 날짜 형식이 틀리면 던진다', () => {
    // 조용히 오늘로 떨어지면 호출부 버그가 안 보인다.
    for (const bad of ['2026-8-4', '20260804', '', null, undefined]) {
      assert.throws(() => prevPeriodFor(bad), TypeError);
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
  const tx = (over) => ({ date: '2026-07-10', amount: 10000, origin: 'manual', major_type: '선택지출', ...over });
  const withThreshold = card({ prev_month_threshold: 300000 });

  const run = (transactions, cardProduct = withThreshold) =>
    computeThreshold({ cardProduct, transactions, asOf: '2026-08-04' });

  test('D-1. 구간 안의 거래만 센다', () => {
    const r = run([
      tx({ date: '2026-06-30' }),          // 구간 직전
      tx({ date: '2026-07-01' }),          // 1일 — 포함
      tx({ date: '2026-07-31' }),          // 말일 — 포함
      tx({ date: '2026-08-01' }),          // 구간 직후
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

  test('D-9. 구간은 언제나 전월 달력월이다', () => {
    const r = run([tx({ date: '2026-07-15' })]);
    assert.deepEqual(r.period, { start: '2026-07-01', end: '2026-07-31' });
    assert.equal(r.spend, 10000);
  });
});

// 사용자가 실사용 중 제기한 건(2026-08-04). 삼성카드 결제일 25일.
//
// 결제일 25일이면 **청구** 이용기간은 전월 12일 ~ 당월 11일이다. 이걸 실적
// 구간으로 쓰면 실거래에서 판정이 뒤집혔다.
//
//   2026-02 기준, 실적조건 400,000원
//     마감일(11일) 기준 구간 01-12 ~ 02-11  →  321,394원  "미달"
//     전월 달력월     구간 01-01 ~ 01-31  →  403,054원  "충족"
//
// 사용자는 자격을 채웠는데 앱이 "실적을 못 채웠어요" 라고 말하고 그 카드를
// 추천에서 떨어뜨린다. 아래는 그 금액을 그대로 재현한 회귀 테스트다.
describe('E. 결제일 25일 카드 — 실사용 회귀', () => {
  const SAMSUNG = { statement_close_day: 11, billing_cycle_day: 25, prev_month_threshold: 400000 };

  // 실거래에서 뽑은 분포를 금액만 남겨 재구성한다.
  //   1/1 ~ 1/11 에 81,660원, 1/12 ~ 1/31 에 321,394원.
  const TX = [
    { date: '2026-01-05', amount: 81660, origin: 'manual', major_type: '선택지출' },
    { date: '2026-01-20', amount: 321394, origin: 'manual', major_type: '선택지출' },
  ];

  test('E-1. 청구 이용기간이 아니라 달력월로 잰다', () => {
    const r = computeThreshold({ cardProduct: SAMSUNG, transactions: TX, asOf: '2026-02-20' });

    assert.deepEqual(r.period, { start: '2026-01-01', end: '2026-01-31' });
    assert.equal(r.spend, 403054, '1월 초 결제가 구간에서 빠졌다 — 청구기간으로 쟀다');
  });

  test('E-2. 실적을 채운 것으로 판정한다', () => {
    const r = computeThreshold({ cardProduct: SAMSUNG, transactions: TX, asOf: '2026-02-20' });

    assert.equal(r.met, true, '자격을 채웠는데 미달로 판정했다');
    assert.equal(r.shortfall, 0);
  });

  test('E-3. 결제일을 바꿔도 판정이 안 흔들린다', () => {
    // 결제일은 언제 갚느냐일 뿐이다. 자격 판정을 건드리면 안 된다.
    for (const pay of [12, 13, 14, 15, 25, null]) {
      const r = computeThreshold({
        cardProduct: { ...SAMSUNG, billing_cycle_day: pay, statement_close_day: pay ? pay - 14 : null },
        transactions: TX, asOf: '2026-02-20',
      });
      assert.equal(r.met, true, `결제일 ${pay} 에서 판정이 뒤집혔다`);
      assert.equal(r.spend, 403054, `결제일 ${pay} 에서 금액이 달라졌다`);
    }
  });
});
