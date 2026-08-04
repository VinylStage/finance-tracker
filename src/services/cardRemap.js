'use strict';
const crypto = require('node:crypto');
const { asInt } = require('../utils/validate');
const { buildTransactionFilters } = require('../utils/transactionFilters');

// 기존 거래를 카드 상품에 붙이는 재매핑(#302 3단계).
//
// #274 가 카드사 행 하나에 상품 하나만 붙이던 1:1 제약을 풀었고, 실측에서 신한·
// 하나 두 카드사만 카드가 2장 이상이었다(B안 대상 278건, 그중 하나카드 260건).
// **카드 거래의 58% 가 하나카드**라 "2장 이상인 예외는 소수라 손으로 처리하면
// 된다" 는 가정이 성립하지 않는다 — 가장 큰 덩어리가 예외다. 그래서 이 도구는
// 건별이 아니라 **대량 지정을 기본**으로 잡는다.
//
// ADR 0008 이 요구하는 두 단계(프리뷰 → 확인 → 실행)를 이 모듈 하나가 받친다.
// **계산은 여기 한 곳에만 있고 라우트가 쓰기 여부만 가른다.** 프리뷰 로직과
// 실행 로직이 갈라지면 사용자가 본 것과 저장되는 것이 어긋난다(ADR 의 비용 항목).

// 프리뷰에 실어 보내는 대표 사례 수. 숫자만으로는 판단이 안 되므로 전 → 후를
// 몇 건 보여준다(ADR 0008). 260건을 다 보내면 화면이 목록 뷰어가 된다.
const SAMPLE_LIMIT = 5;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 대상 목록의 지문. 프리뷰 이후 대상이 바뀌면 값이 달라진다(ADR 0008).
 *
 * id 만으로는 부족하다 — 같은 id 가 그 사이 다른 카드로 지정됐을 수 있고,
 * 그러면 사용자가 본 "미상 260건" 과 실제로 덮이는 것이 다르다.
 */
function remapFingerprint(targetId, rows) {
  const material = JSON.stringify({
    target: targetId,
    rows: [...rows]
      .sort((a, b) => a.id - b.id)
      .map((r) => ({ id: r.id, amount: r.amount, card_product_id: r.card_product_id })),
  });
  return crypto.createHash('sha256').update(material).digest('hex').slice(0, 32);
}

/**
 * 재매핑 대상을 고른다. **DB 를 바꾸지 않는다.**
 *
 * 대상 범위는 **그 카드가 달린 카드사의 거래**로 고정한다. 카드사를 따로 받으면
 * "삼성카드 거래를 하나 A카드로" 같은 지정이 가능해지는데, 그건 재매핑이 아니라
 * 결제수단을 바꾸는 것이고 거래 입력(#302 2단계)이 할 일이다.
 *
 * @param {object} db
 * @param {object} criteria
 * @param {number} criteria.card_product_id  옮겨 갈 카드
 * @param {string} [criteria.from]           기간 시작 (YYYY-MM-DD)
 * @param {string} [criteria.to]             기간 끝 (YYYY-MM-DD)
 * @param {string} [criteria.merchant]       가맹점 부분일치
 * @param {number} [criteria.min_amount]     금액 하한 (부호 있는 값. 지출은 음수다)
 * @param {number} [criteria.max_amount]     금액 상한
 * @param {boolean} [criteria.include_assigned] 이미 다른 카드로 지정된 거래까지 포함
 * @returns {{error: string} | object} 문제가 있으면 { error }, 아니면 계획
 */
function planRemap(db, criteria = {}) {
  const targetId = asInt(criteria.card_product_id);
  if (targetId === null) {
    return { error: '옮겨 갈 카드를 골라 주세요.' };
  }

  const target = db.prepare(`
    SELECT cp.id, cp.payment_method_id, cp.issuer, cp.product_name,
           p.name AS payment_method_name
    FROM card_products cp
    LEFT JOIN payment_methods p ON p.id = cp.payment_method_id
    WHERE cp.id = ?
  `).get(targetId);
  if (!target) {
    return { error: '선택한 카드를 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 골라 주세요.' };
  }

  // 형식이 틀린 날짜는 조용히 무시하면 안 된다. SQLite 의 문자열 비교라
  // '2026-8-1' 같은 값은 오류 없이 **아무것도 걸리지 않거나 엉뚱하게 걸린다** —
  // 사용자는 조건을 걸었다고 믿는데 프리뷰 건수만 달라진다.
  for (const key of ['from', 'to']) {
    const v = criteria[key];
    if (v === undefined || v === null || v === '') continue;
    if (!DATE_RE.test(v)) return { error: '기간은 YYYY-MM-DD 형식으로 입력해 주세요.' };
  }

  const { where, params } = buildTransactionFilters({
    from: criteria.from,
    to: criteria.to,
    merchant: criteria.merchant,
    min_amount: criteria.min_amount,
    max_amount: criteria.max_amount,
    payment_method_id: target.payment_method_id,
  });

  // 이미 이 카드인 거래는 뺀다. 바뀌지 않는 것을 건수에 세면 "260건이 바뀐다"
  // 가 사실이 아니게 된다.
  const scope = criteria.include_assigned
    ? ' AND (t.card_product_id IS NULL OR t.card_product_id != ?)'
    : ' AND t.card_product_id IS NULL';
  const scopeParams = criteria.include_assigned ? [targetId] : [];

  const rows = db.prepare(`
    SELECT t.id, t.date, t.merchant, t.amount, t.card_product_id,
           cp.product_name AS card_product_name
    FROM transactions t
    LEFT JOIN card_products cp ON cp.id = t.card_product_id
    ${where}${scope}
    ORDER BY t.date DESC, t.id DESC
  `).all(...params, ...scopeParams);

  const alreadyAssigned = rows.filter((r) => r.card_product_id !== null).length;

  return {
    target,
    count: rows.length,
    // 다른 카드에서 옮겨 오는 건수. 미상을 채우는 것과 지정을 덮어쓰는 것은
    // 사용자에게 무게가 다르다 — 덮어쓰기는 이미 한 판단을 지운다.
    already_assigned: alreadyAssigned,
    samples: rows.slice(0, SAMPLE_LIMIT).map((r) => ({
      id: r.id,
      date: r.date,
      merchant: r.merchant,
      amount: r.amount,
      before: r.card_product_name || null,
      after: target.product_name,
    })),
    ids: rows.map((r) => r.id),
    fingerprint: remapFingerprint(targetId, rows),
  };
}

/**
 * 계획대로 쓴다. 호출부가 지문을 이미 확인한 뒤에만 부른다.
 *
 * 한 트랜잭션으로 묶는다. 260건 중간에 실패해 절반만 바뀌면 사용자는 무엇이
 * 바뀌었는지 알 수 없고, 프리뷰에서 본 건수와도 맞지 않는다.
 */
function applyRemap(db, plan) {
  if (!plan.ids.length) return 0;

  let changed = 0;
  db.transaction(() => {
    // SQLite 의 변수 상한(999)에 걸리지 않게 나눠 넣는다. 하나카드 260건은
    // 지금 한 번에 들어가지만, 건수는 데이터가 쌓이면 늘어난다.
    for (let i = 0; i < plan.ids.length; i += 500) {
      const chunk = plan.ids.slice(i, i + 500);
      const placeholders = chunk.map(() => '?').join(',');
      changed += db.prepare(
        `UPDATE transactions SET card_product_id = ? WHERE id IN (${placeholders})`
      ).run(plan.target.id, ...chunk).changes;
    }
  })();
  return changed;
}

/**
 * 아직 어느 카드인지 정하지 않은 카드 거래 수(#306).
 *
 * 사용자가 재매핑을 언제 끝냈는지 알 수 있어야 하고, 부분 완료가 정상 상태다 —
 * 260건을 한 번에 끝내라고 강요하지 않는다.
 */
function countUnassigned(db) {
  return db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM transactions t
    LEFT JOIN payment_methods p ON p.id = t.payment_method_id
    WHERE t.card_product_id IS NULL AND p.type = '신용'
  `).get().cnt;
}

module.exports = { planRemap, applyRemap, countUnassigned, remapFingerprint, SAMPLE_LIMIT };
