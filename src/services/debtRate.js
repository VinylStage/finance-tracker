'use strict';

// 부채 금리의 시점별 이력(#285).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 이력이 필요한가
//
// 실제 사용 중인 마이너스통장이 3개월 주기 변동금리다. debts.annual_rate 한 칸만
// 두면 금리가 바뀐 뒤에는 과거 이자를 재현할 수 없다 — 지금 금리로 소급 계산하면
// 그때 실제로 청구된 금액과 다른 값이 나온다.
//
//   잔액 3,566,196 / 4.17% 30일 + 4.55% 30일
//     시점별 적용   12,222 + 13,336 = 25,558   ← 맞는 값
//     현재 금리 소급              = 26,673   ← 1,115원 어긋남
//
// card_installment_policies 가 effective_from / effective_to 로 같은 문제를 푼다.
// 같은 모양을 쓰면 조회와 겹침 판정이 같은 방식으로 읽힌다.
// ─────────────────────────────────────────────────────────────────────────
//
// debts.annual_rate 는 남긴다. 목록 조회가 조인 없이 현재 금리를 읽어야 하기
// 때문이다. 대신 **정본은 이력**이고 annual_rate 는 거기서 파생된 현재값이다.
// 두 값이 어긋나면 안 되므로 쓰기 경로를 setDebtRate 하나로 모으고, 일치 여부를
// 테스트로 고정한다 — 같은 뜻의 값이 두 곳에 있으면서 각자 갱신되면 #267
// free_months 때와 같은 결함이 난다.
//
// DB 핸들을 인자로 받는다. 실사용 DB 없이 전부 테스트할 수 있어야 한다.

// 'YYYY-MM-DD' 문자열 비교로 판정한다. Date 파싱은 타임존에 따라 하루가 밀린다
// (utils/date.js 와 services/cardPolicy.js 가 존재하는 이유와 같은 문제).
function isEffectiveOn(row, date) {
  if (date < row.effective_from) return false;
  if (row.effective_to && date > row.effective_to) return false;
  return true;
}

// 그 날짜에 적용되던 연이율. 없으면 null.
//
// null 을 0 으로 흘리지 않는다. 금리를 모르는 구간을 0% 로 계산하면 이자가
// 조용히 사라진다 — 호출부가 "이 구간은 계산할 수 없다" 를 알아야 한다.
function rateAt(db, debtId, date) {
  const rows = db.prepare(`
    SELECT * FROM debt_rate_history WHERE debt_id = ? ORDER BY effective_from ASC
  `).all(debtId);
  const found = rows.find((r) => isEffectiveOn(r, date));
  return found ? found.annual_rate : null;
}

// 기간에 걸친 금리 구간 목록. #286 이 잔액 타임라인과 합쳐 구간을 자를 때 쓴다.
//
// [from, to) 반개구간으로 돌려준다. 하루를 양쪽 구간에서 두 번 세지 않기 위해서다 —
// 이자 계산에서 하루 중복은 그대로 금액 오차가 된다.
function rateTimeline(db, debtId, from, to) {
  const rows = db.prepare(`
    SELECT * FROM debt_rate_history WHERE debt_id = ? ORDER BY effective_from ASC
  `).all(debtId);
  if (!rows.length) return [];

  const segments = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const next = rows[i + 1];
    // 이 행이 실제로 유효한 마지막 날의 다음 날. effective_to 가 있으면 그 다음
    // 날이고, 없으면 다음 행이 시작하는 날이다.
    const endExclusive = row.effective_to
      ? addDay(row.effective_to)
      : (next ? next.effective_from : null);

    const segFrom = row.effective_from > from ? row.effective_from : from;
    const segTo = endExclusive && endExclusive < to ? endExclusive : to;
    if (segFrom < segTo) {
      segments.push({ from: segFrom, to: segTo, annual_rate: row.annual_rate });
    }
  }
  return segments;
}

function addDay(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}

function previousDay(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - 1));
  return dt.toISOString().slice(0, 10);
}

// 사용자에게 그대로 보이는 문구다(#231).
function validateRateChange({ annual_rate, effective_from }) {
  if (!Number.isFinite(annual_rate)) {
    return '금리를 숫자로 입력해 주세요.';
  }
  if (annual_rate < 0 || annual_rate > 100) {
    return '금리는 0에서 100 사이로 입력해 주세요.';
  }
  if (!effective_from || !/^\d{4}-\d{2}-\d{2}$/.test(effective_from)) {
    return '금리가 적용되기 시작한 날짜를 입력해 주세요.';
  }
  return null;
}

/**
 * 금리를 바꾼다. 열려 있던 이력을 닫고 새 구간을 연다.
 *
 * 같은 시작일로 다시 넣으면 그 행을 고친다 — 사용자가 날짜를 잘못 적었다가
 * 바로잡는 흐름이 흔하고, 그때마다 이력이 한 줄씩 늘면 읽을 수 없게 된다.
 *
 * @returns {{ id:number, closed:number }} 새(또는 갱신된) 이력 id 와 닫은 행 수
 */
function setDebtRate(db, debtId, { annual_rate, effective_from, memo = null }) {
  const rate = Number(annual_rate);
  let result;

  const run = db.transaction(() => {
    const existing = db.prepare(
      'SELECT * FROM debt_rate_history WHERE debt_id = ? AND effective_from = ?'
    ).get(debtId, effective_from);

    if (existing) {
      db.prepare('UPDATE debt_rate_history SET annual_rate = ?, memo = ? WHERE id = ?')
        .run(rate, memo, existing.id);
      result = { id: existing.id, closed: 0 };
    } else {
      // 새 구간이 시작되는 날의 전날로 이전 구간을 닫는다. 열린 구간이 둘이면
      // rateAt 이 어느 쪽을 고를지 알 수 없다.
      const closed = db.prepare(`
        UPDATE debt_rate_history
        SET effective_to = ?
        WHERE debt_id = ? AND effective_from < ? AND (effective_to IS NULL OR effective_to >= ?)
      `).run(previousDay(effective_from), debtId, effective_from, effective_from).changes;

      const info = db.prepare(`
        INSERT INTO debt_rate_history (debt_id, annual_rate, effective_from, memo)
        VALUES (?, ?, ?, ?)
      `).run(debtId, rate, effective_from, memo);
      result = { id: Number(info.lastInsertRowid), closed };
    }

    // debts.annual_rate 는 **현재** 금리다. 과거 날짜로 이력을 끼워 넣는 경우에는
    // 건드리면 안 된다 — 오늘 적용되는 금리가 바뀐 게 아니기 때문이다.
    const today = todayYMD();
    const current = rateAt(db, debtId, today);
    if (current !== null) {
      db.prepare('UPDATE debts SET annual_rate = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(current, debtId);
    }
  });
  run();

  return result;
}

// 로컬 기준 오늘. utils/date.js 의 localYMD 와 같은 이유로 UTC 를 쓰지 않는다.
function todayYMD() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function listRates(db, debtId) {
  return db.prepare(`
    SELECT * FROM debt_rate_history WHERE debt_id = ? ORDER BY effective_from DESC
  `).all(debtId);
}

module.exports = {
  isEffectiveOn, rateAt, rateTimeline, setDebtRate, listRates,
  validateRateChange, addDay, previousDay,
};
