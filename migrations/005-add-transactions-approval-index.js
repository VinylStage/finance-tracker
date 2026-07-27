'use strict';

// 카드 임포트 중복체크가 명세서 행마다 풀 테이블 스캔을 돌았다(#210).
//
//   SELECT id FROM transactions WHERE approval_number = ?   → SCAN transactions
//
// 이 쿼리는 미리보기(cardImport.js)와 실제 저장에서 각각 한 번씩, 즉 행당 2회
// 실행된다. 컬럼을 추가한 003 마이그레이션이 인덱스를 함께 만들지 않았다.
//
// 부수적으로 GET /api/data-integrity 의 중복 승인번호 점검
// (GROUP BY approval_number HAVING cnt > 1)도 같은 인덱스를 탄다.
//
// IF NOT EXISTS 를 쓰므로 이미 인덱스가 있는 DB 에서는 no-op 이다.
function up(db) {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tx_approval ON transactions(approval_number)`);
}

module.exports = { up };
