'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { computeBalance, availableAmount } = require('../src/services/accountBalance');

describe('잔액 계산', () => {
  test('입금만 있으면 더해진다', () => {
    const account = { id: 1, opening_balance: 1000, opening_date: '2023-01-01', credit_limit: null };
    const transactions = [
      { date: '2023-01-02', amount: 500, direction: 'in' },
      { date: '2023-01-03', amount: 300, direction: 'in' },
    ];
    const result = computeBalance(account, transactions);
    assert.strictEqual(result.balance, 1800);
    assert.strictEqual(result.counted, 2);
    assert.strictEqual(result.skipped, 0);
  });

  test('출금만 있으면 빠진다', () => {
    const account = { id: 1, opening_balance: 1000, opening_date: '2023-01-01', credit_limit: null };
    const transactions = [
      { date: '2023-01-02', amount: 500, direction: 'out' },
      { date: '2023-01-03', amount: 300, direction: 'out' },
    ];
    const result = computeBalance(account, transactions);
    assert.strictEqual(result.balance, 200);
    assert.strictEqual(result.counted, 2);
    assert.strictEqual(result.skipped, 0);
  });

  test('입출금이 섞이면 상계된다', () => {
    const account = { id: 1, opening_balance: 1000, opening_date: '2023-01-01', credit_limit: null };
    const transactions = [
      { date: '2023-01-02', amount: 500, direction: 'in' },
      { date: '2023-01-03', amount: 300, direction: 'out' },
      { date: '2023-01-04', amount: 200, direction: 'in' },
    ];
    const result = computeBalance(account, transactions);
    assert.strictEqual(result.balance, 1400);
    assert.strictEqual(result.counted, 3);
    assert.strictEqual(result.skipped, 0);
  });

  test('거래가 없으면 opening_balance 그대로다', () => {
    const account = { id: 1, opening_balance: 1000, opening_date: '2023-01-01', credit_limit: null };
    const transactions = [];
    const result = computeBalance(account, transactions);
    assert.strictEqual(result.balance, 1000);
    assert.strictEqual(result.counted, 0);
    assert.strictEqual(result.skipped, 0);
  });

  test('counted 가 실제 계산에 넣은 건수와 같다', () => {
    const account = { id: 1, opening_balance: 1000, opening_date: '2023-01-01', credit_limit: null };
    const transactions = [
      { date: '2023-01-02', amount: 500, direction: 'in' },
      { date: '2023-01-03', amount: 300, direction: 'out' },
    ];
    const result = computeBalance(account, transactions);
    assert.strictEqual(result.counted, 2);
  });
});

describe('opening_date 경계', () => {
  test('opening_date 이전 거래는 건너뛴다', () => {
    const account = { id: 1, opening_balance: 1000, opening_date: '2023-01-03', credit_limit: null };
    const transactions = [
      { date: '2023-01-01', amount: 500, direction: 'in' },
      { date: '2023-01-02', amount: 300, direction: 'out' },
      { date: '2023-01-03', amount: 200, direction: 'in' },
    ];
    const result = computeBalance(account, transactions);
    assert.strictEqual(result.balance, 1200);
    assert.strictEqual(result.counted, 1);
    assert.strictEqual(result.skipped, 2);
  });

  test('opening_date 당일 거래는 포함한다', () => {
    const account = { id: 1, opening_balance: 1000, opening_date: '2023-01-03', credit_limit: null };
    const transactions = [
      { date: '2023-01-03', amount: 500, direction: 'in' },
    ];
    const result = computeBalance(account, transactions);
    assert.strictEqual(result.balance, 1500);
    assert.strictEqual(result.counted, 1);
    assert.strictEqual(result.skipped, 0);
  });

  test('건너뛴 건수가 skipped 에 잡힌다', () => {
    const account = { id: 1, opening_balance: 1000, opening_date: '2023-01-03', credit_limit: null };
    const transactions = [
      { date: '2023-01-01', amount: 500, direction: 'in' },
      { date: '2023-01-02', amount: 300, direction: 'out' },
    ];
    const result = computeBalance(account, transactions);
    assert.strictEqual(result.skipped, 2);
  });
});

describe('잘못된 입력', () => {
  test('amount 가 문자열이면 0 으로 본다', () => {
    const account = { id: 1, opening_balance: 1000, opening_date: '2023-01-01', credit_limit: null };
    const transactions = [
      { date: '2023-01-02', amount: 'abc', direction: 'in' },
    ];
    const result = computeBalance(account, transactions);
    assert.strictEqual(result.balance, 1000);
    assert.strictEqual(result.counted, 1);
    assert.strictEqual(result.skipped, 0);
  });

  test('date 형식이 틀린 거래는 건너뛴다', () => {
    const account = { id: 1, opening_balance: 1000, opening_date: '2023-01-01', credit_limit: null };
    const transactions = [
      { date: '2023-01-02', amount: 500, direction: 'in' },
      { date: 'invalid-date', amount: 300, direction: 'out' },
    ];
    const result = computeBalance(account, transactions);
    assert.strictEqual(result.balance, 1500);
    assert.strictEqual(result.counted, 1);
    assert.strictEqual(result.skipped, 1);
  });

  test('transactions 가 배열이 아니면 opening_balance 를 그대로 돌려준다', () => {
    const account = { id: 1, opening_balance: 1000, opening_date: '2023-01-01', credit_limit: null };
    const transactions = 'not-an-array';
    const result = computeBalance(account, transactions);
    assert.strictEqual(result.balance, 1000);
    assert.strictEqual(result.counted, 0);
    assert.strictEqual(result.skipped, 0);
  });

  test('원본 배열이 변형되지 않는다', () => {
    const account = { id: 1, opening_balance: 1000, opening_date: '2023-01-01', credit_limit: null };
    const originalTransactions = [
      { date: '2023-01-02', amount: 500, direction: 'in' },
    ];
    const transactions = [...originalTransactions];
    computeBalance(account, transactions);
    assert.deepStrictEqual(transactions, originalTransactions);
  });
});

describe('가용 금액', () => {
  test('credit_limit 이 있으면 잔액에 더해진다', () => {
    const account = { id: 1, opening_balance: 1000, opening_date: '2023-01-01', credit_limit: 500 };
    const balance = 100;
    const result = availableAmount(account, balance);
    assert.strictEqual(result, 600);
  });

  test('credit_limit 이 없으면 잔액 그대로다', () => {
    const account = { id: 1, opening_balance: 1000, opening_date: '2023-01-01', credit_limit: null };
    const balance = 100;
    const result = availableAmount(account, balance);
    assert.strictEqual(result, 100);
  });

  test('잔액이 음수여도 한도 안이면 가용 금액은 양수다', () => {
    const account = { id: 1, opening_balance: 1000, opening_date: '2023-01-01', credit_limit: 500 };
    const balance = -100;
    const result = availableAmount(account, balance);
    assert.strictEqual(result, 400);
  });
});
