'use strict';

// 해외결제 조건(#710).
//
// ─────────────────────────────────────────────────────────────────────────
// 이 테스트가 못박는 것
//
// 카드 한 장이 혜택 0건으로 남아 있었다. 자료가 없어서가 아니라 **「해외 이용금액
// 2% 적립」 을 담을 자리가 없어서**였다. 혜택이 거래를 집는 수단이 가맹점 이름과
// 원장 분류 둘뿐이었는데, 「해외결제」 는 그 어느 쪽도 아니다.
//
// 그래서 여기서 보는 것은 「2% 가 계산되나」 가 아니라 **「어느 층에서 걸러지나」** 다.
// 층이 틀리면 값은 맞는데 화면이 거짓말을 한다 — #688 이 정확히 그것이었다.

const test = require('node:test');
const assert = require('node:assert');

const { estimateBenefit } = require('../src/services/cardStrategy.js');
const {
  WHEN_KEYS, overseasOf, matchesOverseas, validateRule,
} = require('../src/services/benefitRules.js');

// 「전 가맹점 · 해외에서만 · 2% 적립」 — 실제 카드 한 장이 이 모양이다.
function overseasRule(overseas, over = {}) {
  return {
    id: 1, card_product_id: 7, category_id: null, merchant_pattern: null,
    benefit_type: '적립', rate: 2, min_amount: 0, monthly_cap: null,
    rule_json: JSON.stringify({ kind: 'rate', rate: 2, when: { overseas } }),
    ...over,
  };
}

function run(benefits, isOverseas, over = {}) {
  return estimateBenefit({
    benefits, amount: 100000, categoryId: null, merchant: 'ANTHROPIC',
    thresholdMet: true, benefitUsedThisMonth: 0, date: '2026-01-11',
    isOverseas, ...over,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// 붙는가

test('해외 전용 혜택이 해외결제에 붙는다 — 이 칸이 없어 못 넣던 바로 그 줄', () => {
  const r = run([overseasRule(true)], 1);
  assert.equal(r.benefit, 2000);
  assert.equal(r.applied.id, 1);
});

test('해외 전용 혜택은 국내결제에 안 붙는다 — 붙으면 1년치가 과대추정된다', () => {
  const r = run([overseasRule(true)], 0);
  assert.equal(r.benefit, 0);
  assert.equal(r.applied, null);
});

test('국내 전용도 같은 축의 반대편으로 동작한다', () => {
  assert.equal(run([overseasRule(false)], 0).benefit, 2000);
  assert.equal(run([overseasRule(false)], 1).benefit, 0);
});

test('조건이 없는 혜택은 해외든 국내든 가리지 않는다 — 기존 줄이 이 변경으로 안 달라진다', () => {
  const plain = { ...overseasRule(true), rule_json: null };
  assert.equal(run([plain], 1).benefit, 2000);
  assert.equal(run([plain], 0).benefit, 2000);
});

test('안 주면 국내로 본다 — 해외 전용 혜택이 안 붙는 쪽이 안전하다', () => {
  // 사전 추천 화면이 아직 안 물어보는 동안, 해외 전용 혜택이 국내 결제에
  // 붙어 «이 카드로 2,000원» 이라고 말해 놓고 실제로 0원인 쪽이 더 해롭다.
  assert.equal(run([overseasRule(true)], undefined).benefit, 0);
  assert.equal(run([overseasRule(true)], null).benefit, 0);
});

// ─────────────────────────────────────────────────────────────────────────
// 어느 층에서 걸러지나 — 여기가 이 기능의 계약이다

test('사유가 방향까지 나뉜다 — 한 문구로 뭉치면 둘 중 하나엔 틀린 말이 된다', () => {
  assert.deepEqual(run([overseasRule(true)], 0).skipped, [{ id: 1, reason: 'overseas-only' }]);
  assert.deepEqual(run([overseasRule(false)], 1).skipped, [{ id: 1, reason: 'domestic-only' }]);
});

test('«no-match» 로 걸러지지 않는다 — 규칙은 이 결제를 알고 있다', () => {
  const only = run([overseasRule(true)], 0).skipped;
  assert.ok(!only.some((s) => s.reason === 'no-match'),
    '해외 조건을 가맹점 판정 층에 두면 «혜택이 없다» 로 읽히고, 그건 거짓말이다');
});

test('가맹점 판정이 **먼저**다 — 가맹점이 안 맞으면 해외 사유가 아니라 no-match 다', () => {
  // 층 순서를 못박는다. 해외 조건이 가맹점 판정보다 앞에 오면, 애초에 대상이
  // 아닌 가맹점까지 «해외 전용 혜택이에요» 로 설명하게 된다.
  const r = run([overseasRule(true, { merchant_pattern: '스타벅스' })], 0);
  assert.deepEqual(r.skipped, [{ id: 1, reason: 'no-match' }]);
});

test('가맹점이 맞으면 그제서야 해외 사유가 나온다 — 「없다」 와 「조건이 안 맞다」 를 가른다', () => {
  // 같은 혜택, 같은 국내 결제인데 가맹점만 맞다. 사유가 달라져야 한다 —
  // 이 둘이 한 값으로 뭉치면 화면이 «혜택이 없어요» 로 잘못 말한다(#688).
  const r = run([overseasRule(true, { merchant_pattern: 'ANTHROPIC' })], 0);
  assert.deepEqual(r.skipped, [{ id: 1, reason: 'overseas-only' }]);
});

// ─────────────────────────────────────────────────────────────────────────
// 다른 조건과 함께

test('날짜 조건과 함께 걸리면 둘 다 맞아야 한다', () => {
  const both = {
    ...overseasRule(true),
    rule_json: JSON.stringify({ kind: 'rate', rate: 2, when: { overseas: true, dates: ['01-11'] } }),
  };
  assert.equal(run([both], 1, { date: '2026-01-11' }).benefit, 2000);
  assert.equal(run([both], 1, { date: '2026-01-12' }).benefit, 0);
  assert.equal(run([both], 0, { date: '2026-01-11' }).benefit, 0);
});

test('해외 조건이 먼저 걸러지면 날짜를 몰라도 «날짜 모름» 으로 새지 않는다', () => {
  const both = {
    ...overseasRule(true),
    rule_json: JSON.stringify({ kind: 'rate', rate: 2, when: { overseas: true, dates: ['01-11'] } }),
  };
  // 국내 결제라 해외 층에서 이미 빠진다. 날짜를 안 줘도 `undatedSkipped` 가
  // 서면 화면이 «날짜를 알면 더 받을 수도 있다» 고 잘못 말한다.
  const r = run([both], 0, { date: undefined });
  assert.equal(r.undatedSkipped, false);
  assert.deepEqual(r.skipped, [{ id: 1, reason: 'overseas-only' }]);
});

// ─────────────────────────────────────────────────────────────────────────
// 선언 검증 — 조건이 조용히 사라지는 것을 막는다

test('overseas 는 WHEN_KEYS 에 있다', () => {
  assert.ok(WHEN_KEYS.includes('overseas'));
});

test('불리언이 아니면 막는다 — 문자열 «true» 를 받아 주면 참·거짓이 섞인다', () => {
  for (const bad of ['true', 1, 0, 'Y', {}]) {
    assert.ok(validateRule({ kind: 'rate', rate: 2, when: { overseas: bad } }),
      `${JSON.stringify(bad)} 가 통과하면 안 된다`);
  }
  assert.equal(validateRule({ kind: 'rate', rate: 2, when: { overseas: true } }), null);
  assert.equal(validateRule({ kind: 'rate', rate: 2, when: { overseas: false } }), null);
});

test('오타는 막힌다 — «oversea» 로 저장되면 조건이 통째로 사라진다', () => {
  const msg = validateRule({ kind: 'rate', rate: 2, when: { oversea: true } });
  assert.match(String(msg), /모르는 혜택 조건/);
});

test('overseasOf · matchesOverseas 의 «가리지 않는다»', () => {
  assert.equal(overseasOf({ rule_json: null }), null);
  assert.equal(overseasOf({ rule_json: JSON.stringify({ kind: 'rate', rate: 1 }) }), null);
  assert.equal(overseasOf({ rule_json: JSON.stringify({ kind: 'rate', rate: 1, when: {} }) }), null);
  assert.equal(matchesOverseas(null, 1), true);
  assert.equal(matchesOverseas(null, 0), true);
});
