'use strict';

// 기존 ad-hoc 마이그레이션(src/db/init.js) 이관. 001과 동일한 이유로 존재 여부를 직접 확인한다.
// 참고: 이 컬럼은 이후 기본 스키마(CREATE TABLE)에도 추가돼 신규 DB에서는 이 마이그레이션이
// 항상 no-op이다 — 컬럼 추가 이전에 생성된 기존 DB를 위해 남겨둔다.
function up(db) {
  const columns = db.prepare(`PRAGMA table_info(transactions)`).all().map((c) => c.name);
  if (!columns.includes('approval_number')) {
    db.exec(`ALTER TABLE transactions ADD COLUMN approval_number TEXT`);
  }
}

module.exports = { up };
