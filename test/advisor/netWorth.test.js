'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { savingsBalanceAt, netWorthTimeline } = require('../../src/services/advisor/netWorth');

test('시작 전 달은 0', () => {
  const S = (o) => ({ monthly_contribution: 500000, start_date: '2026-10-01', maturity_date: null, status: '진행중', ...o });
  assert.strictEqual(savingsBalanceAt([S()], '2026-09'), 0);
});

test('시작월부터 누적', () => {
  const S = (o) => ({ monthly_contribution: 500000, start_date: '2026-10-01', maturity_date: null, status: '진행중', ...o });
  assert.strictEqual(savingsBalanceAt([S()], '2026-10'), 500000);
  assert.strictEqual(savingsBalanceAt([S()], '2026-12'), 1500000);
});

test('만기월에서 멈춤', () => {
  const S = (o) => ({ monthly_contribution: 500000, start_date: '2026-10-01', maturity_date: null, status: '진행중', ...o });
  assert.strictEqual(savingsBalanceAt([S({ maturity_date: '2026-11-15' })], '2026-11'), 1000000);
  assert.strictEqual(savingsBalanceAt([S({ maturity_date: '2026-11-15' })], '2027-01'), 1000000);
});

test('진행중이 아니면 제외', () => {
  const S = (o) => ({ monthly_contribution: 500000, start_date: '2026-10-01', maturity_date: null, status: '진행중', ...o });
  assert.strictEqual(savingsBalanceAt([S({ status: '해지' })], '2026-12'), 0);
});

test('여러 상품 합', () => {
  const S = (o) => ({ monthly_contribution: 500000, start_date: '2026-10-01', maturity_date: null, status: '진행중', ...o });
  assert.strictEqual(savingsBalanceAt([S(), S({ monthly_contribution: 100000, start_date: '2026-11-20' })], '2026-11'), 1100000);
});

test('연도 경계', () => {
  const S = (o) => ({ monthly_contribution: 500000, start_date: '2026-10-01', maturity_date: null, status: '진행중', ...o });
  assert.strictEqual(savingsBalanceAt([S({ start_date: '2026-11-01' })], '2027-02'), 2000000);
});

test('시작일의 "일"은 무관', () => {
  const S = (o) => ({ monthly_contribution: 500000, start_date: '2026-10-01', maturity_date: null, status: '진행중', ...o });
  assert.strictEqual(savingsBalanceAt([S({ start_date: '2026-10-31' })], '2026-10'), 500000);
});

test('부채·적금 없으면 순자산 = 현금', () => {
  const result = netWorthTimeline([
    { month: '2026-10', balance: 1000 },
    { month: '2026-11', balance: 2000 }
  ]);
  assert.deepStrictEqual(result, [
    { month: '2026-10', cash: 1000, savings: 0, debt: 0, netWorth: 1000 },
    { month: '2026-11', cash: 2000, savings: 0, debt: 0, netWorth: 2000 }
  ]);
});

test('실데이터 모양 한 달', () => {
  const result = netWorthTimeline(
    [{ month: '2026-10', inflow: 1, outflow: 2, net: 3, balance: 1973922, partial: true }],
    { debts: [{ balance: 99100000 }], savings: [ { monthly_contribution: 500000, start_date: '2026-10-01', maturity_date: null, status: '진행중' } ] }
  );
  assert.deepStrictEqual(result, [
    { month: '2026-10', cash: 1973922, savings: 500000, debt: 99100000, netWorth: -96626078 }
  ]);
});

test('부채 합은 모든 달에 같고 입력은 그대로', () => {
  const tl = [{ month: '2026-10', balance: 0 }, { month: '2026-11', balance: 0 }];
  const before = JSON.stringify(tl);
  const result = netWorthTimeline(tl, { debts: [{ balance: 99100000 }, { balance: 900000 }] });
  assert.strictEqual(result[0].debt, 100000000);
  assert.strictEqual(result[1].debt, 100000000);
  assert.strictEqual(result[0].netWorth, -100000000);
  assert.strictEqual(result[1].netWorth, -100000000);
  assert.strictEqual(JSON.stringify(tl), before);
});
