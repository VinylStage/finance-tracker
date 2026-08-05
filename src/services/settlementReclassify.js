'use strict';

const crypto = require('node:crypto');
const { asInt } = require('../utils/validate');
const { SETTLEMENTS } = require('../constants');
const { computeBalance, cardUnpaid } = require('./accountBalance');
const { resolveBillingMonth } = require('./settlementBilling');

// 기존 거래의 결제 방식을 일괄로 다시 분류한다(#289).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 필요한가
//
// 021 은 기존 거래를 전부 `immediate` 로 남겼다. **자동 변환하지 않기로 한
// 결정**이었다 — 이 저장소는 과거 실거래 2,212건 유실 사고가 있었고, 조용한
// 대량 변경은 같은 범주의 위험이다.
//
// 그래서 사용자가 직접 "이 카드로 쓴 건 전부 deferred 다" 를 지정하는 도구가
// 필요하다. 그게 이 파일이다.
//
// ─────────────────────────────────────────────────────────────────────────
// 잔액 영향을 실제 계산으로 낸다
//
// #289 는 "재분류 전에 잔액이 얼마나 달라지는지 먼저 보여준다" 를 요구한다.
//
// 그 숫자를 손으로 유도하지 않는다. `deferred` 는 잔액에서 빠지고, 방향(수입/
// 지출)과 기준일·개설일 경계까지 얽혀 있어서 "지출이니까 amount 만큼 는다"
// 같은 약식 계산은 경계에서 틀린다.
//
// 대신 **실제 computeBalance 를 두 번 돌린다.** 지금 행으로 한 번, 바꾼 행으로
// 한 번. ADR 0008 이 경계한 "프리뷰 로직과 실행 로직이 갈라지는 것" 을 구조로
// 막는다 — 프리뷰가 쓰는 계산이 화면이 쓰는 계산과 같은 함수다.
//
// ─────────────────────────────────────────────────────────────────────────
// 이 파일은 DB 를 바꾸지 않는다
//
// planReclassify 는 읽기만 한다. 쓰는 것은 applyReclassify 뿐이고, 라우트가
// 프리뷰 지문을 확인한 뒤에만 부른다.

const SAMPLE_LIMIT = 5;

// 계좌에 달린 거래를 잔액 계산에 필요한 모양으로 읽는다. accounts 라우트의
// balanceOf 와 **같은 쿼리**여야 한다 — 다르면 프리뷰가 예고한 잔액과 화면에
// 뜨는 잔액이 어긋난다.
const ACCOUNT_ROWS = `
  SELECT t.id, t.date, t.amount, t.settlement, t.billing_month,
         CASE WHEN c.major_type = '수입' THEN 'in' ELSE 'out' END AS direction
  FROM transactions t
  LEFT JOIN payment_methods p ON p.id = t.payment_method_id
  LEFT JOIN categories c ON c.id = t.category_id
  WHERE COALESCE(t.account_id, p.account_id) = ?
`;

function fingerprintOf(target, rows) {
  const material = JSON.stringify({
    settlement: target.settlement,
    payment_method_id: target.payment_method_id,
    rows: [...rows]
      .sort((a, b) => a.id - b.id)
      // 청구월은 date · card_product_id · settlement 에서 나온다(#289). 넷 다
      // 담아야 프리뷰 뒤에 그중 하나가 바뀐 것을 잡는다 — 안 담으면 건수도
      // id 목록도 그대로라 지문이 통과하고, 사용자가 본 적 없는 계산 결과가
      // 적힌다.
      .map((r) => ({
        id: r.id,
        amount: r.amount,
        settlement: r.settlement,
        date: r.date,
        card_product_id: r.card_product_id,
        billing_month: r.billing_month,
      })),
  });
  return crypto.createHash('sha256').update(material).digest('hex').slice(0, 32);
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 무엇이 몇 건 바뀌고 잔액이 어떻게 달라지는지 계산한다. **DB 를 안 바꾼다.**
 *
 * @param {object} db
 * @param {object} criteria { payment_method_id, settlement, from, to }
 */
function planReclassify(db, criteria = {}) {
  const methodId = asInt(criteria.payment_method_id);
  if (!methodId) return { error: '결제수단을 골라 주세요.' };

  const settlement = criteria.settlement;
  if (!SETTLEMENTS.includes(settlement)) {
    return { error: '바꿀 결제 방식을 골라 주세요.' };
  }

  const method = db.prepare('SELECT id, name, type, account_id FROM payment_methods WHERE id = ?').get(methodId);
  if (!method) return { error: '선택한 결제수단을 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.' };

  const where = ['t.payment_method_id = ?', 'COALESCE(t.settlement, ?) != ?'];
  const params = [methodId, 'immediate', settlement];

  // 기간은 선택이다. 안 주면 전체가 대상이고, 그 사실은 건수로 드러난다.
  for (const [key, op] of [['from', '>='], ['to', '<=']]) {
    const v = criteria[key];
    if (v === undefined || v === null || v === '') continue;
    if (!YMD.test(String(v))) return { error: '날짜 형식이 올바르지 않습니다. 2026-08-04 처럼 입력해 주세요.' };
    where.push(`t.date ${op} ?`);
    params.push(String(v));
  }
  if (criteria.from && criteria.to && String(criteria.from) > String(criteria.to)) {
    return { error: '시작일이 종료일보다 뒤입니다. 순서를 바꿔 주세요.' };
  }

  const rows = db.prepare(`
    SELECT t.id, t.date, t.merchant, t.amount, t.card_product_id, t.billing_month,
           COALESCE(t.settlement, 'immediate') AS settlement,
           cp.billing_cycle_day, cp.statement_close_day
    FROM transactions t
    LEFT JOIN card_products cp ON cp.id = t.card_product_id
    WHERE ${where.join(' AND ')}
    ORDER BY t.date DESC, t.id DESC
  `).all(...params);

  const nextBillingMonth = (r) => resolveBillingMonth({
    settlement,
    date: r.date,
    cardProduct: r.card_product_id === null ? null : {
      billing_cycle_day: r.billing_cycle_day,
      statement_close_day: r.statement_close_day,
    },
  });

  return {
    target: {
      settlement,
      payment_method_id: method.id,
      payment_method_name: method.name,
      payment_method_type: method.type,
    },
    count: rows.length,
    billing_month_filled: rows.filter((r) => r.billing_month === null && nextBillingMonth(r) !== null).length,
    billing_month_cleared: rows.filter((r) => r.billing_month !== null && nextBillingMonth(r) === null).length,
    samples: rows.slice(0, SAMPLE_LIMIT).map((r) => ({
      id: r.id,
      date: r.date,
      merchant: r.merchant,
      amount: r.amount,
      before: r.settlement,
      after: settlement,
      billing_month_before: r.billing_month,
      billing_month_after: nextBillingMonth(r),
    })),
    ids: rows.map((r) => r.id),
    billing: rows.map((r) => ({ id: r.id, billing_month: nextBillingMonth(r) })),
    impact: impactOf(db, rows.map((r) => r.id), settlement),
    fingerprint: fingerprintOf({ settlement, payment_method_id: methodId }, rows),
  };
}

// 바뀌는 거래가 걸린 계좌마다 잔액이 어떻게 달라지는지.
//
// **금액이 아니라 계좌 단위로 낸다.** "12만원 늘어난다" 만 보여주면 어느 통장
// 이야기인지 알 수 없고, 사용자는 통장을 열어 대조할 수 없다.
function impactOf(db, ids, settlement) {
  if (!ids.length) return [];

  const idSet = new Set(ids);
  const accounts = db.prepare(`
    SELECT DISTINCT a.id, a.name, a.opening_balance, a.opening_date
    FROM accounts a
    JOIN payment_methods p ON p.account_id = a.id
    JOIN transactions t ON COALESCE(t.account_id, p.account_id) = a.id
    WHERE t.id IN (${ids.map(() => '?').join(',')})
  `).all(...ids);

  return accounts.map((account) => {
    const rows = db.prepare(ACCOUNT_ROWS).all(account.id);
    const after = rows.map((r) => (idSet.has(r.id) ? { ...r, settlement } : r));

    const b = computeBalance(account, rows);
    const a = computeBalance(account, after);

    return {
      accountId: account.id,
      accountName: account.name,
      balanceBefore: b.balance,
      balanceAfter: a.balance,
      balanceDelta: a.balance - b.balance,
      // 카드 미결제액은 잔액과 별개 축이다. 잔액이 늘었다고 돈이 생긴 게
      // 아니라 **나갈 돈이 카드 쪽으로 옮겨 간 것**이므로 같이 보여야 한다.
      cardUnpaidBefore: cardUnpaid(rows).total,
      cardUnpaidAfter: cardUnpaid(after).total,
    };
  });
}

/**
 * 계획대로 쓴다. 호출부가 지문을 확인한 뒤에만 부른다.
 *
 * 한 트랜잭션으로 묶는다. 중간에 실패해 절반만 바뀌면 사용자는 무엇이 바뀌었는지
 * 알 수 없고, 프리뷰에서 본 건수와도 맞지 않는다.
 */
function applyReclassify(db, plan) {
  if (!plan.ids.length) return 0;

  // `plan.billing` 이 없으면 계산을 안 한 계획이다. 그 상태로 쓰면 전 행의
  // 청구월이 조용히 NULL 로 밀린다.
  if (!Array.isArray(plan.billing)) {
    throw new Error('applyReclassify: plan.billing 이 없다. planReclassify 가 만든 계획만 쓴다.');
  }
  const billing = new Map(plan.billing.map((b) => [b.id, b.billing_month]));

  let changed = 0;
  db.transaction(() => {
    // 청구월이 행마다 달라 한 문장으로 묶을 수 없다. 행 단위로 도니 SQLite
    // 변수 상한(999)에 걸릴 일이 없어져 청크 분할이 필요 없다.
    const stmt = db.prepare(
      'UPDATE transactions SET settlement = ?, billing_month = ? WHERE id = ?'
    );
    for (const id of plan.ids) {
      changed += stmt.run(plan.target.settlement, billing.get(id) ?? null, id).changes;
    }
  })();
  return changed;
}

module.exports = { planReclassify, applyReclassify, SAMPLE_LIMIT };
