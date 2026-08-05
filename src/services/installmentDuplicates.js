'use strict';
const { toIdList } = require('../utils/validate');

const crypto = require('node:crypto');

// 할부 전환(B안)으로 생긴 중복 거래 탐지(#269 잔여).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 필요한가
//
// #269 가 B안을 택했다 — 할부의 정본은 installments 행 하나이고, 거래내역에는
// 청구 회차만 파생 거래로 나타난다. 그런데 사용자가 그 전에 할부 구매를 직접
// 거래로 넣어 뒀으면 그 거래가 **중복**이 된다.
//
// 실사용 DB 실측(2026-08-03): payment_style='할부' 인 수동 거래 14건, 합계
// 1,198,419원. 등록된 할부 3건과는 금액이 정확히 겹치지 않는다 — 즉 대부분
// "할부로 적어 뒀지만 할부 등록은 안 한" 거래다.
//
// ── 자동 삭제는 절대 하지 않는다
//
// 이 저장소는 과거 실거래 2,212건이 유실된 사고가 있었다. 탐지는 후보를 고를
// 뿐이고, 무엇을 지울지는 사용자가 정한다(ADR 0008 프리뷰 → 확인).
// ─────────────────────────────────────────────────────────────────────────

// 가맹점명 정규화.
//
// 실데이터에 같은 가게가 "예스이십사 주식회사" · "예스이십사(주)" · "예스이십사"
// 세 가지로 들어 있다. 정확히 비교하면 셋 다 다른 가게가 된다.
function normalizeMerchant(name) {
  return String(name || '')
    .replace(/주식회사|㈜|\(주\)|\(유\)|유한회사/g, '')
    .replace(/[\s.\-_()[\]]/g, '')
    .toLowerCase();
}

// 두 가맹점명이 같은 곳으로 보이는가. 정규화 후 한쪽이 다른 쪽을 포함하면 같게 본다.
// 짧은 이름이 우연히 포함되는 것을 막기 위해 최소 길이를 둔다.
const MIN_MERCHANT_MATCH = 2;

function merchantMatches(a, b) {
  const x = normalizeMerchant(a);
  const y = normalizeMerchant(b);
  if (x.length < MIN_MERCHANT_MATCH || y.length < MIN_MERCHANT_MATCH) return false;
  return x === y || x.includes(y) || y.includes(x);
}

function daysApart(a, b) {
  const parse = (s) => {
    const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.abs(Math.round((parse(a) - parse(b)) / 86400000));
}

// 확신도. 어떤 근거로 골랐는지를 사용자에게 그대로 보여주기 위해 등급을 나눈다.
//
//   exact   등록된 할부와 가맹점·금액·날짜가 모두 맞는다. 중복이 거의 확실하다
//   likely  가맹점과 날짜는 맞지만 금액이 월납입액 쪽이다
//   review  할부로 적혀 있는데 연결된 할부 등록이 없다. 중복일 수도, 등록을
//           안 한 것일 수도 있다 — 사용자가 봐야 한다
const CONFIDENCE = { EXACT: 'exact', LIKELY: 'likely', REVIEW: 'review' };

/**
 * 중복 의심 거래를 찾는다. **DB 를 읽기만 한다.**
 *
 * @param {object} db
 * @param {object} [opts]
 * @param {number} [opts.dayWindow=14] 구매일과 며칠까지 떨어진 것을 볼 것인가
 * @returns {Array} 후보 목록. 확신도가 높은 순
 */
function findDuplicateCandidates(db, { dayWindow = 14 } = {}) {
  const installments = db.prepare('SELECT * FROM installments').all();

  // 후보 모수를 좁힌다. 사용자가 직접 넣은 거래만 대상이다 — 파생 거래는 계산
  // 결과라 중복일 수 없다.
  const manual = db.prepare(`
    SELECT t.*, c.name AS category_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE COALESCE(t.origin, 'manual') = 'manual'
      AND (t.payment_style = '할부' OR t.amount IN (
        SELECT total_amount FROM installments
        UNION SELECT monthly_amount FROM installments
      ))
  `).all();

  const dismissed = new Set(
    db.prepare('SELECT transaction_id FROM installment_duplicate_dismissals').all()
      .map((r) => r.transaction_id)
  );

  const out = [];
  for (const tx of manual) {
    if (dismissed.has(tx.id)) continue;

    let best = null;
    for (const inst of installments) {
      if (!merchantMatches(tx.merchant, inst.merchant)) continue;
      const gap = daysApart(tx.date, inst.purchase_date);
      if (gap > dayWindow) continue;

      if (tx.amount === inst.total_amount) {
        best = { installment: inst, confidence: CONFIDENCE.EXACT, gap, matched: 'total' };
        break;
      }
      if (tx.amount === inst.monthly_amount && (!best || best.confidence !== CONFIDENCE.EXACT)) {
        best = { installment: inst, confidence: CONFIDENCE.LIKELY, gap, matched: 'monthly' };
      }
    }

    if (best) {
      out.push({
        transaction: publicTx(tx),
        installment_id: best.installment.id,
        installment_merchant: best.installment.merchant,
        confidence: best.confidence,
        days_apart: best.gap,
        matched_on: best.matched,
      });
    } else if (tx.payment_style === '할부') {
      // 할부로 적혀 있는데 연결되는 할부 등록이 없다. 지울 대상이 아닐 수도
      // 있으므로 확신도를 낮춰 보여주기만 한다.
      out.push({
        transaction: publicTx(tx),
        installment_id: null,
        installment_merchant: null,
        confidence: CONFIDENCE.REVIEW,
        days_apart: null,
        matched_on: null,
      });
    }
  }

  const order = { exact: 0, likely: 1, review: 2 };
  return out.sort((a, b) => (order[a.confidence] - order[b.confidence])
    || (a.transaction.date < b.transaction.date ? 1 : -1));
}

// 화면에 필요한 것만 추린다. 내부 컬럼을 통째로 흘리지 않는다.
function publicTx(tx) {
  return {
    id: tx.id, date: tx.date, merchant: tx.merchant, amount: tx.amount,
    payment_style: tx.payment_style, category_name: tx.category_name, memo: tx.memo,
  };
}

/**
 * 지울 거래 목록의 지문. 프리뷰 이후 대상이 바뀌면 값이 달라진다(ADR 0008).
 *
 * id 만으로는 부족하다 — 같은 id 의 금액이 그 사이에 바뀌었을 수 있다.
 */
function resolveFingerprint(rows) {
  const material = JSON.stringify(
    [...rows].sort((a, b) => a.id - b.id).map((r) => ({ id: r.id, date: r.date, amount: r.amount }))
  );
  return crypto.createHash('sha256').update(material).digest('hex').slice(0, 32);
}

/**
 * 지울 대상을 확인하고 계획을 만든다. **DB 를 바꾸지 않는다.**
 *
 * 파생 거래가 섞여 들어오면 거부한다. 계산 결과를 중복으로 지우면 원본과
 * 어긋난다 — 화면에서 못 고르게 막혀 있지만 API 를 직접 부를 수 있다.
 */
function planResolve(db, ids) {
  const unique = toIdList(ids);
  if (!unique.length) return { rows: [], locked: [], missing: [], total: 0, fingerprint: null };

  const placeholders = unique.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT id, date, merchant, amount, origin FROM transactions WHERE id IN (${placeholders})`
  ).all(...unique);

  const found = new Set(rows.map((r) => r.id));
  return {
    rows: rows.filter((r) => (r.origin || 'manual') === 'manual'),
    locked: rows.filter((r) => (r.origin || 'manual') !== 'manual'),
    missing: unique.filter((id) => !found.has(id)),
    total: rows.filter((r) => (r.origin || 'manual') === 'manual')
      .reduce((s, r) => s + r.amount, 0),
    fingerprint: resolveFingerprint(rows.filter((r) => (r.origin || 'manual') === 'manual')),
  };
}

// 사용자가 "이건 중복이 아니다" 로 판단한 거래. 다음부터 목록에 안 나온다.
//
// 지우는 것만이 판단이 아니다. 둘 다 남겨 두기로 했는데 목록이 계속 같은 행을
// 보여주면 사용자는 결국 목록 자체를 무시하게 된다.
function dismiss(db, ids) {
  const unique = toIdList(ids);
  if (!unique.length) return 0;
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO installment_duplicate_dismissals (transaction_id) VALUES (?)'
  );
  let n = 0;
  db.transaction(() => { for (const id of unique) n += stmt.run(id).changes; })();
  return n;
}

function undismiss(db, ids) {
  const unique = toIdList(ids);
  if (!unique.length) return 0;
  const placeholders = unique.map(() => '?').join(',');
  return db.prepare(
    `DELETE FROM installment_duplicate_dismissals WHERE transaction_id IN (${placeholders})`
  ).run(...unique).changes;
}

// 사용자가 "중복 아님" 으로 지나친 후보를 되돌려 볼 수 있게 목록으로 낸다(#445 §2).
//
// `findDuplicateCandidates` 는 지나친 것을 **걸러내고** 목록에 안 낸다. 그게 맞는
// 동작이지만, 그래서 실수로 지나친 것을 사용자가 다시 찾을 방법이 없었다 — 서버에는
// `undismiss` 가 있는데 손이 닿지 않았다.
//
// 거래가 지워지면 dismissals 도 CASCADE 로 같이 지워진다. 그래도 JOIN 을 쓰는 것은
// 여기서 거래 정보(날짜·가맹점·금액)를 같이 내야 사용자가 무엇을 지나쳤는지
// 알아볼 수 있기 때문이다 — 거래 id 만 보여주면 판단할 수 없다.
function listDismissed(db) {
  return db.prepare(`
    SELECT d.transaction_id, d.dismissed_at,
           t.date, t.merchant, t.amount
    FROM installment_duplicate_dismissals d
    JOIN transactions t ON t.id = d.transaction_id
    ORDER BY d.dismissed_at DESC, d.transaction_id DESC
  `).all();
}

module.exports = {
  normalizeMerchant, merchantMatches, daysApart, findDuplicateCandidates,
  planResolve, resolveFingerprint, dismiss, undismiss, listDismissed, CONFIDENCE,
};
