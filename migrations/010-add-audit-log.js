'use strict';

// 감사로그 테이블(#297).
//
// 모든 쓰기의 변경 전/후 값을 남긴다. 그 위에 1단계 실행취소(#300)가 얹힌다.
//
// action_id 가 이 설계의 핵심이다. 한 번의 사용자 동작이 여러 행을 바꾸는데
// (#269 의 파생 거래 재생성은 삭제 N + 삽입 N), 실행취소는 그 여러 행을 하나로
// 되돌려야 한다. 행 단위로 되돌리면 사용자가 N 번 눌러야 하고 중간 상태가 깨진다.
// ts 로 묶는 방법은 쓸 수 없다 — 같은 시각이 같은 작업을 뜻하지 않는다.
//
// ts 는 로컬시각으로 넣는다. strftime(...,'now') 는 UTC 라서 KST 자정~9시 사이에
// 날짜가 하루 어긋난다(FND-20 에서 실제로 겪은 문제라 DEFAULT 를 두지 않고
// 애플리케이션이 계산해 넣게 한다).
function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id           INTEGER PRIMARY KEY,
      ts           TEXT    NOT NULL,
      actor        TEXT    NOT NULL,
      action_id    TEXT    NOT NULL,
      action_label TEXT,
      op           TEXT    NOT NULL,
      table_name   TEXT    NOT NULL,
      row_id       INTEGER,
      before_json  TEXT,
      after_json   TEXT,
      undone_at    TEXT,
      undo_of      TEXT
    );
  `);

  // 실행취소는 "가장 최근의 미취소 작업 그룹"을 찾는다. 그 조회가 타는 인덱스다.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_action
      ON audit_log(action_id);
  `);

  // 되돌리기 후보 조회는 undone_at IS NULL 인 행만 본다. 부분 인덱스로 두면
  // 이미 되돌린 행이 인덱스에서 빠져, 로그가 쌓여도 후보 조회 비용이 안 는다.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_undoable
      ON audit_log(id DESC) WHERE undone_at IS NULL;
  `);

  // 감사 이력 화면은 시간 역순으로 읽고 actor 로 거른다.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_ts
      ON audit_log(ts DESC, actor);
  `);
}

module.exports = { up };
