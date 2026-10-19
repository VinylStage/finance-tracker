'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { installmentBillings } = require('../../src/services/advisor/installmentBillings');

test('파생 회차가 있으면 그 행을 그대로 쓴다', () => {
  const result = installmentBillings({ 
    derived: [ 
      { installment_id: 1, ym: '2026-10', amount: 98704, card: '현대카드' }, 
      { installment_id: 1, ym: '2026-11', amount: 98696, card: '현대카드' } 
    ], 
    installments: [ 
      { id: 1, amount: 98696, months: 12, start_month: '2026-10', card: '현대카드' } 
    ] 
  });
  assert.deepStrictEqual(result, [
    { ym: '2026-10', card: '현대카드', amount: 98704 }, 
    { ym: '2026-11', card: '현대카드', amount: 98696 }
  ]);
});

test('파생 회차가 없으면 할부 테이블로 계산한다', () => {
  const result = installmentBillings({ 
    derived: [], 
    installments: [ 
      { id: 2, amount: 35000, months: 3, start_month: '2026-11', card: '롯데카드' } 
    ] 
  });
  assert.deepStrictEqual(result, [
    { ym: '2026-11', card: '롯데카드', amount: 35000 }, 
    { ym: '2026-12', card: '롯데카드', amount: 35000 }, 
    { ym: '2027-01', card: '롯데카드', amount: 35000 }
  ]);
});

test('두 경로가 섞여도 한 할부는 한 번만 잡힌다', () => {
  const result = installmentBillings({ 
    derived: [ 
      { installment_id: 1, ym: '2026-10', amount: 98704, card: '현대카드' } 
    ], 
    installments: [ 
      { id: 1, amount: 98696, months: 12, start_month: '2026-10', card: '현대카드' }, 
      { id: 2, amount: 50000, months: 2, start_month: '2026-11', card: '롯데카드' } 
    ] 
  });
  assert.deepStrictEqual(result, [
    { ym: '2026-10', card: '현대카드', amount: 98704 }, 
    { ym: '2026-11', card: '롯데카드', amount: 50000 }, 
    { ym: '2026-12', card: '롯데카드', amount: 50000 }
  ]);
});

test('연도 경계를 넘긴다', () => {
  const result = installmentBillings({ 
    derived: [], 
    installments: [ 
      { id: 3, amount: 1000, months: 3, start_month: '2026-12', card: 'A' } 
    ] 
  });
  assert.deepStrictEqual(result.map(r => r.ym), ['2026-12', '2027-01', '2027-02']);
});

test('입력이 비면 빈 배열', () => {
  const result1 = installmentBillings({ derived: [], installments: [] });
  assert.deepStrictEqual(result1, []);
  
  const result2 = installmentBillings({});
  assert.deepStrictEqual(result2, []);
});

test('개월 수가 0 이면 아무것도 만들지 않는다', () => {
  const result = installmentBillings({ 
    derived: [], 
    installments: [ 
      { id: 4, amount: 1000, months: 0, start_month: '2026-11', card: 'A' } 
    ] 
  });
  assert.deepStrictEqual(result, []);
});

test('파생 회차의 금액이 달마다 달라도 그대로 둔다', () => {
  const result = installmentBillings({ 
    derived: [ 
      { installment_id: 5, ym: '2026-10', amount: 36734, card: '롯데카드' }, 
      { installment_id: 5, ym: '2026-11', amount: 34358, card: '롯데카드' }, 
      { installment_id: 5, ym: '2026-12', amount: 33691, card: '롯데카드' } 
    ], 
    installments: [] 
  });
  assert.deepStrictEqual(result.map(r => r.amount), [36734, 34358, 33691]);
});

test('결과 원소는 세 필드뿐이다', () => {
  const result = installmentBillings({ 
    derived: [], 
    installments: [ 
      { id: 2, amount: 35000, months: 3, start_month: '2026-11', card: '롯데카드' } 
    ] 
  });
  assert.deepStrictEqual(Object.keys(result[0]).sort(), ['amount', 'card', 'ym']);
});
