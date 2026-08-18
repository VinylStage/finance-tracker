'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { compareCards } = require('../src/services/cardComparison.js');

// 혜택 한 줄. rate 는 퍼센트다.
function benefit(id, rate) {
  return {
    id,
    benefit_type: '적립',
    category_id: null,
    merchant_pattern: null,
    payment_style: null,
    card_threshold_tier_id: null,
    min_amount: null,
    rate,
    monthly_cap: null,
    rule_json: null,
  };
}

// 카드 한 장. `met` 이 그 달의 실적 충족 여부다.
function card(id, name, rate, met) {
  return {
    id,
    product_name: name,
    is_active: 1,
    thresholdMet: met,
    threshold: { tier: null, estimated: true },
    benefits: [benefit(id * 10, rate)],
  };
}

// 거래 한 건. 전부 10만원이고 `used` 카드로 결제한다.
function tx(id, date, used) {
  return {
    id,
    date,
    amount: 100000,
    category_id: null,
    merchant: null,
    card_product_id: used,
    origin: 'manual',
    payment_method_type: '신용',
    payment_style: '일시불',
  };
}

// A 는 적립 1% 로 늘 충족, B 는 적립 20% 인데 **달마다 충족 여부가 다르다.**
//   6월 — B 미달        7월 — B 충족
const JUNE = [card(1, 'A카드', 1, true), card(2, 'B카드', 20, false)];
const JULY = [card(1, 'A카드', 1, true), card(2, 'B카드', 20, true)];

// 두 건 다 A 로 결제했다. 「B 로 바꿨다면」 이 테스트의 관심사다.
const TXS = [tx(1, '2026-06-15', 1), tx(2, '2026-07-10', 1)];

const BY_MONTH = new Map([['2026-06', JUNE], ['2026-07', JULY]]);

test('달마다 실적을 다시 판정한다 — 미달인 달은 그 카드를 안 고른다', () => {
  const r = compareCards({ transactions: TXS, cards: JULY, cardsByMonth: BY_MONTH });
  assert.equal(r.details[0].best.cardId, 1);
  assert.equal(r.details[0].gap, 0);
});

test('충족한 달에는 그 카드를 고른다', () => {
  const r = compareCards({ transactions: TXS, cards: JULY, cardsByMonth: BY_MONTH });
  assert.equal(r.details[1].best.cardId, 2);
  assert.equal(r.details[1].gap, 19000);
});

test('합계가 달별 판정을 따른다', () => {
  const r = compareCards({ transactions: TXS, cards: JULY, cardsByMonth: BY_MONTH });
  assert.equal(r.totalGap, 19000);
});

test('cardsByMonth 를 안 넘기면 예전처럼 하나로 판정한다', () => {
  const r = compareCards({ transactions: TXS, cards: JULY });
  assert.equal(r.details[0].best.cardId, 2);
  assert.equal(r.details[0].gap, 19000);
  assert.equal(r.totalGap, 38000);
});

test('그 달이 cardsByMonth 에 없으면 넘긴 cards 로 떨어진다', () => {
  const r = compareCards({ transactions: TXS, cards: JULY, cardsByMonth: new Map([['2026-07', JULY]]) });
  assert.equal(r.details[0].best.cardId, 2);
  assert.equal(r.details[1].best.cardId, 2);
});

// 아래 한 건은 위임 산출이 아니라 사람이 더한 것이다. 위 다섯은 **두 거래를 다 A 로**
// 결제해서, 실제 카드 쪽 계산이 어느 목록을 보는지가 결과에 안 드러났다 —
// 실제 카드를 예전 목록에서 찾도록 되돌려도 돌연변이가 안 죽었다(fail 0).
//
// 축을 가르려면 **그 달에 미달인 카드로 실제 결제한 거래**가 있어야 한다.
test('실제로 쓴 카드의 혜택도 그 달 판정을 따른다', () => {
  // 6월에 B 로 결제했다. B 는 그 달 미달이므로 실제로 받은 혜택이 0 이어야 한다.
  const r = compareCards({
    transactions: [tx(1, '2026-06-15', 2)],
    cards: JULY,
    cardsByMonth: BY_MONTH,
  });

  assert.equal(r.details[0].actual.cardId, 2);
  assert.equal(r.details[0].actual.benefit, 0,
    '7월 판정(충족)으로 6월 결제에 혜택을 붙였다');
  // 그 달 최적은 A(1% = 1,000원)다.
  assert.equal(r.details[0].best.cardId, 1);
  assert.equal(r.details[0].gap, 1000);
});
