'use strict';

// 혜택에 결제방식 제약을 단다(#563).
//
// 카드사 상당수가 **할부 거래를 혜택 대상에서 뺀다.** 지금 계산은 결제방식을
// 보지 않아 할부에도 일시불 혜택이 그대로 붙는다. 실제로 그것 때문에 카드
// 하나의 혜택 입력을 통째로 되돌린 적이 있다(2026-08-11) — 일시불 217건을
// 살리려면 할부 4건의 과대추정을 감수해야 했기 때문이다.
//
// 판정에 필요한 값은 이미 `transactions.payment_style` 에 다 있다. 없던 것은
// **혜택 쪽에 "어느 결제방식에만 적용되는가" 를 적을 자리**다.
//
// ─────────────────────────────────────────────────────────────────────────
// NULL 이 기본이다
//
// 비워 두면 결제방식을 가리지 않는다 — 지금 들어가 있는 혜택 34건이 이
// 변경으로 달라지면 안 된다. 제약은 넣은 혜택에만 걸린다.
//
// 값 목록을 CHECK 로 묶지 않는다. `payment_styles` 는 앱 상수(PAYMENT_STYLES)가
// 관리하고, 여기서 제약을 이중으로 걸면 상수를 늘릴 때 마이그레이션이 또 필요해진다.

function up(db) {
  const cols = db.prepare('PRAGMA table_info(card_benefits)').all().map((c) => c.name);
  if (!cols.includes('payment_style')) {
    db.exec('ALTER TABLE card_benefits ADD COLUMN payment_style TEXT');
  }
}

module.exports = { up };
