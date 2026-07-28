const { test, describe, before } = require('node:test');
const assert = require('node:assert');

let dailyBasis, heatLevel, heatClass, heatLabel, HEAT_CLASS;

before(async () => {
  ({ dailyBasis, heatLevel, heatClass, heatLabel, HEAT_CLASS } = await import('../client/src/lib/heatmap.js'));
});

describe('dailyBasis', () => {
  test('정상 계산', () => {
    assert.strictEqual(dailyBasis(300000, 30, 1000), 10000);
  });

  test('예산 0 일 때 폴백', () => {
    assert.strictEqual(dailyBasis(0, 30, 1000), 1000);
  });

  test('일수 0 일 때 폴백', () => {
    assert.strictEqual(dailyBasis(300000, 0, 1000), 1000);
  });

  test('폴백도 0 일 때 0', () => {
    assert.strictEqual(dailyBasis(0, 0, 0), 0);
  });

  test('문자열·null·undefined 입력', () => {
    assert.strictEqual(dailyBasis('300000', '30', null), 10000);
    assert.strictEqual(dailyBasis(null, undefined, '1000'), 1000);
  });
});

describe('heatLevel', () => {
  const basis = 10000;

  test('0단계: 무지출', () => {
    assert.strictEqual(heatLevel(0, basis), 0);
  });

  test('1단계: 기준의 0.5배 이하', () => {
    assert.strictEqual(heatLevel(5000, basis), 1);
    assert.strictEqual(heatLevel(4999, basis), 1);
    assert.strictEqual(heatLevel(5000, basis), 1);
  });

  test('2단계: 기준 이하', () => {
    assert.strictEqual(heatLevel(10000, basis), 2);
    assert.strictEqual(heatLevel(9999, basis), 2);
  });

  test('3단계: 기준의 2배 이하', () => {
    assert.strictEqual(heatLevel(20000, basis), 3);
    assert.strictEqual(heatLevel(19999, basis), 3);
  });

  test('4단계: 기준의 2배 초과', () => {
    assert.strictEqual(heatLevel(20001, basis), 4);
    assert.strictEqual(heatLevel(100000, basis), 4);
  });

  test('경계값 테스트 - 기준의 0.5배', () => {
    assert.strictEqual(heatLevel(5000, basis), 1);
    assert.strictEqual(heatLevel(5000, basis), 1);
  });

  test('경계값 테스트 - 기준', () => {
    assert.strictEqual(heatLevel(10000, basis), 2);
    assert.strictEqual(heatLevel(10000, basis), 2);
  });

  test('경계값 테스트 - 기준의 2배', () => {
    assert.strictEqual(heatLevel(20000, basis), 3);
    assert.strictEqual(heatLevel(20000, basis), 3);
  });

  test('basis 가 0 이면 금액과 무관하게 0', () => {
    assert.strictEqual(heatLevel(100000, 0), 0);
    assert.strictEqual(heatLevel(0, 0), 0);
  });
});

describe('heatClass', () => {
  test('각 단계가 HEAT_CLASS 의 해당 원소와 같은지', () => {
    assert.strictEqual(heatClass(0, 10000), HEAT_CLASS[0]);
    assert.strictEqual(heatClass(5000, 10000), HEAT_CLASS[1]);
    assert.strictEqual(heatClass(10000, 10000), HEAT_CLASS[2]);
    assert.strictEqual(heatClass(20000, 10000), HEAT_CLASS[3]);
    assert.strictEqual(heatClass(30000, 10000), HEAT_CLASS[4]);
  });
});

describe('heatLabel', () => {
  test('0단계 문자열', () => {
    assert.strictEqual(heatLabel(0, 10000), '지출 없음');
  });

  test('배수 표기가 소수점 한 자리인지', () => {
    assert.strictEqual(heatLabel(15000, 10000), '기준의 1.5배');
    assert.strictEqual(heatLabel(25000, 10000), '기준의 2.5배');
  });

  test('기준선이 없으면 배수를 말하지 않는다', () => {
    // 0 으로 나눠 `기준의 Infinity배` 가 나오던 자리. 라벨의 0단계 판정을
    // heatLevel 에 위임해 색과 문구가 갈라지지 않게 했다.
    assert.strictEqual(heatLabel(5000, 0), '지출 없음');
    assert.strictEqual(heatLabel(5000, -1), '지출 없음');
  });

  test('셀이 무채색이면 라벨도 지출 없음이다', () => {
    // 색(heatClass)과 문구(heatLabel)가 같은 판정을 공유하는지 확인한다.
    for (const [amount, basis] of [[0, 10000], [0, 0], [5000, 0], [-100, 10000]]) {
      assert.strictEqual(heatClass(amount, basis), HEAT_CLASS[0]);
      assert.strictEqual(heatLabel(amount, basis), '지출 없음');
    }
  });
});
