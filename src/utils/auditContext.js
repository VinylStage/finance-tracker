'use strict';
const crypto = require('node:crypto');

// 감사로그가 "누가 / 어떤 작업으로" 를 채우려면 쓰기가 일어나는 시점에 그 정보가
// 있어야 한다(#298). 이 모듈이 그 정보를 들고 있다.
//
// **전역 변수 하나로 충분한 이유**: better-sqlite3 는 동기이고 이 앱은 단일
// 프로세스·단일 커넥션이다. 요청 처리 중간에 다른 요청의 쿼리가 끼어들 수 없으므로
// AsyncLocalStorage 까지 갈 필요가 없다.
//
// **이건 전제다.** 커넥션 풀이나 워커 스레드가 들어오면 깨진다. 그때는 이 모듈을
// AsyncLocalStorage 로 바꿔야 한다 — #296 의 ADR 에 전제로 적는다.
//
// 라우트가 컨텍스트를 설정하지 않아도 쓰기가 실패하면 안 된다. 기본값을 안전한
// 쪽(system)에 두어, 스크립트나 마이그레이션 같은 요청 밖 경로도 기록은 남되
// 실행취소 후보에는 오르지 않게 한다.
const DEFAULT = Object.freeze({ actor: 'system', actionId: null, label: null });

let current = { ...DEFAULT };

function newActionId() {
  return crypto.randomUUID();
}

// 요청 하나가 만드는 모든 로그 행이 같은 action_id 를 갖는다. 실행취소가
// 되돌리는 단위가 이것이다(#297).
function auditContext(req, res, next) {
  current = { actor: 'user', actionId: newActionId(), label: null };
  // 요청이 끝나면 기본값으로 되돌린다. 다음 요청이 앞선 요청의 라벨을 물려받으면
  // 감사 이력에 엉뚱한 작업 이름이 남는다.
  res.on('finish', () => { current = { ...DEFAULT }; });
  next();
}

function getAuditContext() {
  // 컨텍스트가 없는 경로(스크립트 등)도 action_id 는 있어야 그룹이 성립한다.
  if (!current.actionId) current = { ...current, actionId: newActionId() };
  return { ...current };
}

// 사용자 요청 안에서 일어나지만 사용자가 지시하지 않은 쓰기를 감싼다.
// 대표 사례가 GET /api/installments 의 만료 할부 자동 완료다(#205) — 사용자는
// 조회만 했는데 데이터가 바뀐다. user 로 찍히면 실행취소가 엉뚱한 것을 되돌린다.
//
// 동기 함수만 받는다. better-sqlite3 가 동기라 이 앱의 쓰기 경로는 전부 동기이고,
// 비동기를 허용하면 복원 시점이 어긋나 다음 작업의 actor 가 오염된다.
function runAs(actor, fn) {
  const prev = current;
  // 시스템 작업은 자체 action_id 를 갖는다. 사용자 작업과 한 그룹으로 묶이면
  // 되돌리기가 둘을 같이 되돌린다.
  current = { actor, actionId: newActionId(), label: prev.label };
  try {
    return fn();
  } finally {
    current = prev;
  }
}

// 라벨은 선택이다. 안 붙여도 로그는 남는다 — 빠뜨려도 구멍이 나지 않는 구조가
// #296 이 트리거 캡처를 고른 이유다.
function setAuditLabel(label) {
  current = { ...current, label };
}

// 테스트에서 상태를 초기화한다. 프로덕션 경로에서는 쓰지 않는다.
function resetAuditContext() {
  current = { ...DEFAULT };
}

module.exports = { auditContext, getAuditContext, runAs, setAuditLabel, resetAuditContext };
