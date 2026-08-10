'use strict';

// 카드 실적 구간과 거래별 실적 제외(#526).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 컬럼이 아니라 표인가
//
// 지금은 `card_products.prev_month_threshold` 가 INTEGER 한 칸이라 카드마다
// 구간을 **하나만** 들 수 있다. 실제 카드는 구간이 여럿이고 그 개수도 카드마다
// 다르다 — 40만원 경계 하나짜리가 있고 셋인 것도 있다.
//
// 고정 컬럼(`threshold_1`, `threshold_2` …)으로 늘리면 구간 개수를 스키마에
// 박는 셈이다. 카드가 하나 늘 때마다 마이그레이션을 파야 하고, 안 쓰는 칸이
// NULL 로 남는다. **카드당 구간 행 N개**를 갖는 표로 간다.
//
// ─────────────────────────────────────────────────────────────────────────
// 요율을 구간 행에 둔다
//
// `card_benefits.rate` 는 카드×카테고리당 하나다. 구간이 생기면 실제 요율은
// 카드 × 카테고리 × **구간** 에서 정해진다.
//
// 그 셋을 한 표에 두면 카테고리 수 × 구간 수만큼 행이 불어나고, 구간 경계를
// 고칠 때 모든 카테고리 행을 함께 고쳐야 한다. 그래서 **구간은 구간대로
// 저장하고**(이 표), 카테고리별 차등이 필요한 카드만 `card_benefits` 가
// 구간을 참조하게 한다(`card_threshold_tier_id`, nullable).
//
// 참조가 NULL 이면 "구간과 무관하게 이 요율" 이다. 지금 등록된 혜택이 전부
// 그 상태이므로 **기존 데이터가 그대로 동작한다.**
//
// ─────────────────────────────────────────────────────────────────────────
// 기존 단일 임계값은 그대로 둔다
//
// `card_products.prev_month_threshold` 를 지우지 않는다. 구간이 하나뿐인 카드가
// 실제로 있고(삼성 계열은 30만원 단일이었다), 그런 카드까지 표로 옮기면 행만
// 늘고 얻는 것이 없다.
//
// 읽는 쪽 규칙은 **"구간 행이 있으면 그것을 쓰고, 없으면 단일 임계값을 쓴다"**
// 이다. 백필하지 않는다 — 대량 변경은 ADR 0008 대상이고, 읽기에서 떨어뜨리면
// 백필 없이도 동작한다(021 이 `billing_month` 에서 쓴 것과 같은 방식).
//
// ─────────────────────────────────────────────────────────────────────────
// 거래 제외는 별도 표다
//
// `transactions` 에 컬럼을 더하지 않는다. 이유가 둘이다.
//
// 하나, 제외는 **카드 실적에만** 쓰는 판정이라 거래의 본질 속성이 아니다.
// 거래 표는 이미 컬럼이 많고, 기능 하나가 컬럼 하나씩 더하면 감사 트리거의
// json_object 도 그만큼 커진다.
//
// 둘, **언제·왜 뺐는지**를 남길 자리가 필요하다. 컬럼은 불리언 하나뿐이라
// 나중에 "이건 왜 빠져 있지" 에 답할 수 없다.

function up(db) {
  // 카드별 실적 구간.
  //
  // `min_spend` 는 이 구간에 들어가기 위한 전월 실적 하한이다. 상한은 두지
  // 않는다 — 다음 구간의 하한이 곧 이 구간의 끝이라, 둘을 다 저장하면 서로
  // 어긋날 수 있는 값이 두 벌 생긴다.
  //
  // 하한 0 인 구간이 "실적 미달" 칸이다. 카드사가 그 구간에도 요율을 주는
  // 경우가 있어(기본 적립) 0 행을 만들 수 있게 열어 둔다.
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_threshold_tiers (
      id INTEGER PRIMARY KEY,
      card_product_id INTEGER NOT NULL REFERENCES card_products(id) ON DELETE CASCADE,
      min_spend INTEGER NOT NULL,
      rate REAL,
      label TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 같은 카드에 같은 하한이 둘이면 어느 요율을 쓸지 정할 수 없다.
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_card_tiers_product_min
      ON card_threshold_tiers(card_product_id, min_spend);
  `);

  // 구간 판정은 카드별로 하한 내림차순을 훑는다.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_card_tiers_lookup
      ON card_threshold_tiers(card_product_id, min_spend DESC);
  `);

  // 카테고리별 차등이 필요한 혜택만 구간을 가리킨다. NULL 이면 구간 무관.
  const benefitCols = db.prepare('PRAGMA table_info(card_benefits)').all().map((c) => c.name);
  if (!benefitCols.includes('card_threshold_tier_id')) {
    db.exec(`
      ALTER TABLE card_benefits
        ADD COLUMN card_threshold_tier_id INTEGER REFERENCES card_threshold_tiers(id)
    `);
  }

  // 실적에서 뺀 거래.
  //
  // 행이 있으면 제외, 없으면 포함이다. 재포함은 행을 지우는 것이라 "되돌렸다"
  // 가 별도 상태로 남지 않는다 — 감사 로그가 그 이력을 이미 들고 있다.
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_threshold_exclusions (
      id INTEGER PRIMARY KEY,
      transaction_id INTEGER NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
      reason TEXT,
      excluded_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_threshold_exclusions_tx
      ON card_threshold_exclusions(transaction_id);
  `);
}

module.exports = { up };
