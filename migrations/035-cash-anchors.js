'use strict';

// 보유현금 "앵커"(기준일 스냅샷) — 재무상담 현금흐름 투영의 출발점(스펙 B).
//
// 사용자가 "YYYY-MM-DD 기준 보유현금 X원" 을 입력하면 그 값이 투영의 기준점이 된다.
// 앵커 이전 누적 현금흐름은 끌어오지 않는다(현재시점 리셋). 과거 거래는 **삭제하지
// 않는다** — 앵커는 계산 시작점만 옮긴다. 여러 개를 두고, 투영은 기준일 이전 최근
// 앵커를 출발점으로 쓴다.
//
// 거래가 아니라 별도 레코드라 원장(transactions)·집계에 섞이지 않는다.

function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cash_anchors (
      id INTEGER PRIMARY KEY,
      as_of_date TEXT NOT NULL,
      amount INTEGER NOT NULL,
      memo TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_cash_anchors_date ON cash_anchors(as_of_date);
  `);
}

module.exports = { up };
