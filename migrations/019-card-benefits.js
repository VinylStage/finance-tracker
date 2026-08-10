'use strict';

// 카드 혜택과 청구 주기(#274).
//
// 016 이 card_products 를 만들 때 카드 식별(발급사·상품명·종류)까지만 넣었다.
// 카드 사용 전략을 추천하려면 **그 카드가 무엇에 얼마를 돌려주는지** 를 알아야
// 하고, 전월 실적을 세려면 **마감일** 이 있어야 한다. 그 둘을 여기서 붙인다.
//
// **전월 실적은 달력 월이 아니다.** 카드사 실적은 마감일~마감일 구간으로
// 집계된다. statement_close_day 없이 달력 월로 세면 실적 추정이 조용히 틀린다.
//
// 세 컬럼 다 NULL 을 허용한다. 사용자가 자기 카드의 결제일·마감일을 모를 수
// 있고, 모르는 것을 0 이나 1 로 채우면 계산이 틀린 답을 자신 있게 낸다.
function up(db) {
  const cols = db.prepare('PRAGMA table_info(card_products)').all().map((c) => c.name);
  const add = (name, ddl) => {
    if (!cols.includes(name)) db.exec(`ALTER TABLE card_products ADD COLUMN ${ddl}`);
  };

  add('prev_month_threshold', 'prev_month_threshold INTEGER');
  add('billing_cycle_day', 'billing_cycle_day INTEGER');
  add('statement_close_day', 'statement_close_day INTEGER');

  // category_id 가 NULL 이면 전 가맹점, merchant_pattern 이 NULL 이면 그
  // 카테고리 전체다. 둘 다 NULL 인 혜택은 "이 카드는 뭘 사도 N%" 를 뜻한다.
  //
  // ON DELETE CASCADE 를 건다. 혜택은 카드에 딸린 것이고, 카드를 지웠는데
  // 혜택만 남으면 어느 카드 것인지 알 수 없는 행이 된다.
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_benefits (
      id INTEGER PRIMARY KEY,
      card_product_id INTEGER NOT NULL REFERENCES card_products(id) ON DELETE CASCADE,
      category_id INTEGER REFERENCES categories(id),
      merchant_pattern TEXT,
      benefit_type TEXT NOT NULL,
      rate REAL NOT NULL DEFAULT 0,
      monthly_cap INTEGER,
      min_amount INTEGER DEFAULT 0,
      memo TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_card_benefits_product
      ON card_benefits(card_product_id);
  `);

  // card_benefits 는 새 테이블이라 감사 트리거가 저절로 붙지 않는다 — 017 이
  // 만들 때 있던 표만 대상이었다. 그 재생성은 여기서 하지 않는다.
  // runMigrations 가 체인을 다 적용한 뒤 한 번에 책임진다(#346).
}

module.exports = { up };
