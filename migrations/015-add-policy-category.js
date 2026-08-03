'use strict';

// 할부 정책에 가맹점 카테고리 차원을 더한다(#315).
//
// 카드사 무이자·부분무이자는 업종에 따라 다르게 적용된다. 지금 스키마는
// 카드사 x 개월수까지만 구분해서 "하나카드 6개월 무이자, 단 온라인쇼핑만" 을
// 표현할 수 없다.
//
// category_id 가 NULL 이면 그 카드사의 기본 정책이고, 값이 있으면 그 카테고리
// 전용 예외다. 카테고리마다 전체 정책을 복제하면 카드사 하나에 수십 행이 생기고
// 공통 조건이 바뀔 때 전부 고쳐야 한다.
//
// **SQLite 의 NULL 유니크 함정**: UNIQUE(payment_method_id, category_id, months,
// effective_from) 로 컬럼만 늘리면 기본 정책의 중복이 막히지 않는다. SQLite 는
// UNIQUE 제약에서 NULL 을 서로 다른 값으로 취급하기 때문이다. 그래서 테이블
// 제약을 걷어내고 부분 유니크 인덱스 둘로 나눈다.
//
// 기존 테이블 제약은 SQLite 에서 그냥 못 지운다. 테이블을 새로 만들어 옮긴다.
//
// **컬럼 목록을 하드코딩하지 않는다.** 이 테이블은 006 이후로도 컬럼이 늘었고
// (009 의 free_from_sequence), 동시에 다른 작업이 또 늘릴 수 있다. 목록을 적어
// 두면 그때마다 조용히 컬럼이 사라진다 — 실제로 한 번 그렇게 날려 먹었다.
// 기존 정의를 읽어 그대로 재현하고 필요한 것만 바꾼다.
function up(db) {
  const cols = db.prepare('PRAGMA table_info(card_installment_policies)').all();
  if (cols.some((c) => c.name === 'category_id')) return; // 이미 적용됨

  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='card_installment_policies'"
  ).get();
  if (!row) return; // 테이블이 아직 없으면 006 이 먼저 돌아야 한다

  // 1) 기존 정의에서 테이블 제약(UNIQUE(...))만 걷어낸다.
  //    컬럼 정의·타입·기본값은 원본 그대로 살린다.
  let ddl = row.sql.replace(/,\s*UNIQUE\s*\([^)]*\)/gi, '');

  // 2) 새 이름으로 만들고 category_id 를 추가한다.
  ddl = ddl.replace(
    /CREATE TABLE\s+"?card_installment_policies"?/i,
    'CREATE TABLE card_installment_policies_new'
  );
  const lastParen = ddl.lastIndexOf(')');
  ddl = `${ddl.slice(0, lastParen)},\n  category_id INTEGER REFERENCES categories(id)\n${ddl.slice(lastParen)}`;

  db.exec(ddl);

  // 3) 기존 행을 그대로 옮긴다. 기존 컬럼 이름만 나열하므로 컬럼이 늘어도 따라간다.
  const names = cols.map((c) => `"${c.name}"`).join(', ');
  db.exec(`
    INSERT INTO card_installment_policies_new (${names})
    SELECT ${names} FROM card_installment_policies;
  `);

  db.exec(`
    DROP TABLE card_installment_policies;
    ALTER TABLE card_installment_policies_new RENAME TO card_installment_policies;
  `);

  // 기본 정책은 (카드사, 개월수, 시행일) 로 유일하다.
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cip_base
      ON card_installment_policies(payment_method_id, months, effective_from)
      WHERE category_id IS NULL;
  `);

  // 카테고리 예외는 카테고리까지 포함해 유일하다. 기본 정책과 같은 조합으로
  // 공존해야 하므로 인덱스를 나눈다.
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cip_category
      ON card_installment_policies(payment_method_id, category_id, months, effective_from)
      WHERE category_id IS NOT NULL;
  `);

  // 조회는 카드사 + 개월수로 먼저 좁힌 뒤 카테고리를 본다.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cip_lookup
      ON card_installment_policies(payment_method_id, months, category_id);
  `);
}

module.exports = { up };
