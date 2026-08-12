'use strict';

// installments.status 컬럼을 없앤다(#205).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 지우나
//
// 이 컬럼은 저장된 값이 정본인 적이 없었다. 값을 바꾸는 것은 사실상
// `completeExpiredInstallments()` 하나였고, 그것은 **GET 요청이 돌 때마다**
// 청구 기간이 끝난 행을 '완료' 로 갱신하는 스윕이었다. 즉 컬럼은 계산 결과를
// 늦게 받아 적는 캐시였다.
//
// 그 캐시가 실제로 어긋난다는 것은 코드가 이미 인정하고 있었다.
//
//   - `utils/aggregation.js` 의 `installmentsDueForMonth()` 는 저장된 status 를
//     믿지 않고 청구 기간 종료를 직접 계산했다(FND-05).
//   - `routes/dataIntegrity.js` 는 "종료됐어야 하는데 진행중으로 남은 할부" 를
//     **무결성 위반 항목으로 점검**하고 있었다. 캐시가 틀어지는 것이 정상 동작
//     범위라는 뜻이다.
//
// 계산으로 바꾸면 그 둘이 모두 필요 없어진다. 어긋날 값이 없다.
//
// ─────────────────────────────────────────────────────────────────────────
// 되돌리기(#295)도 같이 사라진다
//
// `POST /:id/reopen` 은 스윕이 있어서 존재하던 기능이다. 되돌려도 다음 조회에서
// 스윕이 다시 완료로 바꾸기 때문에, #295 는 "기간이 끝났으면 되돌리기를 막는다"
// 는 판정(`reopenability`)을 붙여야 했다.
//
// 그 판정 조건은 `status === '완료' && !expired` 였는데, '완료' 를 만드는 것은
// 스윕뿐이고 스윕은 expired 일 때만 돌았다. **정상 흐름에서 성립할 수 없는
// 조건이다.** 완료된 할부의 개월수를 PUT 으로 늘려 경계를 미래로 민 경우에만
// 도달했다.
//
// 계산으로 바꾸면 그 경우가 저절로 해결된다 — 개월수를 고치면 계산된 상태가
// 곧바로 따라온다. 되돌리기 버튼이 하던 일을 수정 화면이 이미 하고 있다.
//
// ─────────────────────────────────────────────────────────────────────────
// 순서가 있다
//
// SQLite 는 트리거나 인덱스가 참조하는 컬럼을 DROP COLUMN 하지 못한다. 그래서
// **트리거 → 인덱스 → 컬럼** 순으로 걷어낸다. 025 에서 같은 순서를 썼다.
//
// 감사 트리거는 여기서 다시 만들지 않는다. `runMigrations()` 가 마이그레이션을
// 전부 적용한 뒤 중앙에서 재생성한다(#346).

// (status, start_billing_month) 복합 인덱스. 선두 컬럼이 사라지므로 같이 지운다.
//
// 대체 인덱스를 만들지 않는다. 남는 조회 조건은 `start_billing_month` 범위인데,
// 이 표는 사용자 한 명의 할부라 행이 한 자리 수다. 인덱스를 새로 만들면 쓰기마다
// 유지 비용만 든다.
const INDEXES = ['idx_installments_status_start'];

function up(db) {
  for (const op of ['ins', 'upd', 'del']) {
    db.exec(`DROP TRIGGER IF EXISTS audit_installments_${op}`);
  }

  for (const name of INDEXES) {
    db.exec(`DROP INDEX IF EXISTS ${name}`);
  }

  // 이미 지워진 DB 에 다시 돌 수 있다. 컬럼이 없으면 조용히 지나간다.
  const cols = db.prepare('PRAGMA table_info(installments)').all().map((c) => c.name);
  if (cols.includes('status')) {
    db.exec('ALTER TABLE installments DROP COLUMN "status"');
  }
}

module.exports = { up };
