'use strict';
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '../../migrations');

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

  for (const file of files) {
    if (applied.has(file)) continue;
    const migration = require(path.join(MIGRATIONS_DIR, file));
    const apply = db.transaction(() => {
      migration.up(db);
      db.prepare(`INSERT INTO schema_migrations (name) VALUES (?)`).run(file);
    });
    apply();
  }
}

module.exports = { runMigrations };
