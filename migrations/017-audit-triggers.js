'use strict';

// 쓰기 감사 캡처(#299). ADR 0007 의 A+C 혼합 — 트리거가 before/after 를 빠짐없이
// 잡고, 라우트는 action_label 만 얹는다.
//
// **트리거로 잡는 이유**: 앱 코드가 무엇을 하든 빠뜨릴 수 없다. 대량 삭제,
// 임포트, 수동 SQL 까지 전부 걸린다. 라벨을 안 붙여도 로그는 남는다 — 빠뜨려도
// 구멍이 나지 않는 구조가 핵심이다.
//
// **컬럼 목록을 하드코딩하지 않는다.** PRAGMA 로 읽어 트리거를 생성한다. 손으로
// 적으면 컬럼이 늘 때 조용히 캡처에서 빠진다. 다만 트리거는 생성 시점의 컬럼을
// 굳히므로, 나중에 컬럼이 늘면 이 마이그레이션을 다시 돌려 재생성해야 한다 —
// rebuildAuditTriggers 를 export 해 두는 이유다.
//
// **actor/action_id 는 SQLite 가 모른다.** 트리거는 JS 상태를 볼 수 없으므로
// 단일 행 테이블 _audit_context 에서 읽는다. 애플리케이션이 요청 시작 시 이 행을
// 갱신한다. better-sqlite3 가 동기이고 단일 커넥션이라 요청 중간에 다른 요청이
// 끼어들 수 없어 성립하는 방식이다(ADR 0007 의 전제).

// 감사 대상. audit_log 자신과 _audit_context 는 제외한다 — 무한 루프가 된다.
// schema_migrations 도 뺀다. 마이그레이션 이력은 데이터 변경이 아니다.
const EXCLUDED = new Set(['audit_log', '_audit_context', 'schema_migrations', 'sqlite_sequence']);

function targetTables(db) {
  return db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all().map((r) => r.name).filter((n) => !EXCLUDED.has(n));
}

// json_object('col', NEW."col", ...) 를 만든다. 컬럼 이름에 따옴표를 붙여
// 예약어와 충돌하지 않게 한다.
function jsonExpr(alias, cols) {
  const parts = cols.map((c) => `'${c}', ${alias}."${c}"`).join(', ');
  return `json_object(${parts})`;
}

const CTX = `(SELECT actor FROM _audit_context WHERE id=1)`;
const CTX_ID = `(SELECT action_id FROM _audit_context WHERE id=1)`;
const CTX_LABEL = `(SELECT action_label FROM _audit_context WHERE id=1)`;
// ts 는 로컬시각으로 남긴다. strftime(...,'now') 는 UTC 라 KST 자정~9시에 날짜가
// 하루 어긋난다(FND-20). datetime(...,'localtime') 으로 보정한다.
const TS = `datetime('now','localtime')`;

function rebuildAuditTriggers(db) {
  for (const table of targetTables(db)) {
    const cols = db.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name);
    if (cols.length === 0) continue;

    const pk = cols.includes('id') ? 'id' : null;
    const newId = pk ? `NEW."${pk}"` : 'NULL';
    const oldId = pk ? `OLD."${pk}"` : 'NULL';

    for (const op of ['ins', 'upd', 'del']) {
      db.exec(`DROP TRIGGER IF EXISTS audit_${table}_${op}`);
    }

    db.exec(`
      CREATE TRIGGER audit_${table}_ins AFTER INSERT ON "${table}"
      BEGIN
        INSERT INTO audit_log (ts, actor, action_id, action_label, op, table_name, row_id, before_json, after_json)
        VALUES (${TS}, ${CTX}, ${CTX_ID}, ${CTX_LABEL}, 'INSERT', '${table}', ${newId}, NULL, ${jsonExpr('NEW', cols)});
      END;
    `);

    db.exec(`
      CREATE TRIGGER audit_${table}_upd AFTER UPDATE ON "${table}"
      BEGIN
        INSERT INTO audit_log (ts, actor, action_id, action_label, op, table_name, row_id, before_json, after_json)
        VALUES (${TS}, ${CTX}, ${CTX_ID}, ${CTX_LABEL}, 'UPDATE', '${table}', ${newId}, ${jsonExpr('OLD', cols)}, ${jsonExpr('NEW', cols)});
      END;
    `);

    db.exec(`
      CREATE TRIGGER audit_${table}_del AFTER DELETE ON "${table}"
      BEGIN
        INSERT INTO audit_log (ts, actor, action_id, action_label, op, table_name, row_id, before_json, after_json)
        VALUES (${TS}, ${CTX}, ${CTX_ID}, ${CTX_LABEL}, 'DELETE', '${table}', ${oldId}, ${jsonExpr('OLD', cols)}, NULL);
      END;
    `);
  }
}

function up(db) {
  // 트리거가 읽을 컨텍스트. 단일 행이며 애플리케이션이 요청마다 갱신한다.
  // 기본값을 안전한 쪽(system)에 둬, 갱신을 빠뜨린 경로도 기록은 남되
  // 실행취소 후보에는 오르지 않게 한다.
  db.exec(`
    CREATE TABLE IF NOT EXISTS _audit_context (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      actor TEXT NOT NULL DEFAULT 'system',
      action_id TEXT NOT NULL DEFAULT 'bootstrap',
      action_label TEXT
    );
  `);
  db.exec(`INSERT OR IGNORE INTO _audit_context (id, actor, action_id) VALUES (1, 'system', 'bootstrap')`);

  rebuildAuditTriggers(db);
}

module.exports = { up, rebuildAuditTriggers, targetTables, EXCLUDED };
