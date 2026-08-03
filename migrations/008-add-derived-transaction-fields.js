'use strict';

// 파생 거래 생성에 필요한 컬럼(#269).
//
// 1) installments.paid_off_on — 조기(즉시) 완납일.
//    #267 computeSchedule 이 paidOffOn 을 인자로 받도록 이미 만들어져 있는데,
//    그 값을 담을 자리가 없었다. 회차 배열을 만든 뒤 자르는 방식으로는 잔여
//    이자 재계산이 안 되므로 완납일 자체를 원본에 남긴다.
//
// 2) transactions.origin_seq / origin_seq_total — 파생 거래가 몇 번째 회차인가.
//    #270 이 "할부 3/12회차" 를 화면에 보여야 하는데, 회차 번호를 메모 문자열에서
//    파싱하게 두면 문구를 고칠 때마다 화면이 깨진다. 표시 문자열이 아니라 수를
//    저장하고 조립은 화면이 한다 — 내부 용어 노출 금지(#231)와 같은 이유다.
//    할부에만 값이 있고 리볼빙·부채이자는 NULL 이다(회차 개념이 없다).
//
// 파생 카테고리는 여기서 만들지 않는다. init.js 가 마이그레이션을 먼저 돌리고
// 그 다음에 "카테고리가 0건이면 기본 카테고리 시드" 를 판단하기 때문에, 여기서
// 카테고리를 넣으면 새 DB 에서 기본 카테고리 23종이 통째로 사라진다.
// 대신 services/derivedTransactions.js 가 최초 사용 시점에 만든다.
function up(db) {
  const installmentCols = db.prepare('PRAGMA table_info(installments)').all().map((c) => c.name);
  if (!installmentCols.includes('paid_off_on')) {
    db.exec('ALTER TABLE installments ADD COLUMN paid_off_on TEXT');
  }

  const txCols = db.prepare('PRAGMA table_info(transactions)').all().map((c) => c.name);
  if (!txCols.includes('origin_seq')) {
    db.exec('ALTER TABLE transactions ADD COLUMN origin_seq INTEGER');
  }
  if (!txCols.includes('origin_seq_total')) {
    db.exec('ALTER TABLE transactions ADD COLUMN origin_seq_total INTEGER');
  }
}

module.exports = { up };
