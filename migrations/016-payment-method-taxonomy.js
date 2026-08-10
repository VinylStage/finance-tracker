'use strict';

// 결제수단 분류 체계 — 카드사 → 카드상품(#306).
//
// 지금 payment_methods 는 카드사 단위다(하나카드·삼성카드…). 카드사 단위로는
// 카드 전략 추천이 성립하지 않는다 — 같은 카드사 카드 두 장의 혜택이 다르고,
// 어느 쪽으로 결제했는지 데이터에 남지 않는다.
//
// **신용/체크는 카드상품에 고정된 속성이다.** 한 상품이 신용이면서 체크일 수
// 없고 도중에 바뀌지도 않는다. 그래서 토글도 이력 테이블도 만들지 않고
// card_type 컬럼 하나로 둔다. 이 값이 M11 의 결제 시점 분리(신용=이연,
// 체크=즉시)를 가르는 근거가 된다.
//
// **"미상" 은 card_product_id IS NULL 이다.** 전용 센티널 행을 두면 "미상" 이라는
// 이름의 카드가 통계·목록·집계에 실제 카드처럼 섞여 들어온다. NULL 이면 조인에서
// 자연히 빠지고 "값이 없다" 는 뜻이 스키마에 그대로 드러난다.
//
// 다만 NULL 은 조용히 빠진다는 것이 이 방식의 유일한 위험이다. 카드 전략 계산이
// 미상 거래를 제외했다는 사실을 화면에 드러내는 것은 그쪽 이슈의 몫이다.
//
// 기존 거래의 카드 상품은 **추측하지 않는다.** 시기·금액·가맹점으로 역추정하면
// 그럴듯하지만 틀렸을 때 전략 계산이 조용히 잘못된 답을 낸다. 전부 NULL 로 두고
// 사용자가 직접 지정한다.
function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_products (
      id INTEGER PRIMARY KEY,
      payment_method_id INTEGER NOT NULL REFERENCES payment_methods(id),
      issuer TEXT NOT NULL,
      product_name TEXT NOT NULL,
      card_type TEXT NOT NULL,
      annual_fee INTEGER DEFAULT 0,
      memo TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 한 카드사가 여러 상품을 갖는다. payment_method_id 에 UNIQUE 를 걸지 않는
  // 이유가 이것이다 — 같은 카드사 카드 두 장을 표현할 수 없으면 이 이슈의
  // 목적이 사라진다.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_card_products_method
      ON card_products(payment_method_id);
  `);

  // 같은 카드사 안에서 상품명이 겹치면 사용자가 구분할 수 없다.
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_card_products_name
      ON card_products(payment_method_id, product_name);
  `);

  const txCols = db.prepare('PRAGMA table_info(transactions)').all().map((c) => c.name);
  if (!txCols.includes('card_product_id')) {
    db.exec(`ALTER TABLE transactions ADD COLUMN card_product_id INTEGER REFERENCES card_products(id)`);
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tx_card_product
      ON transactions(card_product_id);
  `);
}

module.exports = { up };
