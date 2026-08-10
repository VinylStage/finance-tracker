'use strict';

// 결제 방식 3분류와 현금흐름 시점 분리(#289).
//
// ─────────────────────────────────────────────────────────────────────────
// 거래 한 행의 의미가 바뀐다
//
// 지금 `transactions` 의 한 행은 "돈이 움직였다" 를 뜻한다. 신용카드로 긁은
// 것도 통장에서 빠진 것도 같은 모양이다. 그래서 "지금 통장에 얼마 있나" 를
// 계산하면 아직 빠지지 않은 카드값까지 이미 빠진 것으로 센다.
//
//   신용카드 구매      통장 변화 없음   카드 미결제액 증가
//   카드대금 인출      통장 감소        카드 미결제액 감소
//   체크카드·현금·이체  통장 즉시 감소   해당 없음
//
// 즉 거래에 **"언제 현금이 움직이는가"** 축이 생긴다. `origin`(누가 만들었나)과
// 직교하는 별개 축이다.
//
// ─────────────────────────────────────────────────────────────────────────
// 기존 거래를 건드리지 않는다
//
// `DEFAULT 'immediate'` 라 기존 거래는 전부 즉시 차감으로 남는다. **마이그레이션이
// 잔액을 바꾸지 않는다.**
//
// 사용자는 이미 신용카드 결제를 구분 없이 기록해 왔다. 여기서 자동으로 `deferred`
// 로 바꾸면 과거 잔액이 전부 달라진다. 이 저장소는 실거래 2,212건 유실 사고를
// 겪었고, 조용한 대량 변경은 같은 범주의 위험이다(ADR 0008).
//
// 결제수단별 일괄 재분류는 **프리뷰 → 확인을 거치는 별도 도구**로 낸다.
//
// ─────────────────────────────────────────────────────────────────────────
// account_id 를 백필하지 않는 이유
//
// `payment_methods.account_id` 가 이미 있어 여기서 채울 수 있지만 채우지 않는다.
// 백필은 기존 행을 고치는 대량 변경이라 ADR 0008 대상이 된다. 읽는 쪽에서
// `COALESCE(t.account_id, pm.account_id)` 로 떨어뜨리면 백필 없이도 동작한다.
//
// 그럼 이 컬럼은 왜 필요한가 — **과거를 고정하기 위해서다.** 결제수단이 나중에
// 다른 계좌로 옮겨지면 `payment_methods` 만 보는 계산은 과거 거래의 계좌까지
// 바꿔 버린다. 명시된 행은 그 값을 지킨다.
//
// ─────────────────────────────────────────────────────────────────────────
// CHECK 를 걸지 않는 이유
//
// `settlement` 은 3값 열거형이지만 `CHECK` 대신 `src/constants.js` + 라우트
// 검증으로 간다. `payment_style` 과 같은 방식이고 그 이유도 같다 — SQLite 는
// 기존 테이블에 CHECK 를 더하려면 재생성이 필요하고, 값이 늘 때(리볼빙 #293)
// 감사 트리거까지 다시 만들어야 해 실수 지점이 는다.
//
// ─────────────────────────────────────────────────────────────────────────
// 감사 트리거를 여기서 재생성하지 않는다
//
// `transactions` 에 컬럼이 늘면 트리거가 새 컬럼을 놓친다. 예전에는 마이그레이션이
// 직접 `rebuildAuditTriggers` 를 불러야 했지만, #346(PR #356)이 그 책임을
// `runMigrations()` 로 옮겼다. 여기서 부르지 않는다.

function up(db) {
  const cols = db.prepare('PRAGMA table_info(transactions)').all().map((c) => c.name);

  if (!cols.includes('settlement')) {
    db.exec(`ALTER TABLE transactions ADD COLUMN settlement TEXT NOT NULL DEFAULT 'immediate'`);
  }

  if (!cols.includes('account_id')) {
    db.exec(`ALTER TABLE transactions ADD COLUMN account_id INTEGER REFERENCES accounts(id)`);
  }

  if (!cols.includes('billing_month')) {
    // 'YYYY-MM'. deferred 건이 어느 청구서에 실리는지다. 청구 주기를 모르면
    // 비워 둔다 — 추측해서 채우면 거래가 이유 없이 다른 달에 가 있다(#290).
    db.exec(`ALTER TABLE transactions ADD COLUMN billing_month TEXT`);
  }

  // 잔액 계산이 도는 세 축이다.
  //
  // 통장 잔액   = opening_balance + Σ(immediate) − Σ(settlement)
  // 카드 미결제 = Σ(deferred) − Σ(대응 billing_month 의 settlement)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tx_settlement_date
      ON transactions(settlement, date)
  `);

  // billing_month 는 deferred 건에만 있다. 부분 인덱스로 두면 나머지 거래가
  // 인덱스에서 빠져, 거래가 쌓여도 청구월 조회 비용이 안 는다.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tx_billing_month
      ON transactions(billing_month) WHERE billing_month IS NOT NULL
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tx_account
      ON transactions(account_id) WHERE account_id IS NOT NULL
  `);
}

module.exports = { up };
