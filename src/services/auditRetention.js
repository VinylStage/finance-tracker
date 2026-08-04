'use strict';

// 감사로그 보존 정책(#367).
//
// 트리거로 잡으면 빠뜨릴 수 없다(ADR 0007). 그게 장점이자 이 문제의 원인이다 —
// **쓰기 1건이 감사 행 1건**이라 로그가 데이터보다 빨리 는다. 실측으로 거래
// 100건 삽입에 감사 행 100건, 행당 평균 285바이트였다. UPDATE 는 before/after 를
// 둘 다 담아 대략 2배다.
//
// ─────────────────────────────────────────────────────────────────────────
// 기간 기준을 쓴다 (행수 아님)
//
// 행수 상한은 **임포트 한 번에 넘겨 방금 한 작업이 잘려 나갈 수 있다.** 카드
// 명세서 한 장이 수백 행이다. 기간은 "석 달치 이력을 보관해요" 로 설명되고,
// 사용자가 예측할 수 있다.
//
// ─────────────────────────────────────────────────────────────────────────
// 되돌릴 수 있는 것은 지우지 않는다
//
// 실행취소는 "가장 최근 미취소 사용자 작업 그룹" 을 찾는다(undo.js). 정리가 그
// 그룹을 지우면 **되돌리기가 조용히 불가능해진다.** 버튼은 그대로 있는데 누르면
// 아무 일도 안 일어나는 상태가 최악이다.
//
// 그래서 보존 기간과 **무관하게** 그 그룹은 남긴다. 오래 앱을 안 켠 사용자의
// 마지막 작업이 기간 밖에 있어도 되돌릴 수 있어야 한다.

const { findUndoable } = require('./undo');

// 기본 180일. 짧으면 감사로그의 가치가 사라진다 — "그때 무슨 일이 있었나" 를
// 답하지 못하는 로그는 없는 것과 같다. 실사용에서 정리가 거의 안 도는 값으로 둔다.
const DEFAULT_RETENTION_DAYS = 180;

// 로컬시각 기준으로 자른다. audit_log.ts 가 datetime('now','localtime') 이라
// UTC 로 비교하면 KST 자정~9시에 하루 어긋난다(FND-20 과 같은 함정).
function cutoffDate(db, days) {
  return db.prepare(`SELECT date(datetime('now','localtime'), ?) AS d`)
    .get(`-${days} days`).d;
}

/**
 * 보존 기간이 지난 감사로그를 지운다.
 *
 * @returns {{deleted:number, cutoff:string, days:number, keptActionId:string|null, ran:boolean}}
 */
function purgeAuditLog(db, options = {}) {
  const days = Number.isInteger(options.days) && options.days > 0
    ? options.days
    : DEFAULT_RETENTION_DAYS;

  // 017 이전 DB 에는 audit_log 가 없다. 기동 경로에서 부르므로 던지면 안 된다.
  const hasTable = db.prepare(
    `SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='audit_log'`
  ).get().n === 1;
  if (!hasTable) return { deleted: 0, cutoff: null, days, keptActionId: null, ran: false };

  const cutoff = cutoffDate(db, days);

  // 지금 되돌릴 수 있는 그룹. 이것만 기간 예외를 받는다.
  let keptActionId = null;
  try {
    const candidate = findUndoable(db);
    keptActionId = candidate ? candidate.actionId : null;
  } catch {
    // 후보를 못 찾는 것이 정리를 막을 이유는 아니다. 다만 그때는 아무것도
    // 예외로 두지 않으므로, 실패하면 보수적으로 정리를 건너뛴다.
    return { deleted: 0, cutoff, days, keptActionId: null, ran: false };
  }

  // ts 는 'YYYY-MM-DD HH:MM:SS' 라 date() 로 잘라 날짜만 비교한다.
  const stmt = keptActionId
    ? db.prepare(`DELETE FROM audit_log WHERE date(ts) < ? AND action_id <> ?`)
    : db.prepare(`DELETE FROM audit_log WHERE date(ts) < ?`);

  const deleted = keptActionId
    ? stmt.run(cutoff, keptActionId).changes
    : stmt.run(cutoff).changes;

  return { deleted, cutoff, days, keptActionId, ran: true };
}

// 사후 고지(ADR 0008 의 #279 경계 사례와 같은 형태). 사전 확인 없이 돌리되
// 결과를 알린다 — 정리는 사용자가 지시한 게 아니라 정책이 하는 일이고, 앱을
// 열 때마다 확인을 받으면 흐름을 막는다.
let lastSummary = { deleted: 0, cutoff: null, days: DEFAULT_RETENTION_DAYS, ran: false };

function setLastPurgeSummary(summary) { lastSummary = summary; }
function getLastPurgeSummary() { return { ...lastSummary }; }

module.exports = {
  purgeAuditLog, setLastPurgeSummary, getLastPurgeSummary, DEFAULT_RETENTION_DAYS,
};
