'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { detectRecurringCandidates } = require('../src/services/recurrenceDetect');

// 반복 패턴 감지(#499).
//
// 이 함수의 어려운 점은 정확도가 아니라 **경계**다. 느슨하면 제안이 소음이 되어
// 사용자가 무시하게 되고, 빡빡하면 아무것도 안 뜬다. 둘 다 기능이 죽는 길이다.
//
// 그래서 여기서 잠그는 것은 "잘 찾는가" 가 아니라 **"안 찾아야 할 것을 안 찾는가"**
// 와 **"찾은 것을 사용자가 판단할 수 있게 말하는가"** 다.

function tx(date, amount, merchant, over = {}) {
  return { date, amount, merchant, category_id: 1, payment_method_id: 1, payment_style: '일시불', origin: 'manual', ...over };
}

describe('무엇을 패턴으로 보는가', () => {
  test('서로 다른 달에 3번이면 후보다', () => {
    const rows = [
      tx('2026-05-15', 17000, '넷플릭스'),
      tx('2026-06-15', 17000, '넷플릭스'),
      tx('2026-07-15', 17000, '넷플릭스'),
    ];

    const [c] = detectRecurringCandidates(rows);

    assert.strictEqual(c.merchant, '넷플릭스');
    assert.strictEqual(c.months, 3);
    assert.strictEqual(c.amount, 17000);
    assert.strictEqual(c.day_of_month, 15);
  });

  test('같은 달에 세 번은 반복이 아니라 단골이다', () => {
    // 이 구분이 없으면 자주 가는 편의점이 전부 "매달 반복" 으로 제안된다.
    const rows = [
      tx('2026-07-03', 4500, 'GS25'),
      tx('2026-07-11', 3200, 'GS25'),
      tx('2026-07-24', 5100, 'GS25'),
    ];

    assert.deepStrictEqual(detectRecurringCandidates(rows), []);
  });

  test('두 달만으로는 부족하다', () => {
    const rows = [tx('2026-06-10', 9900, '스포티파이'), tx('2026-07-10', 9900, '스포티파이')];

    assert.deepStrictEqual(detectRecurringCandidates(rows), []);
  });
});

describe('제안하지 말아야 할 것', () => {
  test('이미 규칙이 있는 가맹점은 안 올린다', () => {
    const rows = [
      tx('2026-05-01', 500000, '월세'), tx('2026-06-01', 500000, '월세'), tx('2026-07-01', 500000, '월세'),
    ];

    const out = detectRecurringCandidates(rows, { existingMerchants: ['월세'] });

    assert.deepStrictEqual(out, [], '규칙을 만든 직후 또 물어본다');
  });

  test('거절한 가맹점은 다시 안 묻는다', () => {
    // **거절 기억이 이 기능의 생사를 가른다.** "아니오" 를 눌렀는데 다음 달에 또
    // 물으면 사용자는 제안 자체를 무시하게 되고, 그러면 기능이 있으나 마나다.
    const rows = [
      tx('2026-05-20', 12000, '주차장'), tx('2026-06-20', 12000, '주차장'), tx('2026-07-20', 12000, '주차장'),
    ];

    const out = detectRecurringCandidates(rows, { dismissedMerchants: ['주차장'] });

    assert.deepStrictEqual(out, []);
  });

  test('파생 거래는 소비 습관이 아니다', () => {
    // 할부·리볼빙·반복거래가 만든 행은 계산 결과다. 이걸 패턴으로 보면
    // "할부 이자를 반복 규칙으로 등록하시겠어요" 같은 제안이 나온다.
    const rows = [
      tx('2026-05-01', 50000, '할부이자', { origin: 'installment' }),
      tx('2026-06-01', 50000, '할부이자', { origin: 'installment' }),
      tx('2026-07-01', 50000, '할부이자', { origin: 'installment' }),
    ];

    assert.deepStrictEqual(detectRecurringCandidates(rows), []);
  });

  test('가맹점명이 비었거나 금액이 0 이면 무시한다', () => {
    const rows = [
      tx('2026-05-01', 1000, ''), tx('2026-06-01', 1000, '   '), tx('2026-07-01', 1000, null),
      tx('2026-05-02', 0, '적립'), tx('2026-06-02', 0, '적립'), tx('2026-07-02', 0, '적립'),
    ];

    assert.deepStrictEqual(detectRecurringCandidates(rows), []);
  });

  test('날짜 형식이 틀린 행은 버린다', () => {
    const rows = [
      tx('2026-05-15', 5000, 'X'), tx('어제', 5000, 'X'), tx('2026-07-15', 5000, 'X'),
    ];

    // 유효한 달이 2개뿐이라 후보가 안 된다.
    assert.deepStrictEqual(detectRecurringCandidates(rows), []);
  });
});

describe('사용자가 판단할 근거를 준다', () => {
  test('금액이 흔들리면 그렇다고 말한다', () => {
    // 통신비처럼 매달 금액이 다른 항목이 흔하다. 금액이 같아야만 패턴으로 보면
    // 대부분 안 잡히고, 아무 말 없이 중앙값만 넣으면 사용자가 틀린 값을 저장한다.
    const rows = [
      tx('2026-05-11', 100000, 'KT'), tx('2026-06-11', 131150, 'KT'), tx('2026-07-11', 160000, 'KT'),
    ];

    const [c] = detectRecurringCandidates(rows);

    assert.strictEqual(c.amount_varies, true);
    assert.strictEqual(c.amount_min, 100000);
    assert.strictEqual(c.amount_max, 160000);
    assert.strictEqual(c.amount, 131150, '중앙값을 쓴다');
  });

  test('금액이 거의 같으면 흔들린다고 하지 않는다', () => {
    const rows = [
      tx('2026-05-11', 17000, '넷플릭스'), tx('2026-06-11', 17000, '넷플릭스'), tx('2026-07-11', 17500, '넷플릭스'),
    ];

    assert.strictEqual(detectRecurringCandidates(rows)[0].amount_varies, false);
  });

  test('결제일이 흔들리면 그렇다고 말한다', () => {
    // "매달 15일" 이 아니라 "매달 15일 언저리" 인 경우가 흔하다(주말에 밀린다).
    const rows = [
      tx('2026-05-02', 30000, '헬스장'), tx('2026-06-15', 30000, '헬스장'), tx('2026-07-28', 30000, '헬스장'),
    ];

    const [c] = detectRecurringCandidates(rows);

    assert.strictEqual(c.day_varies, true);
    assert.strictEqual(c.day_of_month, 15, '중앙값을 쓴다');
  });

  test('며칠 밀린 정도는 흔들림으로 안 본다', () => {
    const rows = [
      tx('2026-05-15', 9900, '유튜브'), tx('2026-06-17', 9900, '유튜브'), tx('2026-07-14', 9900, '유튜브'),
    ];

    assert.strictEqual(detectRecurringCandidates(rows)[0].day_varies, false);
  });
});

describe('규칙 폼이 그대로 쓸 수 있는가', () => {
  test('카테고리·결제수단은 가장 많이 쓴 값으로 채운다', () => {
    // 제안을 받으면 폼이 채워진 채 열려야 한다. 비워 두면 사용자가 다시 입력해야
    // 하고, 그러면 제안의 값이 절반으로 준다.
    // **소수값을 맨 앞에 둔다.** 첫 행을 그대로 쓰는 구현도 이 테스트를 통과하면
    // 안 된다 — 실제로 그렇게 만든 변형이 처음에 살아남았다.
    const rows = [
      tx('2026-05-05', 8000, '카페', { category_id: 9, payment_method_id: 3, payment_style: '할부' }),
      tx('2026-06-05', 8000, '카페', { category_id: 7, payment_method_id: 2 }),
      tx('2026-07-05', 8000, '카페', { category_id: 7, payment_method_id: 2 }),
    ];

    const [c] = detectRecurringCandidates(rows);

    assert.strictEqual(c.category_id, 7);
    assert.strictEqual(c.payment_method_id, 2);
    assert.strictEqual(c.payment_style, '일시불');
  });

  test('언제부터 언제까지 나왔는지 함께 준다', () => {
    const rows = [
      tx('2026-07-15', 5000, 'A'), tx('2026-05-15', 5000, 'A'), tx('2026-06-15', 5000, 'A'),
    ];

    const [c] = detectRecurringCandidates(rows);

    assert.strictEqual(c.first_seen, '2026-05-15');
    assert.strictEqual(c.last_seen, '2026-07-15');
  });
});

describe('목록 순서', () => {
  test('흔들리지 않는 것이 흔들리는 것보다 먼저', () => {
    // 반복 규칙은 고정 금액을 전제한다. 건수로만 정렬하면 자주 가는 쇼핑몰이
    // 위를 차지하고, 정작 등록해야 할 구독료가 아래에 묻힌다.
    // (실거래 580건으로 돌려 보니 상위 8개 중 7개가 금액 변동이었다.)
    const rows = [
      // 자주 나오지만 금액이 들쭉날쭉 — 등록하면 안 되는 것
      ...['2026-04-03', '2026-05-11', '2026-06-24', '2026-07-08'].map((d, i) => tx(d, 5000 + i * 9000, '쿠팡')),
      // 덜 나오지만 완전히 고정 — 등록해야 할 것
      ...['2026-05-15', '2026-06-15', '2026-07-15'].map((d) => tx(d, 9900, '스포티파이')),
    ];

    const out = detectRecurringCandidates(rows).map((c) => c.merchant);

    assert.deepStrictEqual(out, ['스포티파이', '쿠팡']);
  });

  test('안정성이 같으면 자주 나온 것이 먼저, 그다음 최근 것', () => {
    // 오래전에 끊긴 패턴을 위에 두면 사용자가 목록을 신뢰하지 않는다.
    const rows = [
      ...['2026-01-10', '2026-02-10', '2026-03-10'].map((d) => tx(d, 1000, '오래된')),
      ...['2026-05-10', '2026-06-10', '2026-07-10'].map((d) => tx(d, 1000, '최근')),
      ...['2026-04-10', '2026-05-10', '2026-06-10', '2026-07-10'].map((d) => tx(d, 2000, '자주')),
    ];

    const out = detectRecurringCandidates(rows).map((c) => c.merchant);

    assert.deepStrictEqual(out, ['자주', '최근', '오래된']);
  });

  test('배열이 아니면 빈 결과', () => {
    for (const v of [null, undefined, 'x', 5, {}]) {
      assert.deepStrictEqual(detectRecurringCandidates(v), []);
    }
  });
});
