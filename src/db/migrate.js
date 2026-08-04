'use strict';
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '../../migrations');

const {
  rebuildAuditTriggers,
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
  // 새로 적용된 마이그레이션이 있을 때만 돈다. 매 기동마다 다시 만들 이유가 없다.
  // 017 이전 상태의 DB 는 감사 인프라 자체가 없으므로 건너뛴다.
  if (appliedAny && hasAuditInfrastructure(db)) rebuildAuditTriggers(db);
}

module.exports = { runMigrations };
