'use strict';
const { rebuildAuditTriggers } = require('./017-audit-triggers');

// 계좌(통장) 엔티티(#288).
//
// "지금 통장에 얼마 있나" 를 앱이 답할 수 없었다. payment_methods 는 결제 수단일
// 뿐 잔액이 없고, app_settings 의 초기 잔액은 거래 합산 추정이지 계좌 잔액이
// 아니다.
//
// **현재 잔액을 컬럼으로 저장하지 않는다.** opening_balance + 그 이후 거래
// 합산으로 계산한다. 잔액을 컬럼에 들고 있으면 거래를 수정·삭제할 때마다
// 갱신해야 하고, 한 번이라도 어긋나면 그 뒤가 전부 틀린다. 이 저장소는 이미
// 거래 삭제 사고를 겪었다 — 파생값은 계산으로 얻는 편이 복구 가능하다.
//
// 성능이 문제가 되면 그때 스냅샷 캐시를 넣는다. 수천 건 규모에서는 합산이
// 충분히 빠르다.
function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      opening_balance INTEGER NOT NULL DEFAULT 0,
      opening_date TEXT NOT NULL,
      credit_limit INTEGER,
      is_active INTEGER DEFAULT 1,
      memo TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 같은 이름의 계좌가 둘이면 사용자가 구분할 수 없다.
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_name ON accounts(name)`);

  // 체크카드·계좌이체는 특정 계좌에 직결된다. 신용카드는 카드대금이 빠져나가는
  // 결제 계좌가 있다. 현금은 계좌가 없을 수 있으므로 NULL 을 허용한다 —
  // 기존 결제수단이 그대로 동작한다.
  const cols = db.prepare('PRAGMA table_info(payment_methods)').all().map((c) => c.name);
  if (!cols.includes('account_id')) {
    db.exec(`ALTER TABLE payment_methods ADD COLUMN account_id INTEGER REFERENCES accounts(id)`);
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_payment_methods_account
      ON payment_methods(account_id);
  `);

  // 새 테이블은 감사 캡처 대상이다(#299). 트리거는 생성 시점의 테이블만 덮으므로
  // 여기서 재생성해야 accounts 가 빠지지 않는다 — test/audit-coverage.test.js 가
  // 이걸 빠뜨리면 실패한다.
  //
  // payment_methods 에 컬럼이 늘었으므로 그쪽 트리거도 새 컬럼을 잡도록 다시 만든다.
  rebuildAuditTriggers(db);
}

module.exports = { up };
