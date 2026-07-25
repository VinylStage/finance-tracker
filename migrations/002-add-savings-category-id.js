'use strict';

// 기존 ad-hoc 마이그레이션(src/db/init.js) 이관. 001과 동일한 이유로 존재 여부를 직접 확인한다.
function up(db) {
  const columns = db.prepare(`PRAGMA table_info(savings_products)`).all().map((c) => c.name);
  if (!columns.includes('category_id')) {
    db.exec(`ALTER TABLE savings_products ADD COLUMN category_id INTEGER REFERENCES categories(id)`);
  }
}

module.exports = { up };
