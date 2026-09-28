'use strict';

const crypto = require('node:crypto');

// 결제가 해외결제인지 알아본다(#710 · ADR 0010).
//
// ─────────────────────────────────────────────────────────────────────────
// 「해외결제인가」 는 **우리가 판단하는 것이 아니다**
//
// 카드사가 분류한다. 명세서에 국가코드나 원 통화가 찍혀 있다는 것이 곧
// **카드사가 그 결제를 해외로 분류했다는 신호**다. 혜택도 그 분류를 따라 붙는다.
//
// 그래서 여기서 하는 일은 추측이 아니라 **카드사가 남긴 표시를 읽어 내는 것**이다.
// 이 구분이 중요하다 — 실측(실DB 580건)에서 `Adobe` · `Temu` · `Claude` 처럼
// 이름만 보면 해외 서비스인 결제가 49건 있었는데, 그중 명세서에 표시가 붙은 것은
// 일부뿐이다. 나머지는 국내 PG 를 거쳐 원화로 청구돼 **카드사가 국내로 분류**한
// 것으로 보이고, 그러면 해외 적립도 안 붙는다.
//
// **이름으로 짐작하지 않는다.** 짐작을 넣으면 두 가지가 같이 망가진다 —
// 없는 혜택을 있다고 말하게 되고(과대추정), 경고가 잦아져 사용자가 확인을
// 그만둔다.
//
// ─────────────────────────────────────────────────────────────────────────
// 카드사가 남기는 표시는 두 모양이다 (실DB 580건 전수, 2026-09-17)
//
//   A. 원 통화 조각    ANTHROPIC,USD:5.50                          현대 형식
//   B. 말미 국가코드   ANTHROPIC              SAN FRANCISCO USA    하나 형식
//                      CLAUDE.AI SUBSCRIPTION +1……          US
//
// 둘 다 **가맹점 이름 문자열 안에** 묻혀 있다. 임포터는 A 를 정규식으로
// 알아보면서도 금액 자르는 위치로만 쓰고 버렸다(`cardExcelImport.js`).
//
// ─────────────────────────────────────────────────────────────────────────
// 규칙을 한 곳에만 둔다
//
// 임포트(새로 들어오는 것) · 백필 프리뷰 · 백필 실행이 **같은 판정**을 써야 한다.
// 세 곳에 같은 정규식을 따로 적으면 사용자가 프리뷰에서 본 건수와 실제로 바뀌는
// 건수가 어긋난다 — ADR 0008 이 비용으로 적은 바로 그 어긋남이다.

// A. 이용금액 옆에 붙는 원 통화 조각. `,USD:22.00` · `,JPY:1500.00`.
//
// 소수 두 자리를 요구한다. 안 그러면 `,ABC:1` 같은 평범한 문자열이 걸린다.
const FOREIGN_CURRENCY = /,[A-Z]{3}:\d+\.\d{2}/;

// B. 이름 맨 끝의 국가코드. 앞에 **공백이 반드시 있어야 한다.**
//
// 공백을 요구하는 것이 핵심이다. 안 그러면 `SSG_COM` 의 `COM` 이 걸린다 —
// 실DB 에 158,022원어치 있는 국내 결제다.
const TRAILING_COUNTRY = /\s([A-Z]{2,3})$/;

// 우리나라 코드가 찍힌 것은 **국내**다. 카드사가 국내로 분류했다는 뜻이므로
// 「해외 표시가 있다」 로 읽으면 정반대가 된다.
const HOME_CODES = new Set(['KR', 'KOR']);

/**
 * 이 가맹점 문자열에 **카드사가 해외로 표시한 흔적**이 있는가.
 *
 * @param {string} merchant 원장에 저장된 가맹점 이름
 * @returns {boolean}
 */
function looksOverseas(merchant) {
  if (typeof merchant !== 'string' || merchant === '') return false;
  if (FOREIGN_CURRENCY.test(merchant)) return true;
  const m = merchant.match(TRAILING_COUNTRY);
  return m !== null && !HOME_CODES.has(m[1]);
}

/**
 * 무엇을 보고 그렇게 판정했는가. 프리뷰가 사용자에게 근거를 보여준다(ADR 0008).
 *
 * 건수만 보여주면 사용자가 확인할 수 없다 — 「18건이 바뀝니다」 는 확인이 아니라
 * 통보다.
 *
 * @returns {'currency' | 'country' | null}
 */
function overseasEvidence(merchant) {
  if (typeof merchant !== 'string' || merchant === '') return null;
  if (FOREIGN_CURRENCY.test(merchant)) return 'currency';
  const m = merchant.match(TRAILING_COUNTRY);
  if (m !== null && !HOME_CODES.has(m[1])) return 'country';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// 기존 원장 백필 — 프리뷰 → 확인 → 실행 (ADR 0008)

// 프리뷰에 실어 보내는 대표 사례 수. 숫자만으로는 판단이 안 되므로 몇 건을
// 보여준다. 전부 보내면 화면이 목록 뷰어가 된다(`cardRemap` 과 같은 기준).
const SAMPLE_LIMIT = 8;

/**
 * 대상 목록의 지문. 프리뷰 이후 대상이 바뀌면 값이 달라진다(ADR 0008).
 *
 * id 만으로는 부족하다 — 그 사이 가맹점 이름이 바뀌었을 수 있고, 그러면 사용자가
 * 본 근거와 실제로 바뀌는 행이 다르다.
 */
function backfillFingerprint(rows) {
  const material = JSON.stringify(
    [...rows]
      .sort((a, b) => a.id - b.id)
      .map((r) => ({ id: r.id, merchant: r.merchant, is_overseas: r.is_overseas }))
  );
  return crypto.createHash('sha256').update(material).digest('hex').slice(0, 32);
}

/**
 * 해외 표시가 있는데 `is_overseas` 가 안 선 거래를 고른다. **DB 를 바꾸지 않는다.**
 *
 * 이미 선 것은 세지 않는다 — 바뀌지 않는 것을 건수에 넣으면 「18건이 바뀝니다」 가
 * 사실이 아니게 된다. 두 번 돌리면 두 번째는 0건이어야 한다.
 *
 * **되돌리는 방향은 하지 않는다.** 표시가 없는데 `is_overseas` 가 선 거래는
 * 사람이 손으로 세운 것일 수 있고, 그것을 기계가 내리면 사람 판단을 지운다.
 */
function planOverseasBackfill(db) {
  const rows = db.prepare(`
    SELECT id, date, merchant, amount, is_overseas
    FROM transactions
    WHERE merchant IS NOT NULL AND merchant <> '' AND is_overseas = 0
    ORDER BY date DESC, id DESC
  `).all();

  const targets = rows.filter((r) => looksOverseas(r.merchant));

  return {
    count: targets.length,
    amount: targets.reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
    // 근거별로 나눠 보여준다. 사용자가 「원 통화가 찍힌 건」 과 「국가코드가
    // 붙은 건」 을 다르게 볼 수 있어야 한다 — 후자가 오탐 여지가 크다.
    byEvidence: targets.reduce((acc, r) => {
      const e = overseasEvidence(r.merchant);
      acc[e] = (acc[e] || 0) + 1;
      return acc;
    }, {}),
    samples: targets.slice(0, SAMPLE_LIMIT).map((r) => ({
      id: r.id,
      date: r.date,
      merchant: r.merchant,
      amount: r.amount,
      evidence: overseasEvidence(r.merchant),
    })),
    ids: targets.map((r) => r.id),
    fingerprint: backfillFingerprint(targets),
  };
}

/**
 * 계획대로 쓴다. 호출부가 지문을 이미 확인한 뒤에만 부른다.
 *
 * 한 트랜잭션으로 묶는다. 중간에 실패해 절반만 바뀌면 사용자는 무엇이 바뀌었는지
 * 알 수 없고 프리뷰에서 본 건수와도 안 맞는다.
 */
function applyOverseasBackfill(db, plan) {
  if (!plan || !Array.isArray(plan.ids) || plan.ids.length === 0) return 0;

  let changed = 0;
  db.transaction(() => {
    // 행 단위로 돈다. 한 문장으로 묶으면 id 목록이 SQLite 변수 상한(999)에
    // 걸린다(`cardRemap` 과 같은 이유).
    const stmt = db.prepare('UPDATE transactions SET is_overseas = 1 WHERE id = ?');
    for (const id of plan.ids) {
      changed += stmt.run(id).changes;
    }
  })();
  return changed;
}

module.exports = {
  looksOverseas,
  overseasEvidence,
  planOverseasBackfill,
  applyOverseasBackfill,
  backfillFingerprint,
  SAMPLE_LIMIT,
};
