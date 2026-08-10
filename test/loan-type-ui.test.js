'use strict';
const { test, describe, before } = require('node:test');
const assert = require('node:assert');

// #329 — 부채 화면이 쓰는 순수 함수. 판정 기준이 loan_type 으로 옮겨졌는지가 핵심이다.
//
// 클라이언트 lib 의 순수 함수는 루트 러너에서 본다(heatmap/cash-flow 와 같은 방식).
let LOAN_TYPE_OPTIONS, loanTypeLabel, loanTypeFields, loanTypeHint, supportsProjection, creditUsageRatio;

before(async () => {
  ({ LOAN_TYPE_OPTIONS, loanTypeLabel, loanTypeFields, loanTypeHint, supportsProjection, creditUsageRatio } =
    await import('../client/src/lib/loanType.js'));
});

describe('A. 유형 정본', () => {
  test('A-1. 서버 LOAN_TYPES 와 같은 값을 쓴다', () => {
    // 화면이 유형 목록을 따로 만들면 서버가 거부하는 값을 고를 수 있게 된다.
    const { LOAN_TYPES } = require('../src/constants');
    assert.deepStrictEqual(
      LOAN_TYPE_OPTIONS.map((o) => o.value).sort(), [...LOAN_TYPES].sort(),
      '새 유형을 서버에 추가했으면 화면 목록도 함께 채워야 한다'
    );
  });

  test('A-2. 내부 값이 라벨로 새지 않는다', () => {
    for (const o of LOAN_TYPE_OPTIONS) {
      assert.ok(!/credit_line|general|loan_type/.test(o.label), `라벨에 내부 값 노출: ${o.label}`);
    }
  });

  test('A-3. 유형 라벨', () => {
    assert.strictEqual(loanTypeLabel('general'), '일반');
    assert.strictEqual(loanTypeLabel('credit_line'), '마이너스통장');
    assert.strictEqual(loanTypeLabel('알수없음'), '일반', '모르는 값은 기본 표기로 떨어진다');
  });
});

describe('B. 유형별 입력 노출', () => {
  test('B-1. 마이너스통장만 한도·이자결제일을 받는다', () => {
    assert.deepStrictEqual(loanTypeFields('credit_line'), { credit_limit: true, interest_day: true });
    assert.deepStrictEqual(loanTypeFields('general'), { credit_limit: false, interest_day: false });
  });

  test('B-2. 서버의 필수 필드와 어긋나지 않는다', () => {
    // 서버는 credit_line 에 credit_limit 을 요구한다. 화면이 그 칸을 안 띄우면
    // 사용자는 왜 저장이 안 되는지 알 수 없다.
    const { LOAN_TYPE_DEFAULTS } = require('../src/constants');
    for (const [type, spec] of Object.entries(LOAN_TYPE_DEFAULTS)) {
      for (const field of spec.requires) {
        assert.strictEqual(loanTypeFields(type)[field], true,
          `${type} 이 ${field} 를 요구하는데 화면이 입력을 안 띄운다`);
      }
    }
  });

  test('B-3. 유형별 안내에 내부 용어가 없다', () => {
    for (const t of ['general', 'credit_line']) {
      const hint = loanTypeHint(t);
      assert.ok(hint.length > 5);
      assert.ok(!/loan_type|credit_line|interest_basis|compounds|daily/.test(hint), hint);
    }
  });
});

describe('C. 기간 계산 지원 판정', () => {
  test('C-1. 서버가 내려준 계산 설정을 따른다', () => {
    // 화면이 유형 목록을 다시 만들면 서버와 어긋난다.
    assert.strictEqual(supportsProjection({ interest_settings: { interest_basis: 'daily' } }), true);
    assert.strictEqual(supportsProjection({ interest_settings: { interest_basis: 'monthly' } }), false);
  });

  test('C-2. 설정이 없으면 지원하지 않는 것으로 본다', () => {
    // 없는 정밀도를 만들어 내지 않는다.
    assert.strictEqual(supportsProjection({}), false);
    assert.strictEqual(supportsProjection(null), false);
  });
});

describe('D. 한도 사용률', () => {
  const cases = [
    { name: '실제 계좌 조건', input: { credit_limit: 4800000, used: 3566196 }, expected: 74.30 },
    { name: '한도 절반', input: { credit_limit: 1000000, used: 500000 }, expected: 50 },
    { name: '초과는 100 으로 자른다', input: { credit_limit: 1000000, used: 1500000 }, expected: 100 },
    { name: '음수 잔액은 0', input: { credit_limit: 1000000, used: -50000 }, expected: 0 },
    { name: '한도 없음', input: { credit_limit: 0, used: 100 }, expected: 0 },
    { name: 'null', input: null, expected: 0 },
  ];
  for (const c of cases) {
    test(`D. ${c.name}`, () => {
      assert.strictEqual(Math.round(creditUsageRatio(c.input) * 100) / 100, c.expected);
    });
  }
});
