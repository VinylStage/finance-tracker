'use strict';
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '../../migrations');

const {
  rebuildAuditTriggers,
  auditTriggersComplete,
  hasAuditInfrastructure,
} = require('../../migrations/017-audit-triggers');

// migrations/NNN-*.js 를 파일명 순서대로 한 번씩만 적용하고 schema_migrations에 기록한다.
// 다운 마이그레이션은 없다 — 필요해지면 그때 추가한다(#89 결정 사항).
function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const applied = new Set(db.prepare(`SELECT name FROM schema_migrations`).all().map((r) => r.name));
  const files = fs.existsSync(MIGRATIONS_DIR)
    ? fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.js')).sort()
    : [];

  let appliedAny = false;
  for (const file of files) {
    if (applied.has(file)) continue;
    const migration = require(path.join(MIGRATIONS_DIR, file));
    const apply = db.transaction(() => {
      migration.up(db);
      db.prepare(`INSERT INTO schema_migrations (name) VALUES (?)`).run(file);
    });
    apply();
    appliedAny = true;
  }

  // 감사 트리거는 생성 시점의 테이블과 컬럼을 굳힌다(#299). 마이그레이션이 테이블이나
  // 컬럼을 늘리면 그만큼 캡처에서 빠지므로 체인을 다 적용한 뒤 한 번 재생성한다.
  //
  // 전에는 테이블을 만든 마이그레이션이 각자 rebuildAuditTriggers 를 불렀다(018).
  // 그건 작성자가 그 호출을 기억해야 성립하는 보장이라, 017 이 컬럼을 PRAGMA 로
  // 읽어 자동 판별하게 만든 설계와도 어긋났다 — 호출 시점만 수동이었다(#346).
  //
  // 새로 적용된 마이그레이션이 있거나, 트리거가 하나라도 빠져 있으면 재생성한다.
  //
  // 전에는 `appliedAny` 만 봤다. 그래서 트리거가 한 번 빠지면 다음 기동이 상태를
  // 아예 안 봐서 **영구히 안 돌아왔다**(#454). 커버리지를 같이 보면 원인이 무엇이든
  // 자가치유된다.
  //
  // 트랜잭션으로 감싼다. 재생성은 표마다 지우고 → 만드는데, 중간에 던지면 그 표가
  // 트리거 없이 남는다. SQLite 는 DDL 도 롤백하므로 통째로 되돌아간다.
  if (hasAuditInfrastructure(db) && (appliedAny || !auditTriggersComplete(db))) {
    db.transaction(() => rebuildAuditTriggers(db))();
  }
}

module.exports = { runMigrations };
