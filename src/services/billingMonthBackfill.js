'use strict';

const crypto = require('node:crypto');
const { asInt } = require('../utils/validate');
const { resolveBillingMonth } = require('./settlementBilling');

// 기존 거래의 청구월을 소급해서 채운다(#289).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 남는가 — 청구월은 카드 주기를 **나중에** 알게 되는 값이다
//
// `resolveBillingMonth` 는 카드의 결제일·마감일을 모르면 아무것도 안 적는다.
// 추측한 청구월로 묶으면 사용자가 결제일에 빠질 금액을 잘못 보기 때문이다(#290).
//
// 그런데 사용자는 **카드를 등록한 뒤에 주기를 채워 넣는다.** 명세서를 찾아보거나
// 카드사 앱을 열어야 알 수 있는 값이라 나중에 들어온다. 그 사이에 쌓인 거래는
// 청구월이 빈 채로 남고, **주기를 채워도 스스로 되살아나지 않는다.**
//
// 마감일을 잘못 적었다가 고치는 경우도 같다. 이미 적힌 청구월은 옛 마감일로
// 나온 값이라 틀렸는데, 카드 상품을 고치는 경로는 거래를 건드리지 않는다.
//
//   PUT /api/card-products/:id 는 card_products 만 UPDATE 한다
//
// 청구월이 비었거나 틀리면 두 곳이 조용히 어긋난다.
//
//   cardUnpaid      그 건들이 `unassigned` 로 빠진다
//   projectBalance  청구월 없는 deferred 를 추이에서 **통째로 뺀다** —
//                   앞으로 빠질 카드값이 없는 것처럼 보인다
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 자동으로 하지 않는가
//
// 전체 거래를 훑어 다시 쓰는 대량 변경이다. 이 저장소는 실거래 2,212건 유실
// 사고가 있었고, 조용한 대량 변경은 같은 범주의 위험이다 — ADR 0008 이 요구하는
// 프리뷰 → 확인 → 실행을 거친다.
//
// 카드 주기를 저장할 때 자동으로 돌리는 것도 검토했으나 하지 않는다. 사용자가
// 카드 설정을 만지는 순간 과거 거래 수백 건이 소리 없이 바뀌면, 그게 의도한
// 것인지 아닌지 구분할 방법이 없다.
//
// ─────────────────────────────────────────────────────────────────────────
// 두 가지 모드 — 손으로 적은 값을 기본으로 지킨다
//
// `billing_month` 에는 **사용자가 명세서를 보고 직접 넣은 값**이 섞여 있을 수
// 있다(라우트가 `billing_month` 를 받는다). 계산값과 구분할 컬럼이 없다.
//
// 그래서 무엇이 기본이냐가 갈린다.
//
//   fill       비어 있는 것만 채운다. 적힌 값은 손대지 않는다   ← 기본값
//   recompute  전부 다시 계산한다. 마감일을 고쳤을 때 쓴다
//
// `fill` 을 기본으로 두는 이유는 되돌릴 수 없는 쪽이 더 비싸기 때문이다. 손으로
// 넣은 값이 지워지면 사용자는 그것이 무엇이었는지 알 방법이 없다. 반대로 덜
// 채워진 것은 다시 돌리면 된다.
//
// `recompute` 는 사용자가 명시적으로 고를 때만 돈다. 프리뷰가 "적혀 있던 N건이
// 다시 계산됩니다" 를 따로 세어 보여준다.

const SAMPLE_LIMIT = 5;

const MODES = ['fill', 'recompute'];

// 대상이 될 수 있는 행. `deferred` 만이 아니라 **청구월이 적힌 행 전부**를 본다.
//
// 즉시 결제·카드대금 인출에는 청구월이 없어야 하는데(`resolveBillingMonth` 가
// null 을 낸다) 값이 남아 있을 수 있다. 재분류로 `deferred` 를 벗은 거래가
// 그렇다. 대상에서 빼면 그 찌꺼기를 치울 방법이 없어진다.
const CANDIDATE_ROWS = `
  SELECT t.id, t.date, t.merchant, t.amount, t.card_product_id, t.billing_month,
         COALESCE(t.settlement, 'immediate') AS settlement,
         cp.product_name AS card_product_name,
         cp.billing_cycle_day, cp.statement_close_day
  FROM transactions t
  LEFT JOIN card_products cp ON cp.id = t.card_product_id
  WHERE (COALESCE(t.settlement, 'immediate') = 'deferred' OR t.billing_month IS NOT NULL)
`;

// 지문은 **바뀔 값과 그 입력 전부**를 담는다.
//
// id 와 지금 청구월만 담으면 부족하다. 프리뷰 뒤에 구매일이나 카드가 바뀌면
// 계산 결과가 달라지는데 지문은 그대로라, 사용자가 본 적 없는 전 → 후가
// 적용된다. #419 의 `C-3b` 가 뮤테이션 테스트로 찾아낸 것과 같은 구멍이다.
function fingerprintOf(mode, rows) {
  const material = JSON.stringify({
    mode,
    rows: [...rows]
      .sort((a, b) => a.id - b.id)
      .map((r) => ({
        id: r.id,
        date: r.date,
        settlement: r.settlement,
        card_product_id: r.card_product_id,
        billing_month: r.billing_month,
      })),
  });
  return crypto.createHash('sha256').update(material).digest('hex').slice(0, 32);
}

/**
 * 무엇이 몇 건 바뀌는지 계산한다. **DB 를 안 바꾼다.**
 *
 * @param {object} db
 * @param {object} criteria
 * @param {string} [criteria.mode]              'fill'(기본) | 'recompute'
 * @param {number} [criteria.card_product_id]   그 카드 거래만. 안 주면 전체
 * @returns {{error: string} | object}
 */
function planBackfill(db, criteria = {}) {
  const mode = criteria.mode === undefined || criteria.mode === null || criteria.mode === ''
    ? 'fill'
    : criteria.mode;
  if (!MODES.includes(mode)) {
    return { error: '어떻게 채울지 골라 주세요. 빈 것만 채우거나, 전부 다시 계산할 수 있어요.' };
  }

  const where = [];
  const params = [];
  let card = null;

  if (criteria.card_product_id !== undefined && criteria.card_product_id !== null
      && criteria.card_product_id !== '') {
    const cardId = asInt(criteria.card_product_id);
    if (cardId === null) return { error: '카드를 다시 골라 주세요.' };
    card = db.prepare('SELECT id, product_name FROM card_products WHERE id = ?').get(cardId);
    if (!card) {
      return { error: '선택한 카드를 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 골라 주세요.' };
    }
    where.push('t.card_product_id = ?');
    params.push(cardId);
  }

  const rows = db.prepare(`
    ${CANDIDATE_ROWS}${where.length ? ` AND ${where.join(' AND ')}` : ''}
    ORDER BY t.date DESC, t.id DESC
  `).all(...params);

  // 카드 주기는 행마다 조인돼 온다. 거래마다 카드가 다를 수 있어서 한 벌로
  // 묶을 수 없다 — 전체 대상으로 돌 때가 그렇다.
  const nextOf = (r) => resolveBillingMonth({
    settlement: r.settlement,
    date: r.date,
    cardProduct: r.card_product_id === null ? null : {
      billing_cycle_day: r.billing_cycle_day,
      statement_close_day: r.statement_close_day,
    },
  });

  const changes = [];
  let skippedWritten = 0;

  for (const r of rows) {
    const next = nextOf(r);
    if (next === r.billing_month) continue;

    // `fill` 은 적힌 값을 손대지 않는다. 몇 건을 그렇게 지나쳤는지 세어 두면
    // 화면이 "전부 다시 계산" 이 필요한 상황인지 알릴 수 있다.
    if (mode === 'fill' && r.billing_month !== null) { skippedWritten++; continue; }

    changes.push({ ...r, billing_month_after: next });
  }

  return {
    mode,
    card: card ? { id: card.id, product_name: card.product_name } : null,
    scanned: rows.length,
    count: changes.length,
    // 세 갈래를 따로 센다. 채워지는 것과 지워지는 것은 사용자에게 무게가 다르다 —
    // 지워지는 것은 "카드 주기를 아직 안 넣었다" 는 신호라 고칠 수 있어야 한다.
    filled: changes.filter((c) => c.billing_month === null).length,
    cleared: changes.filter((c) => c.billing_month !== null && c.billing_month_after === null).length,
    rewritten: changes.filter((c) => c.billing_month !== null && c.billing_month_after !== null).length,
    // `fill` 이 지나친 건수. 0 이 아니면 화면이 "전부 다시 계산" 을 안내한다.
    skipped_written: skippedWritten,
    samples: changes.slice(0, SAMPLE_LIMIT).map((c) => ({
      id: c.id,
      date: c.date,
      merchant: c.merchant,
      amount: c.amount,
      card_product_name: c.card_product_name,
      before: c.billing_month,
      after: c.billing_month_after,
    })),
    changes: changes.map((c) => ({ id: c.id, billing_month: c.billing_month_after })),
    fingerprint: fingerprintOf(mode, rows),
  };
}

/**
 * 계획대로 쓴다. 호출부가 지문을 확인한 뒤에만 부른다.
 *
 * 한 트랜잭션으로 묶는다. 중간에 실패해 절반만 바뀌면 사용자는 무엇이 바뀌었는지
 * 알 수 없고, 프리뷰에서 본 건수와도 맞지 않는다.
 */
function applyBackfill(db, plan) {
  if (!Array.isArray(plan.changes)) {
    throw new Error('applyBackfill: plan.changes 가 없다. planBackfill 이 만든 계획만 쓴다.');
  }
  if (!plan.changes.length) return 0;

  let changed = 0;
  db.transaction(() => {
    const stmt = db.prepare('UPDATE transactions SET billing_month = ? WHERE id = ?');
    for (const c of plan.changes) {
      changed += stmt.run(c.billing_month, c.id).changes;
    }
  })();
  return changed;
}

/**
 * 아직 청구월이 비어 있는 `deferred` 거래 수.
 *
 * 사용자가 소급이 필요한 상태인지 **화면을 열기 전에** 알 수 있어야 한다.
 * 카드 재매핑의 `countUnassigned` 와 같은 쓰임이다.
 */
function countMissing(db) {
  return db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM transactions
    WHERE COALESCE(settlement, 'immediate') = 'deferred' AND billing_month IS NULL
  `).get().cnt;
}

module.exports = { planBackfill, applyBackfill, countMissing, MODES, SAMPLE_LIMIT };
