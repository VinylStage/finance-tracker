'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compareCards } = require('../src/services/cardComparison.js');

// 혜택 한 줄. rate 는 퍼센트, cap 은 월 한도(원)다. null 이면 한도 없음.
function benefit({ id = 1, rate = 1, cap = null }) {
  return {
    id,
    benefit_type: '적립',
    category_id: null,
    merchant_pattern: null,
    payment_style: null,
    card_threshold_tier_id: null,
    min_amount: null,
    rate,
    monthly_cap: cap,
    rule_json: null,
  };
}

// 카드 한 장. thresholdMet 을 true 로 둬서 실적 조건이 결과에 끼지 않게 한다.
function card({ id, name, rate, cap = null }) {
  return {
    id,
    product_name: name,
    is_active: 1,
    thresholdMet: true,
    threshold: { tier: null },
    benefits: [benefit({ id: id * 10, rate, cap })],
  };
}

// 거래 한 건. 기본 10만원이고 결제 카드는 usedCard 로 지정한다.
function tx({ id, date, amount = 100000, usedCard = 1 }) {
  return {
    id,
    date,
    amount,
    category_id: null,
    merchant: null,
    card_product_id: usedCard,
    origin: 'manual',
    payment_method_type: '신용',
    payment_style: '일시불',
  };
}

test('같은 달에 여러 건이면 가정 카드의 월 한도가 한 번만 열린다', () => {
  const cardA = card({ id: 1, name: 'A카드', rate: 1, cap: null });
  const cardB = card({ id: 2, name: 'B카드', rate: 10, cap: 5000 });
  
  const r = compareCards({
    transactions: [
      tx({ id: 1, date: '2026-08-01', usedCard: 1 }),
      tx({ id: 2, date: '2026-08-02', usedCard: 1 }),
      tx({ id: 3, date: '2026-08-03', usedCard: 1 }),
    ],
    cards: [cardA, cardB],
  });
  
  // 첫 번째 거래: B가 최적(10% = 10000원) but 한도 5000으로 제한
  assert.equal(r.details[0].best.cardId, 2);
  assert.equal(r.details[0].best.benefit, 5000);
  
  // 두 번째 거래: A가 최적(1% = 1000원) - B의 한도 소진됨
  assert.equal(r.details[1].best.cardId, 1);
  assert.equal(r.details[1].best.benefit, 1000);
  
  // 세 번째 거래: A가 최적(1% = 1000원) - B의 한도 소진됨
  assert.equal(r.details[2].best.cardId, 1);
  assert.equal(r.details[2].best.benefit, 1000);
});

test('달이 바뀌면 가정 누적이 리셋된다', () => {
  const cardA = card({ id: 1, name: 'A카드', rate: 1, cap: null });
  const cardB = card({ id: 2, name: 'B카드', rate: 10, cap: 5000 });
  
  const r = compareCards({
    transactions: [
      tx({ id: 1, date: '2026-07-10', usedCard: 1 }),
      tx({ id: 2, date: '2026-08-10', usedCard: 1 }),
    ],
    cards: [cardA, cardB],
  });
  
  // 첫 번째 거래: B가 최적(10% = 10000원) but 한도 5000으로 제한
  assert.equal(r.details[0].best.cardId, 2);
  assert.equal(r.details[0].best.benefit, 5000);
  
  // 두 번째 거래: B가 최적(10% = 10000원) but 한도 5000으로 제한
  // 달이 바뀌었기 때문에 B의 한도가 새로 열림
  assert.equal(r.details[1].best.cardId, 2);
  assert.equal(r.details[1].best.benefit, 5000);
});

test('카드 사이의 가정은 서로의 한도를 깎지 않는다', () => {
  const cardA = card({ id: 1, name: 'A카드', rate: 1, cap: null });
  const cardB = card({ id: 2, name: 'B카드', rate: 10, cap: 5000 });
  const cardC = card({ id: 3, name: 'C카드', rate: 3, cap: 50000 });
  
  const r = compareCards({
    transactions: [
      tx({ id: 1, date: '2026-08-01', usedCard: 1 }),
      tx({ id: 2, date: '2026-08-02', usedCard: 1 }),
    ],
    cards: [cardA, cardB, cardC],
  });
  
  // 첫 번째 거래: B가 최적(10% = 10000원) but 한도 5000으로 제한
  assert.equal(r.details[0].best.cardId, 2);
  assert.equal(r.details[0].best.benefit, 5000);
  
  // 두 번째 거래: C가 최적(3% = 3000원) - B의 한도 소진됨
  assert.equal(r.details[1].best.cardId, 3);
  assert.equal(r.details[1].best.benefit, 3000);
});

test('실제 카드의 누적은 가정 누적과 따로 센다', () => {
  const cardA = card({ id: 1, name: 'A카드', rate: 10, cap: 5000 });
  const cardB = card({ id: 2, name: 'B카드', rate: 1, cap: null });
  
  const r = compareCards({
    transactions: [
      tx({ id: 1, date: '2026-08-01', usedCard: 1 }),
      tx({ id: 2, date: '2026-08-02', usedCard: 2 }),
    ],
    cards: [cardA, cardB],
  });
  
  // 첫 번째 거래: 실제 카드 A로 결제, 10% = 10000원 but 한도 5000으로 제한
  assert.equal(r.details[0].actual.benefit, 5000);
  
  // 두 번째 거래: 실제 카드 B로 결제, 1% = 1000원
  assert.equal(r.details[1].actual.benefit, 1000);
});

test('한도가 없는 카드는 누적에 영향받지 않는다', () => {
  const cardA = card({ id: 1, name: 'A카드', rate: 1, cap: null });
  const cardB = card({ id: 2, name: 'B카드', rate: 2, cap: null });
  
  const r = compareCards({
    transactions: [
      tx({ id: 1, date: '2026-08-01', usedCard: 1 }),
      tx({ id: 2, date: '2026-08-02', usedCard: 1 }),
      tx({ id: 3, date: '2026-08-03', usedCard: 1 }),
    ],
    cards: [cardA, cardB],
  });
  
  // 세 건 모두 B가 최적(2% = 2000원) - 한도 없음
  assert.equal(r.details[0].best.cardId, 2);
  assert.equal(r.details[0].best.benefit, 2000);
  
  assert.equal(r.details[1].best.cardId, 2);
  assert.equal(r.details[1].best.benefit, 2000);
  
  assert.equal(r.details[2].best.cardId, 2);
  assert.equal(r.details[2].best.benefit, 2000);
});

// 아래 한 건은 위임 산출이 아니라 사람이 더한 것이다. 위 «실제 카드의 누적은 가정
// 누적과 따로 센다» 는 두 누적이 **같은 값**이 되는 시나리오라, 실제 계산에 가정 누적을
// 넣어도 결과가 안 바뀌어 돌연변이가 관찰되지 않았다(fail 0). 축을 가르려면 한도가 있는
// 카드로 **일부 건만** 결제해야 한다.
test('한도 있는 카드로 뒤늦게 한 건만 결제하면 그 건은 한도를 그대로 받는다', () => {
  const cardA = card({ id: 1, name: 'A카드', rate: 10, cap: 5000 });
  const cardB = card({ id: 2, name: 'B카드', rate: 1, cap: null });

  // 세 건 중 **마지막 한 건만** A 로 결제한다. A 의 가정 누적은 첫 건에서 이미 5,000 을
  // 채우지만, A 로 실제 결제한 것은 마지막 건뿐이라 실제 누적은 0 에서 시작한다.
  const r = compareCards({
    transactions: [
      tx({ id: 1, date: '2026-08-01', usedCard: 2 }),
      tx({ id: 2, date: '2026-08-02', usedCard: 2 }),
      tx({ id: 3, date: '2026-08-03', usedCard: 1 }),
    ],
    cards: [cardA, cardB],
  });

  assert.equal(r.details[2].actual.cardId, 1);
  assert.equal(r.details[2].actual.benefit, 5000,
    '실제 계산이 가정 누적을 보고 있다 — A 가 이미 소진된 것으로 잡혔다');
});
