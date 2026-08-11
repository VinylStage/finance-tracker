'use strict';

// 계좌(통장)와 결제방식 축을 걷어낸다.
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 지우나
//
// 계좌는 요청된 적이 없는 기능이다. 018 이 `accounts` 를 세우고 021 이 그 위에
// 결제방식 축(`settlement` · `billing_month`)을 얹었는데, **계좌를 만드는 화면이
// 끝내 만들어지지 않았다.** 서버에는 CRUD 가 다 있고 클라이언트에는 쓰기 호출이
// 하나도 없다. 그래서 통장 화면은 영구 빈 상태였다.
//
// 결제방식 축은 계좌 잔액을 계산하려고 존재한다 — "카드로 긁은 것"과 "카드값이
// 통장에서 빠진 것"을 나눠야 잔액이 맞기 때문이다. 그 결과가 나가는 화면이
// 통장 하나뿐이라, 계좌를 지우면 이 축은 계산은 하는데 보여줄 데가 없어진다.
// 설정에서 만질 수는 있는데 결과가 어디에도 안 나타나는 기능이 되므로 함께
// 걷어낸다.
//
// ─────────────────────────────────────────────────────────────────────────
// 데이터 손실이 없다는 근거
//
// 착수 시점 실거래 DB 실측이다.
//
//   accounts                      0 행
//   payment_methods.account_id    0 행 (전부 NULL)
//   transactions.account_id       0 행 (전부 NULL)
//   transactions.billing_month    0 행 (전부 NULL)
//   transactions.settlement       580 행 전부 'immediate' (컬럼 기본값)
//
// 즉 이 축에 사용자가 넣은 값이 하나도 없다. `settlement` 은 021 이 넣은
// `DEFAULT 'immediate'` 그대로다. 지워도 되돌릴 값이 없다.
//
// 그래도 이 마이그레이션은 되돌릴 수 없다. 실행 전 백업을 받는다 — 이 저장소는
// 실거래 2,212건 유실 사고를 겪었고(ADR 0008), 스키마 변경은 그 사고와 같은
// 범주다.
//
// ─────────────────────────────────────────────────────────────────────────
// 순서가 중요하다
//
// SQLite 의 `ALTER TABLE ... DROP COLUMN` 은 그 컬럼을 **트리거나 인덱스가
// 참조하면 거부한다.** 감사 트리거(017)는 `PRAGMA table_info` 로 컬럼을 전수로
// 읽어 `json_object(...)` 를 만들므로 지우려는 컬럼을 반드시 참조한다.
//
//   1. 감사 트리거를 내린다      ← 안 내리면 3번이 실패한다
//   2. 인덱스를 지운다           ← 021 이 만든 세 개
//   3. 컬럼을 지운다
//   4. accounts 를 지운다
//
// 트리거는 여기서 다시 만들지 않는다. `runMigrations()` 가 체인을 다 적용한 뒤
// 한 번에 재생성한다(#346). 새 마이그레이션이 적용됐으므로 그 경로는 반드시
// 돈다. 여기서 부르면 중복이다.

// 021 이 만든 인덱스. 이름으로 지운다 — 컬럼을 지우면 딸려 사라질 것 같지만
// SQLite 는 그 전에 거부한다.
const INDEXES = [
  'idx_tx_settlement_date',
  'idx_tx_billing_month',
  'idx_tx_account',
  'idx_payment_methods_account',
  'idx_accounts_name',
];

const TX_COLUMNS = ['settlement', 'account_id', 'billing_month'];

function up(db) {
  // 1. 감사 트리거를 내린다.
  //
  // 대상 테이블만 정확히 짚는다. 전체를 내리면 이 마이그레이션이 실패했을 때
  // 다른 표까지 트리거 없이 남는다 — 재생성이 자동이라 결국 복구되지만,
  // 실패 지점과 무관한 표를 건드릴 이유가 없다.
  for (const table of ['transactions', 'payment_methods', 'accounts']) {
    for (const op of ['ins', 'upd', 'del']) {
      db.exec(`DROP TRIGGER IF EXISTS audit_${table}_${op}`);
    }
  }

  // 2. 인덱스.
  for (const name of INDEXES) {
    db.exec(`DROP INDEX IF EXISTS ${name}`);
  }

  // 3. 컬럼.
  //
  // 이미 지워진 DB(재실행·부분 실패 후 복구)에서도 돌아야 하므로 존재를 보고
  // 지운다. `DROP COLUMN IF EXISTS` 문법은 SQLite 에 없다.
  const txCols = db.prepare('PRAGMA table_info(transactions)').all().map((c) => c.name);
  for (const col of TX_COLUMNS) {
    if (txCols.includes(col)) {
      db.exec(`ALTER TABLE transactions DROP COLUMN "${col}"`);
    }
  }

  const pmCols = db.prepare('PRAGMA table_info(payment_methods)').all().map((c) => c.name);
  if (pmCols.includes('account_id')) {
    db.exec('ALTER TABLE payment_methods DROP COLUMN "account_id"');
  }

  // 4. 표.
  db.exec('DROP TABLE IF EXISTS accounts');
}

module.exports = { up };
