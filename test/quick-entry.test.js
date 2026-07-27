const { test, describe, before } = require('node:test');
const assert = require('node:assert');

let remainingBudget, toSpentMap, trapIndex;

before(async () => {
  ({ remainingBudget, toSpentMap, trapIndex } = await import('../client/src/lib/quickEntry.js'));
});

describe('quickEntry', () => {
  describe('remainingBudget', () => {
    describe('show false 경우', () => {
      const category = { name: '테스트', major_type: '선택지출', monthly_budget: 100000 };
      const spentByCategory = {};

      test('category가 null일 때', () => {
        const result = remainingBudget(null, spentByCategory);
        assert.strictEqual(result.show, false);
        assert.strictEqual(result.level, 'none');
        assert.strictEqual(result.remaining, 0);
      });

      test('major_type이 "수입"일 때', () => {
        const result = remainingBudget({ ...category, major_type: '수입' }, spentByCategory);
        assert.strictEqual(result.show, false);
        assert.strictEqual(result.level, 'none');
        assert.strictEqual(result.remaining, 0);
      });

      test('monthly_budget이 0일 때', () => {
        const result = remainingBudget({ ...category, monthly_budget: 0 }, spentByCategory);
        assert.strictEqual(result.show, false);
        assert.strictEqual(result.level, 'none');
        assert.strictEqual(result.remaining, 0);
      });

      test('monthly_budget이 null일 때', () => {
        const result = remainingBudget({ ...category, monthly_budget: null }, spentByCategory);
        assert.strictEqual(result.show, false);
        assert.strictEqual(result.level, 'none');
        assert.strictEqual(result.remaining, 0);
      });

      test('monthly_budget이 음수일 때', () => {
        const result = remainingBudget({ ...category, monthly_budget: -1000 }, spentByCategory);
        assert.strictEqual(result.show, false);
        assert.strictEqual(result.level, 'none');
        assert.strictEqual(result.remaining, 0);
      });
    });

    describe('단계 경계', () => {
      const category = { name: '외식·카페', major_type: '선택지출', monthly_budget: 100000 };
      const testCases = [
        { spentByCategory: {}, level: 'normal', remaining: 100000, over: 0 },
        { spentByCategory: { '외식·카페': 79000 }, level: 'normal', remaining: 21000, over: 0 },
        { spentByCategory: { '외식·카페': 80000 }, level: 'caution', remaining: 20000, over: 0 },
        { spentByCategory: { '외식·카페': 100000 }, level: 'caution', remaining: 0, over: 0 },
        { spentByCategory: { '외식·카페': 100001 }, level: 'over', remaining: 0, over: 1 },
        { spentByCategory: { '외식·카페': 150000 }, level: 'over', remaining: 0, over: 50000 },
        { spentByCategory: { '다른카테고리': 999999 }, level: 'normal', remaining: 100000, over: 0 },
      ];

      for (const { spentByCategory, level, remaining, over } of testCases) {
        test(`spentByCategory: ${JSON.stringify(spentByCategory)} => level: ${level}`, () => {
          const result = remainingBudget(category, spentByCategory);
          assert.strictEqual(result.show, true);
          assert.strictEqual(result.level, level);
          assert.strictEqual(result.remaining, remaining);
          assert.strictEqual(result.over, over);
          assert.strictEqual(result.budget, 100000);
        });
      }
    });
  });

  describe('toSpentMap', () => {
    test('기본 동작', () => {
      const input = [
        { category: 'A', total: 100 },
        { category: 'B', total: 200 }
      ];
      const expected = { A: 100, B: 200 };
      const result = toSpentMap(input);
      assert.deepStrictEqual(result, expected);
    });

    test('같은 카테고리 합산', () => {
      const input = [
        { category: 'A', total: 100 },
        { category: 'A', total: 50 }
      ];
      const expected = { A: 150 };
      const result = toSpentMap(input);
      assert.deepStrictEqual(result, expected);
    });

    test('total이 문자열일 때 숫자로 변환', () => {
      const input = [
        { category: 'A', total: '100' }
      ];
      const expected = { A: 100 };
      const result = toSpentMap(input);
      assert.deepStrictEqual(result, expected);
    });

    test('category가 null인 항목은 건너뜀', () => {
      const input = [
        { category: 'A', total: 100 },
        { category: null, total: 200 }
      ];
      const expected = { A: 100 };
      const result = toSpentMap(input);
      assert.deepStrictEqual(result, expected);
    });

    test('null/undefined/배열이 아닌 값은 빈 객체 반환', () => {
      assert.deepStrictEqual(toSpentMap(null), {});
      assert.deepStrictEqual(toSpentMap(undefined), {});
      assert.deepStrictEqual(toSpentMap('string'), {});
      assert.deepStrictEqual(toSpentMap(123), {});
    });
  });

  describe('trapIndex', () => {
    const testCases = [
      { current: 0, count: 5, backwards: false, expected: 1 },
      { current: 4, count: 5, backwards: false, expected: 0 },
      { current: 0, count: 5, backwards: true, expected: 4 },
      { current: 3, count: 5, backwards: true, expected: 2 },
      { current: -1, count: 5, backwards: false, expected: 0 },
      { current: -1, count: 5, backwards: true, expected: 4 },
      { current: 0, count: 0, backwards: false, expected: -1 },
      { current: 0, count: 1, backwards: false, expected: 0 },
    ];

    for (const { current, count, backwards, expected } of testCases) {
      test(`current: ${current}, count: ${count}, backwards: ${backwards} => ${expected}`, () => {
        const result = trapIndex(current, count, backwards);
        assert.strictEqual(result, expected);
      });
    }
  });
});
