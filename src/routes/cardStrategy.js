'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { serverError } = require('../utils/errors');
const { asInt } = require('../utils/validate');
const { localYMD } = require('../utils/date');
const { computeThreshold, INCOME_MAJOR_TYPE } = require('../services/cardThreshold');
const { compareCards, NON_ELIGIBLE_ORIGINS } = require('../services/cardComparison');
const { estimateBenefit } = require('../services/cardStrategy');
const { benefitForMonth } = require('../services/benefitRules');

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
         t.card_product_id, t.payment_method_id, t.payment_style,
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
  // **비활성 카드도 함께 싣는다.** 과거 거래가 그 카드를 가리키고 있어서,
  // 빼면 "실제로 그 카드로 얼마를 받았나" 를 계산할 수 없다(#410).
  //
  // 되짚기(cardIdResolver)도 이 목록을 쓴다. 비활성 카드가 후보에 남아 있어야
  // "그 결제수단에 상품이 딱 하나" 조건이 성립하지 않고, 그래서 지운 카드의
  // 과거 지출이 남은 카드로 넘어가지 않는다.
  //
  // 추천 후보에서 빼는 것은 계산 쪽(compareCards)의 몫이다 — 못 쓰는 카드를
  // "이걸 썼어야 한다" 로 권할 수는 없다.
  const cards = db.prepare(`
    SELECT id, payment_method_id, issuer, product_name, card_type, prev_month_threshold,
           billing_cycle_day, statement_close_day, is_active
    FROM card_products
    ORDER BY issuer, product_name
  `).all();

  // 유형별 규칙(#564)을 함께 읽는다. 이 칸이 빠지면 ruleOf 가 규칙을 못 보고
  // 요율형으로 되돌아가는데, 정액구간형은 rate 가 0 이라 조용히 «혜택 0원» 이 된다 —
  // 오류가 아니라 그럴듯한 값이 나와서 안 드러난다(#579).
  const benefits = db.prepare(`
    SELECT id, card_product_id, category_id, merchant_pattern,
           benefit_type, rate, monthly_cap, min_amount, payment_style,
           card_threshold_tier_id, rule_json
    FROM card_benefits
  `).all();

  const byCard = new Map(cards.map((c) => [c.id, []]));
  for (const b of benefits) {
    if (byCard.has(b.card_product_id)) byCard.get(b.card_product_id).push(b);
  }

  return cards.map((c) => ({ ...c, benefits: byCard.get(c.id) || [] }));
}

// 카드에 등록된 실적 구간(#526). 없으면 빈 배열이고, 그러면 computeThreshold 가
// 단일 임계값으로 예전처럼 판정한다.
function tiersFor(cardProductId) {
  return db.prepare(`
    SELECT id, min_spend, rate, label FROM card_threshold_tiers
    WHERE card_product_id = ? ORDER BY min_spend
  `).all(cardProductId);
}

// 사용자가 실적에서 뺀 거래 id(#526). 카드사 실적 규칙은 카드마다 달라
// 자동 판정만으로 못 맞춘다.
function excludedTxIds() {
  return new Set(
    db.prepare('SELECT transaction_id FROM card_threshold_exclusions').all().map((r) => r.transaction_id)
  );
}

// 카드 한 장의 전월 실적. 구간이 카드마다 다르므로 카드별로 조회한다.
function thresholdFor(card, asOf, resolve, excluded) {
  // 구간을 알아야 조회 범위가 정해지는데, 구간 계산은 카드 정보만 있으면
  // 된다. 그래서 빈 목록으로 한 번 불러 구간만 얻고 다시 합산한다 —
  // 구간 계산 규칙을 여기 복사하지 않기 위해서다.
  const { period } = computeThreshold({ cardProduct: card, transactions: [], asOf });

  // 상품 특정을 SQL 로 내리지 않는다. 규칙이 resolve 와 WHERE 두 곳에 생기면
  // 언젠가 갈라진다 — 실적과 차액이 서로 다른 거래 집합을 보게 된다.
  const rows = db.prepare(TX_IN_RANGE)
    .all(period.start, period.end)
    .filter((r) => resolve(r) === card.id);

  return computeThreshold({
    cardProduct: card, transactions: rows, asOf,
    tiers: tiersFor(card.id),
    excludedIds: excluded,
  });
}

function withThresholds(cards, asOf) {
  const resolve = cardIdResolver(cards);
  // 제외 목록은 카드마다 다시 읽을 이유가 없다. 카드 수만큼 같은 쿼리가
  // 도는 것을 막는다.
  const excluded = excludedTxIds();
  return cards.map((card) => {
    const threshold = thresholdFor(card, asOf, resolve, excluded);
    return { ...card, thresholdMet: threshold.met, threshold };
  });
}

// GET /api/card-strategy/thresholds?asOf=YYYY-MM-DD
router.get('/thresholds', (req, res) => {
  try {
    const asOf = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.asOf || '')) ? req.query.asOf : localYMD();
    // 더 안 쓰는 카드도 함께 내린다(#410). 감추면 "지난달 이 카드로 30만원
    // 썼는데 목록에 없다" 가 되고, 소프트 삭제로 과거를 보존한 목적이 반쯤
    // 사라진다. 화면이 흐리게 표시하고 추천에서만 빼도록 표시만 붙인다.
    const data = withThresholds(loadCards(), asOf).map((c) => ({
      cardProductId: c.id,
      issuer: c.issuer,
      productName: c.product_name,
      isActive: c.is_active === undefined ? true : !!c.is_active,
      ...c.threshold,
    }));
    res.json({ data, asOf });
  } catch (e) {
    serverError(res, e, 'cardStrategy');
  }
});

// GET /api/card-strategy/estimate?amount=&category_id=&merchant=&payment_style=&asOf=
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
    // 결제방식을 안 주면 결제방식 제약이 붙은 혜택은 후보에서 빠진다(#563).
    // 입력 화면이 아직 안 보내는 동안 할부 전용 혜택이 일시불에 붙는 것보다,
    // 안 붙는 쪽이 안전하다.
    const paymentStyle = typeof req.query.payment_style === 'string' ? req.query.payment_style : null;

    const cards = withThresholds(loadCards(), asOf);

    const data = cards.map((card) => {
      const r = estimateBenefit({
        benefits: card.benefits,
        amount,
        categoryId,
        merchant,
        paymentStyle,
        // 이번 달에 적용되는 구간(#563). 지난달 지출로 정해진다.
        activeTierId: card.threshold && card.threshold.tier ? card.threshold.tier.id : null,
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
        isActive: card.is_active === undefined ? true : !!card.is_active,
        thresholdMet: card.thresholdMet,
        thresholdEstimated: card.threshold.estimated,
        ...r,
      };
    })
      // 더 안 쓰는 카드는 추천 후보가 아니다. 지금 결제할 카드를 고르는
      // 화면이라 못 쓰는 카드를 1위로 올리면 그대로 틀린 답이 된다(#410).
      .filter((c) => c.isActive)
      .sort((a, b) => b.benefit - a.benefit);

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



// GET /api/card-strategy/threshold-transactions?asOf=YYYY-MM-DD
//
// 전월 실적에 잡힌 거래를 **카드별로 나눠** 돌려준다(#526).
//
// 화면이 카드별 섹션으로 나눠 보여줘야 하기 때문이다 — 한 목록에 전 카드 거래를
// 섞으면 어느 카드의 실적을 조정하는지 알 수 없다.
//
// 자동 제외(수입·파생)는 애초에 목록에 넣지 않는다. 사용자가 토글할 수 있는 것은
// **실적에 실제로 잡히는 거래**뿐이다. 못 바꾸는 것을 보여주면 눌러 보고 나서
// 아무 일도 안 일어난다.
router.get('/threshold-transactions', (req, res) => {
  try {
    const asOf = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.asOf || '')) ? req.query.asOf : localYMD();
    const cards = loadCards();
    const resolve = cardIdResolver(cards);
    const excluded = excludedTxIds();
    const { period } = computeThreshold({ cardProduct: null, transactions: [], asOf });

    const rows = db.prepare(TX_IN_RANGE).all(period.start, period.end);

    const byCard = cards.map((card) => {
      const mine = rows
        .filter((r) => resolve(r) === card.id)
        .filter((r) => r.major_type !== INCOME_MAJOR_TYPE)
        .filter((r) => !NON_ELIGIBLE_ORIGINS.has(r.origin || 'manual'))
        .map((r) => ({
          id: r.id,
          date: r.date,
          merchant: r.merchant,
          amount: r.amount,
          excluded: excluded.has(r.id),
        }));
      return {
        cardProductId: card.id,
        issuer: card.issuer,
        productName: card.product_name,
        transactions: mine,
        // 제외를 반영한 합계. 화면이 "빼면 얼마가 되나" 를 바로 보여줄 수 있다.
        countedTotal: mine.filter((t) => !t.excluded).reduce((a, t) => a + (Number(t.amount) || 0), 0),
      };
    });

    res.json({ data: byCard, period, asOf });
  } catch (e) {
    serverError(res, e, 'cardStrategy');
  }
});

// ─────────────────────────────────────────────────────────────────────────
// 실적 구간(#526)
//
// 카드마다 구간 수도 금액도 달라서 카드 단위로 통째로 받고 통째로 바꾼다.
// 행 하나씩 PATCH 하면 "구간 3개를 2개로 줄이기" 가 삭제+수정 조합이 되어
// 중간 상태에서 하한이 겹칠 수 있다 — 겹치면 어느 요율을 쓸지 정할 수 없다.
// ─────────────────────────────────────────────────────────────────────────

// GET /api/card-strategy/tiers/:cardProductId
router.get('/tiers/:cardProductId', (req, res) => {
  try {
    const id = asInt(req.params.cardProductId);
    if (id === null) return res.status(400).json({ error: '카드를 찾을 수 없습니다.' });
    res.json({ data: tiersFor(id) });
  } catch (e) {
    serverError(res, e, 'cardStrategy');
  }
});

// PUT /api/card-strategy/tiers/:cardProductId  { tiers: [{ min_spend, rate, label }] }
router.put('/tiers/:cardProductId', (req, res) => {
  try {
    const id = asInt(req.params.cardProductId);
    if (id === null) return res.status(400).json({ error: '카드를 찾을 수 없습니다.' });

    const card = db.prepare('SELECT id FROM card_products WHERE id = ?').get(id);
    if (!card) return res.status(404).json({ error: '카드를 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.' });

    const incoming = Array.isArray((req.body || {}).tiers) ? req.body.tiers : null;
    if (!incoming) return res.status(400).json({ error: '구간 목록을 보내 주세요.' });

    const seen = new Set();
    const rows = [];
    for (const t of incoming) {
      const min = asInt((t || {}).min_spend);
      if (min === null || min < 0) {
        return res.status(400).json({ error: '구간 하한은 0 이상의 숫자여야 합니다.' });
      }
      // 하한이 겹치면 어느 요율을 쓸지 정할 수 없다. 저장 뒤에 발견하면
      // 이미 계산이 틀린 뒤다.
      if (seen.has(min)) {
        return res.status(400).json({ error: `구간 하한 ${min} 이 두 번 있습니다. 하한은 구간마다 달라야 합니다.` });
      }
      seen.add(min);

      let rate = null;
      if (t.rate !== null && t.rate !== undefined && t.rate !== '') {
        rate = Number(t.rate);
        if (!Number.isFinite(rate) || rate < 0) {
          return res.status(400).json({ error: '요율은 0 이상의 숫자여야 합니다.' });
        }
      }
      rows.push({ min, rate, label: t.label ? String(t.label) : null });
    }

    // 통째로 교체한다. 트랜잭션으로 감싸 중간 상태가 남지 않게 한다 —
    // 지우고 넣는 사이에 실패하면 구간이 통째로 사라진 카드가 된다.
    db.transaction(() => {
      db.prepare('DELETE FROM card_threshold_tiers WHERE card_product_id = ?').run(id);
      const ins = db.prepare(
        'INSERT INTO card_threshold_tiers (card_product_id, min_spend, rate, label) VALUES (?,?,?,?)'
      );
      for (const r of rows) ins.run(id, r.min, r.rate, r.label);
    })();

    res.json({ ok: true, data: tiersFor(id) });
  } catch (e) {
    serverError(res, e, 'cardStrategy');
  }
});

// ─────────────────────────────────────────────────────────────────────────
// 거래별 실적 제외(#526)
//
// 행이 있으면 제외, 없으면 포함이다. 재포함은 행을 지우는 것이라 "되돌렸다"
// 가 별도 상태로 남지 않는다 — 감사 로그가 그 이력을 들고 있다.
// ─────────────────────────────────────────────────────────────────────────

// POST /api/card-strategy/exclusions  { transaction_id, reason }
router.post('/exclusions', (req, res) => {
  try {
    const txId = asInt((req.body || {}).transaction_id);
    if (txId === null) return res.status(400).json({ error: '거래를 찾을 수 없습니다.' });

    const tx = db.prepare('SELECT id FROM transactions WHERE id = ?').get(txId);
    if (!tx) return res.status(404).json({ error: '찾는 거래가 없습니다. 이미 삭제됐을 수 있어요.' });

    const reason = (req.body || {}).reason ? String(req.body.reason) : null;
    db.prepare(
      'INSERT OR IGNORE INTO card_threshold_exclusions (transaction_id, reason) VALUES (?,?)'
    ).run(txId, reason);
    res.json({ ok: true });
  } catch (e) {
    serverError(res, e, 'cardStrategy');
  }
});

// DELETE /api/card-strategy/exclusions/:transactionId — 다시 실적에 넣는다.
router.delete('/exclusions/:transactionId', (req, res) => {
  try {
    const txId = asInt(req.params.transactionId);
    if (txId === null) return res.status(400).json({ error: '거래를 찾을 수 없습니다.' });
    const r = db.prepare('DELETE FROM card_threshold_exclusions WHERE transaction_id = ?').run(txId);
    res.json({ ok: true, restored: r.changes });
  } catch (e) {
    serverError(res, e, 'cardStrategy');
  }
});

function defaultFrom(to) {
  const [y, m, d] = to.split('-').map(Number);
  const start = new Date(y, m - 1 - 3, d);
  return localYMD(start);
}

// GET /api/card-strategy/detail?asOf=YYYY-MM-DD
//
// 카드 하나하나가 **지금 어떤 상태인가** 를 통째로 준다. 기존 화면은
// `/thresholds` 만 써서 «충족/미달» 과 구간 이름까지만 보여줬다. 그래서
// "왜 이 카드가 이만큼인가" 를 물으면 답할 데가 없었다.
//
// 특히 구간이 붙은 뒤로는 **혜택마다 지금 살아 있는지가 달라진다.** 40만원 미만
// 구간에 걸린 1% 줄과 이상 구간에 걸린 2% 줄이 같이 등록돼 있고, 이번 달에는
// 그중 하나만 적용된다. 목록만 보면 둘 다 있는 것처럼 보인다.
//
// 그래서 혜택마다 `activeNow` 를 함께 낸다 — 지금 이 카드에서 실제로 걸리는 줄이
// 무엇인지가 이 화면의 존재 이유다.
router.get('/detail', (req, res) => {
  try {
    const asOf = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.asOf || '')) ? req.query.asOf : localYMD();
    const cards = withThresholds(loadCards(), asOf);

    // 분류 이름을 붙여 준다. 화면이 내부 번호를 다시 이름으로 바꾸지 않게 한다(#231).
    const catNames = new Map(
      db.prepare('SELECT id, name FROM categories').all().map((c) => [c.id, c.name])
    );

    const data = cards.map((card) => {
      const th = card.threshold || {};
      const activeTierId = th.tier ? th.tier.id : null;

      const benefits = (card.benefits || []).map((b) => {
        const tier = (th.tiers || []).find((t) => t.id === b.card_threshold_tier_id) || null;
        return {
          id: b.id,
          categoryName: b.category_id ? (catNames.get(b.category_id) || null) : null,
          merchantPattern: b.merchant_pattern || null,
          benefitType: b.benefit_type,
          rate: b.rate,
          monthlyCap: b.monthly_cap,
          minAmount: b.min_amount,
          paymentStyle: b.payment_style || null,
          tierId: b.card_threshold_tier_id ?? null,
          tierLabel: tier ? (tier.label || null) : null,
          tierMinSpend: tier ? tier.min_spend : null,
          // 이번 달에 실제로 걸리는가. 구간을 안 가리키면 항상 걸리고,
          // 가리키면 그 구간이 지금 구간일 때만 걸린다. 실적 미달이면 전부 죽는다.
          activeNow: th.met !== false
            && (b.card_threshold_tier_id === null || b.card_threshold_tier_id === undefined
                || b.card_threshold_tier_id === activeTierId),
        };
      });

      // 값이 0 인 줄은 목록에 넣지 않는다. 넣으면 «0원짜리 혜택» 이 화면에 뜬다.
      const monthlyLines = th.met === false ? [] : (card.benefits || [])
        .map((b) => {
          const r = benefitForMonth(b, { prevMonthSpend: th.spend ?? 0 });
          return r.benefit > 0
            ? { benefitId: b.id, benefitType: b.benefit_type, benefit: r.benefit, explain: r.explain }
            : null;
        })
        .filter(Boolean);

      return {
        cardProductId: card.id,
        issuer: card.issuer,
        productName: card.product_name,
        cardType: card.card_type,
        isActive: card.is_active === undefined || card.is_active === null ? true : !!card.is_active,
        threshold: {
          period: th.period || null,
          spend: th.spend ?? 0,
          met: th.met !== false,
          tier: th.tier || null,
          tiers: th.tiers || [],
          nextTier: th.nextTier || null,
          toNextTier: th.toNextTier ?? 0,
          // 카드사 실적 제외 항목을 반영하지 못한다는 사실을 화면이 말해야 한다.
          estimated: th.estimated !== false,
        },
        benefits,
        // 등록은 됐는데 이번 달에는 하나도 안 걸리는 카드가 있다. 그 사실을
        // 화면이 바로 말할 수 있게 세어 준다.
        // 이번 달에 월 단위로만 붙는 몫(#579).
        //
        // 정액구간형은 어느 거래에 붙일지 정할 근거가 없어 benefitForTransaction 이
        // 0 을 낸다 — 의도한 동작이다(#564). 문제는 **거두는 쪽이 없어서 월 합계에도
        // 안 잡혔다**는 것이었다. 넣은 사람 눈에는 저장은 됐는데 아무 데도 안 쓰이는
        // 상태였다.
        //
        // 거래별 합계와 **더하지 않고 따로** 준다 — 두 곳에서 세면 과대추정이 된다.
        // 실적 미달이면 0 이다(요율형이 실적 미달에서 죽는 것과 같은 규칙).
        monthlyLines,
        monthlyTotal: monthlyLines.reduce((sum, m) => sum + m.benefit, 0),
        activeBenefitCount: benefits.filter((b) => b.activeNow).length,
      };
    });

    res.json({ data, asOf });
  } catch (e) {
    serverError(res, e, 'cardStrategy');
  }
});

module.exports = router;
