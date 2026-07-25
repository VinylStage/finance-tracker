'use strict';

// 기존 ad-hoc 마이그레이션(src/db/init.js에 있던 PRAGMA table_info 체크)을 그대로 이관.
// ALTER TABLE ADD COLUMN을 SQLite가 IF NOT EXISTS로 지원하지 않아 존재 여부를 직접 확인한다.
function up(db) {
  const columns = db.prepare(`PRAGMA table_info(debts)`).all().map((c) => c.name);
  if (!columns.includes('type')) {
    db.exec(`ALTER TABLE debts ADD COLUMN type TEXT DEFAULT '일반'`);
  }
}

module.exports = { up };
