'use strict';

// 중복 의심 거래의 "이건 중복이 아니다" 판단을 기억한다(#269 잔여).
//
// 번호가 014 인 이유: 013 은 다른 세션의 반복거래 확장(#278)이 먼저 잡았다.
// 마이그레이션 번호는 세션 간 공유 자원이라 착수 직전에 원격까지 확인해야 한다.
//
// 지우는 것만이 판단이 아니다. 사용자가 둘 다 남겨 두기로 정했는데 목록이 계속
// 같은 행을 보여주면 결국 목록 자체를 무시하게 되고, 그러면 진짜 중복도 놓친다.
//
// 거래가 지워지면 판단도 같이 사라진다(ON DELETE CASCADE 대신 FK 만 둔다 —
// SQLite 는 foreign_keys 가 켜져 있어야 동작하고 db/init.js 가 켜 둔다).
function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS installment_duplicate_dismissals (
      transaction_id INTEGER PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
      dismissed_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

module.exports = { up };
