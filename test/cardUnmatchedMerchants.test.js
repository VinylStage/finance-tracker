'use strict';

// 「등록된 혜택이 이 가맹점을 모른다」 진단(#688).
//
// ─────────────────────────────────────────────────────────────────────────
// 이 테스트가 못박는 것
//
// 실측(2026-09-17, 실DB): 나라사랑카드의 CU 혜택은 패턴이 `CU` 뿐이라
// 「씨유◯◯점」 표기 8건 91,840원이 혜택을 못 받고 있었다. 그런데 화면은
// «해당하는 혜택이 없어요» 라고 말하고 있었다 — **없는 것이 아니라 못 찾은
// 것**이었고, 그 차이를 아무도 볼 수 없었다.
//
// 그래서 여기서 못박는 것은 「목록이 나온다」 가 아니라 **「무엇을 세고 무엇을
// 안 세는가」** 다. 진단이 넓어지면 진짜 신호가 노이즈에 묻히고, 좁아지면
// 같은 사고가 다시 조용히 지나간다.

const test = require('node:test');
const assert = require('node:assert');

const { unmatchedMerchants } = require('../src/services/cardStrategy.js');

// 가맹점만 가리키는 혜택 한 줄.
function merchantRule(pattern, over = {}) {
  return {
    id: 1, card_product_id: 1, category_id: null, merchant_pattern: pattern,
    benefit_type: '적립', rate: 10, monthly_cap: null, min_amount: 0, ...over,
  };
}

function tx(merchant, amount, over = {}) {
  return { id: 1, date: '2026-05-04', merchant, amount, category_id: null, ...over };
}

// ─────────────────────────────────────────────────────────────────────────
// 핵심 — 표기 변형

test('표기가 갈리면 안 걸린 쪽이 잡힌다 — #688 의 실제 사고', () => {
  const r = unmatchedMerchants({
    benefits: [merchantRule('CU')],
    transactions: [
      tx('CU◯◯점', 2200),
      tx('씨유◯◯점', 8210),
      tx('씨유 △△점', 26270),
    ],
  });

  assert.equal(r.count, 2, '영문 패턴에 안 걸리는 한글 표기 두 건이 잡혀야 한다');
  assert.equal(r.amount, 34480);
  assert.deepEqual(r.merchants.map((m) => m.merchant), ['씨유 △△점', '씨유◯◯점']);
});

test('한글 표기를 등록하면 목록에서 사라진다 — 고쳐졌음이 여기서 드러나야 한다', () => {
  const r = unmatchedMerchants({
    benefits: [merchantRule('CU'), merchantRule('씨유', { id: 2 })],
    transactions: [tx('CU◯◯점', 2200), tx('씨유◯◯점', 8210)],
  });

  assert.equal(r.count, 0);
  assert.deepEqual(r.merchants, []);
});

test('부분문자열이라 괄호 안 영문도 걸린다 — 「씨유(CU) ◯◯점」', () => {
  const r = unmatchedMerchants({
    benefits: [merchantRule('CU')],
    transactions: [tx('씨유(CU) ◯◯점', 5500)],
  });
  assert.equal(r.count, 0);
});

// ─────────────────────────────────────────────────────────────────────────
// 「안 걸린다」 를 좁게 본다 — 여기가 이 진단의 계약이다

test('무차별 줄이 하나라도 있으면 목록이 빈다 — 그 줄이 모든 결제를 가리킨다', () => {
  const r = unmatchedMerchants({
    benefits: [
      merchantRule('CU'),
      // 가맹점·분류를 안 가리키는 줄. 삼성 taptap 의 0.5% 적립이 이 모양이다.
      merchantRule(null, { id: 2, rate: 0.5 }),
    ],
    transactions: [tx('씨유◯◯점', 8210), tx('아무데나', 1000)],
  });

  assert.equal(r.count, 0, '전 가맹점 줄이 있는 카드는 진단 대상이 아니다');
  assert.equal(r.distinctCount, 0);
});

test('분류로 걸리는 결제는 안 잡힌다 — 가맹점 이름이 안 맞아도 규칙은 이 거래를 안다', () => {
  const r = unmatchedMerchants({
    benefits: [{ ...merchantRule(null), category_id: 7 }],
    transactions: [tx('처음 보는 가게', 10000, { category_id: 7 })],
  });
  assert.equal(r.count, 0);
});

test('분류와 가맹점이 둘 다 걸린 줄은 둘 다 맞아야 «안다» 로 친다', () => {
  const benefits = [{ ...merchantRule('스타벅스'), category_id: 7 }];

  // 가맹점은 맞는데 분류가 다르다 → 이 줄은 이 거래를 안 가리킨다.
  const miss = unmatchedMerchants({
    benefits, transactions: [tx('스타벅스 강남점', 5000, { category_id: 9 })],
  });
  assert.equal(miss.count, 1);

  const hit = unmatchedMerchants({
    benefits, transactions: [tx('스타벅스 강남점', 5000, { category_id: 7 })],
  });
  assert.equal(hit.count, 0);
});

test('실적·한도·할부·날짜로 0원인 것은 섞지 않는다 — 규칙은 이 거래를 알고 있다', () => {
  const r = unmatchedMerchants({
    benefits: [
      // 건당 최소 결제액에 걸려 실제로는 0원이 되는 줄. 그래도 이 가맹점을
      // **가리키고는 있다** — 화면이 그 이유를 따로 말하므로 여기서 또 세면
      // 같은 결제가 두 자리에서 «혜택 없음» 으로 보인다.
      merchantRule('CU', { min_amount: 1000000 }),
      merchantRule('CU', { id: 2, payment_style: '일시불' }),
    ],
    transactions: [tx('CU◯◯점', 2200, { payment_style: '할부' })],
  });
  assert.equal(r.count, 0);
});

test('혜택이 하나도 없는 카드는 빈 목록 — 「규칙이 없다」 이지 「못 찾았다」 가 아니다', () => {
  const r = unmatchedMerchants({ benefits: [], transactions: [tx('아무데나', 1000)] });
  assert.equal(r.count, 0);
  assert.deepEqual(r.merchants, []);
});

test('가맹점이 안 적힌 결제는 세지 않는다 — 목록에 올려도 고칠 것이 없다', () => {
  const r = unmatchedMerchants({
    benefits: [merchantRule('CU')],
    transactions: [tx('', 5000), tx('   ', 5000), tx(null, 5000), tx('씨유', 1000)],
  });
  assert.equal(r.count, 1);
  assert.deepEqual(r.merchants.map((m) => m.merchant), ['씨유']);
});

// ─────────────────────────────────────────────────────────────────────────
// 목록의 순서와 자르기

test('건수 내림차순, 같으면 금액 큰 쪽, 그래도 같으면 이름순으로 고정', () => {
  const r = unmatchedMerchants({
    benefits: [merchantRule('CU')],
    transactions: [
      tx('가게A', 1000), tx('가게A', 1000),
      tx('가게B', 9000),
      tx('나가게', 500),
      tx('가가게', 500),
    ],
  });

  assert.deepEqual(
    r.merchants.map((m) => m.merchant),
    ['가게A', '가게B', '가가게', '나가게'],
  );
  assert.deepEqual(r.merchants[0], { merchant: '가게A', count: 2, amount: 2000 });
});

test('limit 는 목록만 자른다 — 합계와 곳 수는 전체를 센다', () => {
  const transactions = [];
  for (let i = 0; i < 12; i += 1) transactions.push(tx(`가게${String(i).padStart(2, '0')}`, 100));

  const r = unmatchedMerchants({ benefits: [merchantRule('CU')], transactions, limit: 3 });

  assert.equal(r.merchants.length, 3, '목록은 잘린다');
  assert.equal(r.distinctCount, 12, '곳 수는 전체다');
  assert.equal(r.count, 12);
  assert.equal(r.amount, 1200);
});

test('거래가 없으면 빈 결과 — 던지지 않는다', () => {
  for (const transactions of [[], null, undefined]) {
    const r = unmatchedMerchants({ benefits: [merchantRule('CU')], transactions });
    assert.equal(r.count, 0);
    assert.deepEqual(r.merchants, []);
  }
});
