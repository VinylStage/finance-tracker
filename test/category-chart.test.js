const { test, describe, before } = require('node:test');
const assert = require('node:assert');

let capTopCategories, shareOf, OTHERS_LABEL;

before(async () => {
  ({ capTopCategories, shareOf, OTHERS_LABEL } = await import('../client/src/lib/categoryChart.js'));
});

const make = (n) => Array.from({ length: n }, (_, i) => ({ category: `C${i + 1}`, total: (n - i) * 1000 }));

describe('capTopCategories', () => {
  test('A. 캡핑 경계', () => {
    // 0개 입력
    let result = capTopCategories(make(0));
    assert.strictEqual(result.slices.length, 0);
    assert.strictEqual(result.others.length, 0);

    // 1개 입력
    result = capTopCategories(make(1));
    assert.strictEqual(result.slices.length, 1);
    assert.strictEqual(result.slices[0].category, 'C1');
    assert.strictEqual(result.others.length, 0);

    // 5개 입력 (경계: 5개는 기타 없음)
    result = capTopCategories(make(5));
    assert.strictEqual(result.slices.length, 5);
    assert.strictEqual(result.slices[result.slices.length - 1].category !== OTHERS_LABEL, true);
    assert.strictEqual(result.others.length, 0);

    // 6개 입력 (경계: 6개부터 기타 있음)
    result = capTopCategories(make(6));
    assert.strictEqual(result.slices.length, 6);
    assert.strictEqual(result.slices[result.slices.length - 1].category === OTHERS_LABEL, true);
    assert.strictEqual(result.others.length, 1);

    // 7개 입력
    result = capTopCategories(make(7));
    assert.strictEqual(result.slices.length, 6);
    assert.strictEqual(result.slices[result.slices.length - 1].category === OTHERS_LABEL, true);
    assert.strictEqual(result.others.length, 2);

    // 10개 입력
    result = capTopCategories(make(10));
    assert.strictEqual(result.slices.length, 6);
    assert.strictEqual(result.slices[result.slices.length - 1].category === OTHERS_LABEL, true);
    assert.strictEqual(result.others.length, 5);
  });

  test('B. 합계 보존', () => {
    const input = make(10);
    const result = capTopCategories(input);

    const inputTotal = input.reduce((sum, r) => sum + Number(r.total || 0), 0);
    const slicesTotal = result.slices.reduce((sum, r) => sum + Number(r.total || 0), 0);
    const othersTotal = result.others.reduce((sum, r) => sum + Number(r.total || 0), 0);

    assert.strictEqual(slicesTotal, inputTotal);
    assert.strictEqual(result.othersTotal, othersTotal);
  });

  test('C. 정렬', () => {
    // 입력이 오름차순이어도 결과는 내림차순
    const input = [
      { category: 'A', total: 100 },
      { category: 'B', total: 900 },
      { category: 'C', total: 500 }
    ];
    const result = capTopCategories(input);
    assert.deepStrictEqual(result.slices.map(s => s.category), ['B', 'C', 'A']);

    // 배열 순서를 뒤집어 넣어도 금액 기준 상위 5개가 조각으로 남아야 한다.
    // reverse() 는 배열 순서만 바꾼다 — C1 은 여전히 7000원, C7 은 여전히 1000원이다.
    const input2 = make(7).reverse(); // 금액 오름차순으로 나열된 배열
    const result2 = capTopCategories(input2);
    assert.deepStrictEqual(result2.slices.map(s => s.category), ['C1', 'C2', 'C3', 'C4', 'C5', OTHERS_LABEL]);
    // 하위 2개(C6=2000, C7=1000)가 기타로 합쳐진다
    assert.deepStrictEqual(result2.others.map(s => s.category), ['C6', 'C7']);
    assert.strictEqual(result2.othersTotal, 3000);
  });

  test('D. 방어', () => {
    // null 입력
    let result = capTopCategories(null);
    assert.deepStrictEqual(result.slices, []);
    assert.strictEqual(result.othersTotal, 0);

    // undefined 입력
    result = capTopCategories(undefined);
    assert.deepStrictEqual(result.slices, []);
    assert.strictEqual(result.othersTotal, 0);

    // null 카테고리 필터링
    const input = [
      { category: null, total: 5 },
      { category: 'A', total: 1 }
    ];
    result = capTopCategories(input);
    assert.strictEqual(result.slices.length, 1);
    assert.strictEqual(result.slices[0].category, 'A');

    // 원본 배열 변형 방지
    const original = [{ category: 'C1', total: 1000 }, { category: 'C2', total: 2000 }];
    const originalCopy = [...original];
    capTopCategories(original);
    assert.deepStrictEqual(original, originalCopy);
  });
});

describe('shareOf', () => {
  test('E. shareOf 값 계산', () => {
    assert.strictEqual(shareOf(25, 100), 0.25);
    assert.strictEqual(shareOf(0, 100), 0);
    assert.strictEqual(shareOf(50, 0), 0);
    assert.strictEqual(shareOf(50, null), 0);
  });
});
