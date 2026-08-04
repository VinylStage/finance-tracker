'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { localYMD } = require('../utils/date');
const { computeThreshold, INCOME_MAJOR_TYPE } = require('../services/cardThreshold');
const { compareCards } = require('../services/cardComparison');
const { estimateBenefit } = require('../services/cardStrategy');

// 카드 전략 조회(#276).
//
// ─────────────────────────────────────────────────────────────────────────
// 읽기 전용이다
//
// 이 라우트는 DB 를 바꾸지 않는다. 추천과 사후 분석은 **판단을 돕는 값**이지
// 기록이 아니다. 계산 결과를 저장하면 혜택 정보를 고쳤을 때 옛 추천이 남아
// 사용자가 틀린 근거로 카드를 고른다.
//
// ─────────────────────────────────────────────────────────────────────────
// 실적은 카드마다 구간이 다르다
//
// 마감일이 카드마다 달라서 "전월" 이 카드마다 다른 날짜다. 그래서 한 번의
// 쿼리로 모아 계산하지 않고 카드별로 구간을 잡아 조회한다. 개인 앱이라 카드
// 수가 적다 — 여기서 쿼리를 아끼려다 구간을 뭉개는 쪽이 훨씬 나쁘다.

// 계산에 필요한 필드만 뽑는다. 거래 전체를 실어 보내면 응답이 커지고 화면이
// 안 쓰는 값까지 노출된다.
const TX_IN_RANGE = `
  SELECT t.id, t.date, t.amount, t.category_id, t.merchant, t.origin,
         t.card_product_id, t.payment_method_id,
         pm.type AS payment_method_type, c.major_type
  FROM transactions t
  LEFT JOIN payment_methods pm ON pm.id = t.payment_method_id
  LEFT JOIN categories c ON c.id = t.category_id
  WHERE t.date BETWEEN ? AND ?
  ORDER BY t.date, t.id
`;

// ─────────────────────────────────────────────────────────────────────────
// 거래가 어느 카드 상품인지 푸는 규칙
//
// **transactions.card_product_id 에 쓰는 곳이 아직 없다.** 016 이 컬럼을
// 만들었지만 입력 화면은 결제수단만 고른다. 실측(2026-08-04): 546건 중
// card_product_id 가 채워진 것이 0건, 신용·체크 결제는 458건이다.
//
// #302 가 이걸 푸는 방향은 **결제수단 행을 상품 단위로 쪼개는 것**이다
// (그 이슈의 A·B 안 둘 다). 즉 상품 특정은 card_product_id 가 아니라
// `card_products.payment_method_id` 를 타고 나온다.
//
// 그래서 여기서는 두 경로를 다 본다.
//
//   1. transactions.card_product_id 가 있으면 그것이 정답이다(#306 이 명시적으로
//      지정한 경우). 결제수단으로 유추한 값보다 우선한다
//   2. 없으면 결제수단으로 되짚는다. **단 그 결제수단에 상품이 딱 하나일 때만**
//
// 2번의 단서가 중요하다. 016 은 payment_method_id 에 UNIQUE 를 걸지 않았다 —
// 한 카드사에 상품 두 개가 달릴 수 있다. 그 상태에서 아무거나 고르면 남의
// 카드 혜택으로 계산한 차액을 사용자에게 보여주게 된다. 모르면 모르는 채로
// 두고 unknownCard 로 세는 편이 낫다.
function cardIdResolver(cards) {
  const byMethod = new Map();
  for (const c of cards) {
    if (!byMethod.has(c.payment_method_id)) byMethod.set(c.payment_method_id, []);
    byMethod.get(c.payment_method_id).push(c.id);
  }

  return (tx) => {
    if (tx.card_product_id !== null && tx.card_product_id !== undefined) return tx.card_product_id;
    const candidates = byMethod.get(tx.payment_method_id);
    return candidates && candidates.length === 1 ? candidates[0] : null;
  };
}

function loadCards() {
  const cards = db.prepare(`
    SELECT id, payment_method_id, issuer, product_name, card_type, prev_month_threshold,
           billing_cycle_day, statement_close_day
    FROM card_products
    ORDER BY issuer, product_name
  `).all();

  const benefits = db.prepare(`
    SELECT id, card_product_id, category_id, merchant_pattern,
           benefit_type, rate, monthly_cap, min_amount
    FROM card_benefits
  `).all();

  const byCard = new Map(cards.map((c) => [c.id, []]));
  for (const b of benefits) {
    if (byCard.has(b.card_product_id)) byCard.get(b.card_product_id).push(b);
  }

  return cards.map((c) => ({ ...c, benefits: byCard.get(c.id) || [] }));
}

// 카드 한 장의 전월 실적. 구간이 카드마다 다르므로 카드별로 조회한다.
function thresholdFor(card, asOf, resolve) {
  // 구간을 알아야 조회 범위가 정해지는데, 구간 계산은 카드 정보만 있으면
  // 된다. 그래서 빈 목록으로 한 번 불러 구간만 얻고 다시 합산한다 —
  // 구간 계산 규칙을 여기 복사하지 않기 위해서다.
  const { period } = computeThreshold({ cardProduct: card, transactions: [], asOf });

  // 상품 특정을 SQL 로 내리지 않는다. 규칙이 resolve 와 WHERE 두 곳에 생기면
  // 언젠가 갈라진다 — 실적과 차액이 서로 다른 거래 집합을 보게 된다.
  const rows = db.prepare(TX_IN_RANGE)
    .all(period.start, period.end)
    .filter((r) => resolve(r) === card.id);

  return computeThreshold({ cardProduct: card, transactions: rows, asOf });
}

function withThresholds(cards, asOf) {
  const resolve = cardIdResolver(cards);
  return cards.map((card) => {
    const threshold = thresholdFor(card, asOf, resolve);
    return { ...card, thresholdMet: threshold.met, threshold };
  });
}

// GET /api/card-strategy/thresholds?asOf=YYYY-MM-DD
router.get('/thresholds', (req, res) => {
  try {
    const asOf = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.asOf || '')) ? req.query.asOf : localYMD();
    const data = withThresholds(loadCards(), asOf).map((c) => ({
      cardProductId: c.id,
      issuer: c.issuer,
      productName: c.product_name,
      ...c.threshold,
    }));
    res.json({ data, asOf });
  } catch (e) {
    serverError(res, e, 'cardStrategy');
  }
});

// GET /api/card-strategy/estimate?amount=&category_id=&merchant=&asOf=
//
// 지금 결제하면 어느 카드가 나은가. 거래 입력 화면이 부른다.
router.get('/estimate', (req, res) => {
  try {
    const amount = Number(req.query.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: '결제 금액을 입력해 주세요.' });
    }

    const asOf = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.asOf || '')) ? req.query.asOf : localYMD();
    const categoryId = req.query.category_id === undefined || req.query.category_id === ''
      ? null : Number(req.query.category_id);
    const merchant = typeof req.query.merchant === 'string' ? req.query.merchant : null;

    const cards = withThresholds(loadCards(), asOf);

    const data = cards.map((card) => {
      const r = estimateBenefit({
        benefits: card.benefits,
        amount,
        categoryId,
        merchant,
        thresholdMet: card.thresholdMet,
        // 이번 달 이미 받은 혜택은 아직 기록하지 않는다. 한도 소진을 알려면
        // 거래마다 어느 혜택이 걸렸는지를 저장해야 하는데, 그건 추정값을
        // 기록으로 굳히는 일이라 하지 않기로 했다. 여기서는 0 으로 둔다 —
        // **한도가 남았다고 가정하므로 추정이 실제보다 클 수 있다.**
        benefitUsedThisMonth: 0,
      });
      return {
        cardProductId: card.id,
        issuer: card.issuer,
        productName: card.product_name,
        thresholdMet: card.thresholdMet,
        thresholdEstimated: card.threshold.estimated,
        ...r,
      };
    }).sort((a, b) => b.benefit - a.benefit);

    res.json({
      data,
      // 카드가 하나뿐이면 "이게 최선입니다" 라고 말하면 안 된다. 비교 대상이
      // 없는 것과 비교해서 이겼다는 것은 다르다.
      comparable: data.length >= 2,
      capUnknown: true,
      asOf,
    });
  } catch (e) {
    serverError(res, e, 'cardStrategy');
  }
});

// GET /api/card-strategy/comparison?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// 사후 분석 — 지난 결제를 지금 기준으로 다시 계산한 차이.
router.get('/comparison', (req, res) => {
  try {
    const ymd = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
    const to = ymd(req.query.to) || localYMD();
    // 기본 구간은 최근 3개월이다. 기간을 안 주면 전 기간을 훑게 되는데,
    // 몇 년 전 결제를 "지금 카드로 다시 계산" 하는 것은 의미가 없다.
    const from = ymd(req.query.from) || defaultFrom(to);

    if (from > to) return res.status(400).json({ error: '시작일이 종료일보다 뒤입니다.' });

    const cards = withThresholds(loadCards(), to);
    const resolve = cardIdResolver(cards);
    const rows = db.prepare(TX_IN_RANGE).all(from, to);

    // 수입은 카드 혜택 대상이 아니다. 파생 거래 제외는 compareCards 가 한다.
    const expenses = rows
      .filter((r) => r.major_type !== INCOME_MAJOR_TYPE)
      .map((r) => ({ ...r, card_product_id: resolve(r) }));

    const result = compareCards({ transactions: expenses, cards });

    res.json({
      ...result,
      period: { from, to },
      // 실적 판정이 추정이면 차액도 추정이다. 화면이 이어서 말해야 한다.
      thresholdEstimated: cards.some((c) => c.threshold.estimated),
    });
  } catch (e) {
    serverError(res, e, 'cardStrategy');
  }
});

function defaultFrom(to) {
  const [y, m, d] = to.split('-').map(Number);
  const start = new Date(y, m - 1 - 3, d);
  return localYMD(start);
}

module.exports = router;
