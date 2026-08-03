'use strict';
const { test, describe, before } = require('node:test');
const assert = require('node:assert');

// 클라이언트 lib 의 순수 함수는 루트 러너에서 본다(heatmap/cash-flow 와 같은 방식).
// vitest 는 컴포넌트용이고, DOM 이 필요 없는 계산까지 그쪽에 두면 같은 성격의
// 테스트가 두 러너에 흩어진다.
let groupToRanges, rangeLabel, describePolicy, describePeriod, fieldsFor, signatureOf;

before(async () => {
  ({ groupToRanges, rangeLabel, describePolicy, describePeriod, fieldsFor, signatureOf } =
    await import('../client/src/lib/cardPolicyRanges.js'));
});

// 저장은 개월수별 행이고 표시는 구간이다(#271). 묶는 규칙이 틀리면 사용자가
// 자기가 넣은 카드사 안내와 다른 것을 보게 된다.
const row = (months, over = {}) => ({
  id: months, payment_method_id: 1, months,
  policy_type: '무이자', annual_rate: 0, free_from_sequence: 0,
  effective_from: '2026-01-01', effective_to: null, memo: null,
  ...over,
});

describe('groupToRanges', () => {
  test('연속된 같은 정책을 한 구간으로 묶는다', () => {
    const ranges = groupToRanges([row(2), row(3), row(4)]);
    assert.strictEqual(ranges.length, 1);
    assert.strictEqual(ranges[0].from_month, 2);
    assert.strictEqual(ranges[0].to_month, 4);
    assert.deepStrictEqual(ranges[0].ids, [2, 3, 4]);
  });

  test('개월수가 끊기면 구간도 끊는다', () => {
    // 이어 붙이면 4~6개월에 정책이 있는 것처럼 보인다.
    const ranges = groupToRanges([row(2), row(3), row(7)]);
    assert.deepStrictEqual(ranges.map((r) => [r.from_month, r.to_month]), [[2, 3], [7, 7]]);
  });

  test('정책 내용이 다르면 붙어 있어도 나눈다', () => {
    const ranges = groupToRanges([
      row(2), row(3),
      row(4, { policy_type: '유이자', annual_rate: 15.9 }),
    ]);
    assert.strictEqual(ranges.length, 2);
    assert.strictEqual(ranges[1].policy_type, '유이자');
  });

  test('적용 기간이 다르면 나눈다', () => {
    // 같은 개월수라도 연도가 바뀌면 별개 정책이다. 묶으면 언제부터 적용되는
    // 규칙인지가 사라진다.
    const ranges = groupToRanges([row(2), row(3), row(4, { effective_from: '2027-01-01' })]);
    assert.strictEqual(ranges.length, 2);
  });

  test('최근 적용분을 위에 둔다', () => {
    const ranges = groupToRanges([
      row(2, { effective_from: '2026-01-01' }),
      row(2, { id: 99, effective_from: '2027-01-01' }),
    ]);
    assert.strictEqual(ranges[0].effective_from, '2027-01-01');
  });

  test('빈 입력에도 깨지지 않는다', () => {
    assert.deepStrictEqual(groupToRanges([]), []);
    assert.deepStrictEqual(groupToRanges(null), []);
  });

  test('원본 배열을 바꾸지 않는다', () => {
    const rows = [row(3), row(2)];
    groupToRanges(rows);
    assert.deepStrictEqual(rows.map((r) => r.months), [3, 2]);
  });
});

describe('표시 문구', () => {
  test('한 달짜리 구간은 물결표를 쓰지 않는다', () => {
    assert.strictEqual(rangeLabel({ from_month: 6, to_month: 6 }), '6개월');
    assert.strictEqual(rangeLabel({ from_month: 2, to_month: 3 }), '2~3개월');
  });

  test('정책 종류별로 설명이 다르다', () => {
    assert.strictEqual(describePolicy({ policy_type: '무이자', annual_rate: 0, free_from_sequence: 0 }), '무이자');
    assert.strictEqual(describePolicy({ policy_type: '유이자', annual_rate: 15.9 }), '연 15.9%');
    // 카드사 안내 "4회차부터 면제" 를 그대로 되읽어 준다.
    assert.strictEqual(
      describePolicy({ policy_type: '부분무이자', annual_rate: 15.9, free_from_sequence: 4 }),
      '4회차부터 면제, 그 전은 연 15.9%'
    );
  });

  test('종료일이 없으면 "부터" 로 끝낸다', () => {
    // 내부적으로 무기한을 9999-12-31 로 다루지만 그건 화면에 나오면 안 된다.
    assert.strictEqual(describePeriod({ effective_from: '2026-01-01', effective_to: null }), '2026-01-01부터');
    assert.strictEqual(
      describePeriod({ effective_from: '2026-01-01', effective_to: '2026-12-31' }),
      '2026-01-01 ~ 2026-12-31'
    );
  });

  test('설명 문구에 내부 필드명이 없다', () => {
    const texts = [
      describePolicy({ policy_type: '부분무이자', annual_rate: 15.9, free_from_sequence: 4 }),
      describePeriod({ effective_from: '2026-01-01', effective_to: null }),
      rangeLabel({ from_month: 2, to_month: 3 }),
    ];
    for (const t of texts) {
      assert.ok(!/policy_type|annual_rate|free_from_sequence|effective_/.test(t), `내부 필드명 노출: ${t}`);
    }
  });
});

describe('정책 종류별 입력 노출', () => {
  const cases = [
    { type: '무이자', expect: { rate: false, free: false } },
    { type: '유이자', expect: { rate: true, free: false } },
    { type: '부분무이자', expect: { rate: true, free: true } },
    { type: '알수없음', expect: { rate: false, free: false } },
  ];
  for (const c of cases) {
    test(`${c.type}`, () => {
      assert.deepStrictEqual(fieldsFor(c.type), c.expect);
    });
  }
});

describe('signatureOf', () => {
  test('숫자와 문자열 숫자를 같게 본다', () => {
    // 서버는 REAL/INTEGER 로, 폼은 문자열로 준다. 다르게 보면 같은 정책이
    // 한 달씩 쪼개져 표시된다.
    assert.strictEqual(
      signatureOf(row(2, { annual_rate: 0 })),
      signatureOf(row(3, { annual_rate: '0' }))
    );
  });
});
