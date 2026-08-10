'use strict';

// 대출 유형 마스터와 금리 이력(#285).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 필요한가
//
// debts 가 모든 부채를 annual_rate 하나로 다뤘다. 그런데 #284 조사 결과 유형별로
// 계산이 근본적으로 다르다.
//
//   카드 할부      월할, 단리, 원금 확정
//   마이너스통장   일할, 복리, 원금 수시 변동
//   리볼빙         일할, 단리, 이월로 변동
//   신용대출       월할 근사, 단리, 원금 확정
//
// 계산 단위(일할/월할)와 복리 여부, 이 둘이 유형을 가르는 축이다.
// ─────────────────────────────────────────────────────────────────────────
//
// debts.type 과 debts.loan_type 은 다른 축이다. 헷갈리기 쉬워 여기 적어 둔다.
//
//   type       사용자에게 보이는 **용도** 분류 — 일반 / 마이너스통장 / 학자금 / 전세자금
//   loan_type  **이자 계산 방식** — general / credit_line
//
// 학자금대출과 전세자금대출은 용도가 다를 뿐 계산은 같을 수 있다. 반대로 같은
// '일반' 이라도 상환 방식이 다르면 계산이 갈린다. 한 컬럼으로 합치면 용도를 바꾸는
// 순간 계산이 바뀌어 버린다.
//
// 다만 지금 데이터에서는 type='마이너스통장' 이 곧 credit_line 이므로 그것만 옮긴다.

// 금리 이력을 따로 두는 이유(#285).
//
// 실제 사용 중인 마이너스통장이 **3개월 주기 변동금리**다. annual_rate 한 칸으로는
// 과거 이자를 재현할 수 없다 — 지금 금리로 소급 계산하면 그때 청구된 금액과 다르다.
// 연 4.17% → 4.55% 로 바뀐 계좌에서 60일치를 재계산해 보면 26,673원과 25,558원으로
// 1,115원 어긋난다(잔액 3,566,196 기준).
//
// card_installment_policies 의 effective_from / effective_to 와 같은 모양을 쓴다.
// 같은 문제에 같은 해법을 쓰면 조회·겹침 판정 로직도 같은 방식으로 읽힌다.
//
// debt_interest_log.rate_at_time 이 이미 있지만 그건 **감사 기록**이다. 이자를
// 기록한 시점에만 남아서 임의의 과거 날짜에 어떤 금리였는지는 알 수 없다.
function up(db) {
  const cols = db.prepare('PRAGMA table_info(debts)').all().map((c) => c.name);

  const add = (name, ddl) => {
    if (!cols.includes(name)) db.exec(`ALTER TABLE debts ADD COLUMN ${name} ${ddl}`);
  };

  add('loan_type', "TEXT NOT NULL DEFAULT 'general'");
  // 한도. credit_line 에만 의미가 있다.
  add('credit_limit', 'INTEGER');
  // 'daily' | 'monthly'. NULL 이면 유형 기본값을 쓴다 — 사용자가 굳이 고르지
  // 않아도 유형만으로 계산이 정해져야 한다.
  add('interest_basis', 'TEXT');
  // 이자가 원금에 편입되는가. 마이너스통장이 1 이다.
  //
  // NOT NULL DEFAULT 0 으로 두지 않는다. 그러면 "아직 안 고름" 과 "복리 아님" 이
  // 같은 값이 되어 유형 기본값을 적용할 자리가 사라진다 — credit_line 을 넣어도
  // 조용히 단리가 된다. interest_basis 가 NULL 을 쓰는 것과 같은 이유다.
  add('compounds', 'INTEGER');
  // 이자 결제일(매월 며칠). 없으면 이자 발생 구간을 사용자가 직접 지정한다.
  add('interest_day', 'INTEGER');

  // 기존 행은 전부 general 로 남아 동작이 바뀌지 않는다. 다만 이미 '마이너스통장'
  // 으로 등록해 둔 부채는 사용자가 다시 고르게 하지 않고 옮겨 준다 — 용도를
  // 그렇게 적어 둔 것 자체가 계산 방식에 대한 의사표시다.
  db.prepare(`
    UPDATE debts
    SET loan_type = 'credit_line', interest_basis = 'daily', compounds = 1
    WHERE type = '마이너스통장' AND loan_type = 'general'
  `).run();

  db.exec(`
    CREATE TABLE IF NOT EXISTS debt_rate_history (
      id INTEGER PRIMARY KEY,
      debt_id INTEGER NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
      annual_rate REAL NOT NULL,
      effective_from TEXT NOT NULL,
      effective_to TEXT,
      memo TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(debt_id, effective_from)
    );

    CREATE INDEX IF NOT EXISTS idx_debt_rate_debt
      ON debt_rate_history(debt_id, effective_from);
  `);

  // 지금 금리를 이력의 첫 행으로 심는다. 이력이 비어 있으면 "언제부터 이 금리였나"
  // 를 알 수 없어 과거 구간 계산이 통째로 막힌다.
  //
  // 시작일은 부채가 마지막으로 갱신된 날로 잡는다. 정확한 약정일은 알 수 없지만,
  // 적어도 그 시점 이후로는 이 금리였다는 것이 사실이다. 사용자가 실제 적용일을
  // 알면 화면에서 고칠 수 있다.
  db.prepare(`
    INSERT INTO debt_rate_history (debt_id, annual_rate, effective_from, memo)
    SELECT d.id, d.annual_rate, COALESCE(date(d.updated_at), date('now')), '기존 금리 이관'
    FROM debts d
    WHERE NOT EXISTS (SELECT 1 FROM debt_rate_history h WHERE h.debt_id = d.id)
  `).run();
}

module.exports = { up };
