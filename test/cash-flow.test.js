const { test, describe, before } = require('node:test');
const assert = require('node:assert');

let cashFlow, flowColor, FLOW_TYPES, REST_KEY;

before(async () => {
  ({ cashFlow, flowColor, FLOW_TYPES, REST_KEY } = await import('../client/src/lib/cashFlow.js'));
});

const rows = (o) => Object.entries(o).map(([major_type, total]) => ({ major_type, total }));

describe('cashFlow 집계', () => {
  test('수입에서 지출 대분류를 뺀 나머지가 남은 돈이다', () => {
    const f = cashFlow(rows({ 고정지출: 400000, 변동필수: 200000 }), 1000000);
    assert.strictEqual(f.spent, 600000);
    assert.strictEqual(f.rest, 400000);
    assert.strictEqual(f.overspent, 0);
  });

  test('수입과 흐름이 아닌 대분류는 갈래로 세지 않는다', () => {
    // '수입' 은 흐름의 출발점이지 갈래가 아니고, '미분류' 에 자리를 주면
    // "어디로 갔나" 의 답이 "모름" 이 되어버린다.
    const f = cashFlow(rows({ 수입: 999999, 미분류: 50000, 고정지출: 100000 }), 500000);
    assert.strictEqual(f.spent, 100000);
    assert.deepStrictEqual(f.nodes.map((n) => n.key), ['고정지출', REST_KEY]);
  });

  test('금액이 0 인 대분류는 밴드를 만들지 않는다', () => {
    const f = cashFlow(rows({ 고정지출: 100000, 저축: 0 }), 300000);
    assert.ok(!f.nodes.some((n) => n.key === '저축'));
  });

  test('밴드 순서는 FLOW_TYPES 순서를 따르고 남은 돈이 마지막이다', () => {
    const f = cashFlow(rows({ 저축: 1, 고정지출: 1, 선택지출: 1, 부채상환: 1, 변동필수: 1 }), 100);
    assert.deepStrictEqual(f.nodes.map((n) => n.key), [...FLOW_TYPES, REST_KEY]);
  });
});

describe('지출이 수입을 넘긴 달', () => {
  test('남은 돈은 음수가 아니라 0 이고 초과분은 따로 나온다', () => {
    // 음수 밴드는 그릴 수 없고, 그리더라도 "마이너스만큼의 돈이 흘렀다" 는
    // 잘못된 상을 준다. 초과분은 문구가 담당한다.
    const f = cashFlow(rows({ 고정지출: 800000, 선택지출: 400000 }), 1000000);
    assert.strictEqual(f.rest, 0);
    assert.strictEqual(f.overspent, 200000);
    assert.ok(!f.nodes.some((n) => n.key === REST_KEY));
  });

  test('비율 합이 1 을 넘지 않는다', () => {
    // 분모를 수입으로 잡으면 합이 100% 를 넘어 스택 바가 넘쳐난다.
    const f = cashFlow(rows({ 고정지출: 800000, 선택지출: 400000 }), 1000000);
    const sum = f.nodes.reduce((s, n) => s + n.share, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `share 합이 ${sum}`);
  });

  test('수입이 0 이어도 지출 밴드는 그려진다', () => {
    const f = cashFlow(rows({ 고정지출: 50000 }), 0);
    assert.strictEqual(f.income, 0);
    assert.strictEqual(f.overspent, 50000);
    assert.strictEqual(f.nodes.length, 1);
    assert.strictEqual(f.nodes[0].share, 1);
  });
});

describe('방어적 입력 처리', () => {
  test('빈 입력이면 그릴 것이 없다', () => {
    for (const arg of [null, undefined, [], 'not an array']) {
      const f = cashFlow(arg, 0);
      assert.strictEqual(f.nodes.length, 0);
      assert.strictEqual(f.spent, 0);
    }
  });

  test('숫자가 아닌 금액과 음수는 0 으로 흘린다', () => {
    const f = cashFlow(
      [{ major_type: '고정지출', total: 'abc' }, { major_type: '저축', total: -5000 }, null],
      100000
    );
    assert.strictEqual(f.spent, 0);
    assert.strictEqual(f.rest, 100000);
  });

  test('음수 수입은 0 으로 본다', () => {
    assert.strictEqual(cashFlow([], -1).income, 0);
  });
});

describe('색은 차트 안에서만 산다', () => {
  test('여섯 갈래와 남은 돈이 서로 다른 토큰을 받는다', () => {
    const keys = [...FLOW_TYPES, REST_KEY];
    const colors = keys.map(flowColor);
    assert.strictEqual(new Set(colors).size, keys.length);
    for (const c of colors) assert.match(c, /^var\(--color-flow-[a-z]+\)$/);
  });

  test('모르는 키는 무채색으로 흘린다', () => {
    assert.strictEqual(flowColor('없는대분류'), 'var(--color-flow-rest)');
  });

  test('남은 돈은 지출이 아니므로 무채색이다', () => {
    assert.strictEqual(flowColor(REST_KEY), 'var(--color-flow-rest)');
  });
});
