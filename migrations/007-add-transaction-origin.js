'use strict';

// 거래 출처 구분(#268).
//
// 부채·할부·리볼빙에서 자동 생성되는 거래를 사용자가 직접 입력한 거래와
// 구분한다. 지금까지 transactions 의 모든 행이 동등해서 누가 만들었는지 몰랐다.
//
// DEFAULT 'manual' 이라 기존 행은 전부 수동 거래로 남는다. 마이그레이션이
// 동작을 바꾸지 않는다.
//
// installment_id 가 이미 있지만 참조일 뿐 잠금 근거가 아니었고, 리볼빙·부채이자
// 에는 대응 컬럼조차 없었다.
function up(db) {
  const cols = db.prepare('PRAGMA table_info(transactions)').all().map((c) => c.name);

  if (!cols.includes('origin')) {
    db.exec(`ALTER TABLE transactions ADD COLUMN origin TEXT NOT NULL DEFAULT 'manual'`);
  }
  if (!cols.includes('origin_ref_table')) {
    db.exec(`ALTER TABLE transactions ADD COLUMN origin_ref_table TEXT`);
  }
  if (!cols.includes('origin_ref_id')) {
    db.exec(`ALTER TABLE transactions ADD COLUMN origin_ref_id INTEGER`);
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tx_origin
      ON transactions(origin, origin_ref_table, origin_ref_id);
  `);
}

module.exports = { up };
