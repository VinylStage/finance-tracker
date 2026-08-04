'use strict';
const { runAs } = require('../utils/auditContext');

// 1단계 실행취소(#300). 감사로그가 변경 전/후를 갖고 있으므로, 되돌리기는
// "가장 최근 미취소 작업 그룹을 역적용" 하는 것이다. 별도 저장소가 필요 없다.
//
// **1단계만이다.** 다단계 히스토리도 redo 도 만들지 않는다.

// 되돌릴 수 있는 그룹의 조건.
//
// - actor='user' 만: 사용자가 하지 않은 일을 되돌릴 수 있으면 안 된다. 특히
//   GET 마다 도는 만료 할부 스윕(#205)이 "가장 최근 작업" 이 되기 쉽다.
// - undone_at IS NULL: 이미 되돌린 그룹은 두 번 되돌리지 않는다.
// - undo_of IS NULL: 되돌리기가 만든 로그가 다시 후보가 되면 사실상 redo 이고,
//   반복 클릭 시 원상복구가 무한히 오간다.
// - RESTORE 제외: 백업 복원은 되돌리기의 단위가 아니다. 그건 백업 복원의 일이다.
const CANDIDATE_SQL = `
  SELECT action_id, MAX(id) AS last_id
  FROM audit_log
  WHERE actor = 'user'
    AND undone_at IS NULL
    AND undo_of IS NULL
    AND action_id NOT IN (
      SELECT action_id FROM audit_log WHERE op = 'RESTORE'
    )
  GROUP BY action_id
  ORDER BY last_id DESC
  LIMIT 1
`;

function findUndoable(db) {
  const head = db.prepare(CANDIDATE_SQL).get();
  if (!head) return null;

  const entries = db.prepare(
    `SELECT * FROM audit_log WHERE action_id = ? ORDER BY id ASC`
  ).all(head.action_id);

  if (entries.length === 0) return null;

  return {
    actionId: head.action_id,
    label: entries.find((e) => e.action_label)?.action_label || null,
    ts: entries[0].ts,
    entries,
  };
}

function parse(json) {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// 현재 행이 로그의 after_json 과 같은지 본다.
//
// 다르면 그 뒤에 누군가(또는 시스템 스윕이) 또 바꾼 것이다. 그대로 되돌리면
// 그 변경을 **조용히 덮어쓴다.** 조용히 덮어쓰는 게 최악이라 거부한다.
//
// 비교는 로그에 남은 컬럼만 본다. 마이그레이션으로 컬럼이 늘면 현재 행에는
// 있고 로그에는 없는 키가 생기는데, 그것 때문에 되돌리기가 막히면 안 된다.
function matchesAfter(current, after) {
  if (!after) return current === undefined || current === null;
  if (!current) return false;
  for (const [k, v] of Object.entries(after)) {
    // SQLite 는 정수/실수를 구분하지만 JSON 왕복에서 흔들릴 수 있어 느슨히 본다.
    if (String(current[k] ?? '') !== String(v ?? '')) return false;
  }
  return true;
}

function reject(reason) {
  return { ok: false, reason };
}

function applyUndo(db, actionId) {
  const entries = db.prepare(
    `SELECT * FROM audit_log WHERE action_id = ? ORDER BY id ASC`
  ).all(actionId);

  if (entries.length === 0) {
    return reject('되돌릴 작업을 찾을 수 없어요. 이미 되돌렸거나 기록이 정리됐을 수 있어요.');
  }
  if (entries.some((e) => e.undone_at)) {
    return reject('이미 되돌린 작업이에요.');
  }
  if (entries.some((e) => e.op === 'RESTORE')) {
    return reject('백업 복원은 되돌리기로 취소할 수 없어요. 백업 파일에서 다시 불러와 주세요.');
  }
  if (entries.some((e) => e.actor !== 'user')) {
    return reject('자동으로 처리된 작업이라 되돌릴 수 없어요.');
  }

  // 먼저 전부 검사한 뒤에 쓴다. 절반 되돌리고 막히면 상태가 더 나빠진다.
  for (const e of entries) {
    if (e.op === 'INSERT' || e.op === 'UPDATE') {
      const current = db.prepare(`SELECT * FROM "${e.table_name}" WHERE id = ?`).get(e.row_id);
      if (!matchesAfter(current, parse(e.after_json))) {
        return reject('그 사이에 값이 또 바뀌어서 되돌릴 수 없어요. 지금 값을 확인한 뒤 직접 고쳐 주세요.');
      }
    }
    if (e.op === 'DELETE') {
      // 지워진 자리에 다른 행이 들어와 있으면 원래 id 로 되살릴 수 없다.
      const occupied = db.prepare(`SELECT 1 FROM "${e.table_name}" WHERE id = ?`).get(e.row_id);
      if (occupied) {
        return reject('되살릴 자리에 다른 기록이 들어와 있어 되돌릴 수 없어요.');
      }
    }
  }

  const run = db.transaction(() => {
    let reverted = 0;

    // 역순으로 되돌린다. 한 작업 안에서 삭제 후 삽입이 섞이면(#269 재생성)
    // 순서대로 뒤집으면 충돌한다.
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];

      if (e.op === 'INSERT') {
        db.prepare(`DELETE FROM "${e.table_name}" WHERE id = ?`).run(e.row_id);
        reverted++;
        continue;
      }

      const before = parse(e.before_json);
      if (!before) continue;

      if (e.op === 'DELETE') {
        // **원래 id 로 되살린다.** 다른 테이블이 그 id 를 참조하기 때문이다 —
        // transactions.installment_id, origin_ref_id 등. 새 id 로 넣으면 참조가
        // 끊긴 채 복구된 것처럼 보인다.
        const cols = Object.keys(before);
        const placeholders = cols.map(() => '?').join(', ');
        const names = cols.map((c) => `"${c}"`).join(', ');
        db.prepare(`INSERT INTO "${e.table_name}" (${names}) VALUES (${placeholders})`)
          .run(...cols.map((c) => before[c]));
        reverted++;
        continue;
      }

      if (e.op === 'UPDATE') {
        const cols = Object.keys(before).filter((c) => c !== 'id');
        const setClause = cols.map((c) => `"${c}" = ?`).join(', ');
        db.prepare(`UPDATE "${e.table_name}" SET ${setClause} WHERE id = ?`)
          .run(...cols.map((c) => before[c]), e.row_id);
        reverted++;
      }
    }

    // 되돌린 그룹에 표시한다. 두 번 되돌려지지 않는 근거다.
    db.prepare(`UPDATE audit_log SET undone_at = datetime('now','localtime') WHERE action_id = ?`)
      .run(actionId);

    // 되돌리기가 만든 로그가 다시 후보가 되지 않도록 표시한다.
    db.prepare(`UPDATE audit_log SET undo_of = ? WHERE undo_of IS NULL AND action_id = (
      SELECT action_id FROM audit_log ORDER BY id DESC LIMIT 1
    ) AND action_id != ?`).run(actionId, actionId);

    return reverted;
  });

  // 되돌리기 자체도 쓰기다. 사용자가 지시했지만 파생 거래 잠금(#268)을 통과해야
  // 하므로 시스템 컨텍스트로 실행한다 — 그 사실이 로그에 actor=system 으로 남는다.
  const reverted = runAs('system', run);
  return { ok: true, reverted };
}

module.exports = { findUndoable, applyUndo };
