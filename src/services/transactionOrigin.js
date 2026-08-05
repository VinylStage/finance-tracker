'use strict';

const { LOCKED_ORIGINS } = require('../constants');

// 거래 잠금 판정(#268).
//
// 판정을 한 곳에 모아 두는 이유는 수정·삭제·일괄삭제 세 경로가 같은 규칙을
// 써야 하기 때문이다. 경로마다 조건을 적으면 한 곳을 빠뜨렸을 때 그 경로만
// 뚫린다. 감사 FND-01 이 실증한 전체 삭제 경로가 특히 그렇다.

// 이 거래를 사용자가 거래내역 화면에서 고치거나 지울 수 있는가.
// origin 이 없는 행(마이그레이션 전 데이터)은 manual 로 본다.
function isEditable(row) {
  const origin = (row && row.origin) || 'manual';
  return !LOCKED_ORIGINS.includes(origin);
}

// 거부 문구. 사용자에게 그대로 보이므로 내부 필드명이나 origin 값을
// 노출하지 않는다(#231 기준). 무엇을 할 수 있는지까지 알려준다.
const LOCKED_MESSAGE_BY_ORIGIN = {
  installment: '이 내역은 할부 등록에서 자동으로 만들어졌어요. 할부 화면에서 고칠 수 있어요.',
  revolving: '이 내역은 리볼빙 기록에서 자동으로 만들어졌어요. 리볼빙 화면에서 고칠 수 있어요.',
  debt_interest: '이 내역은 대출 이자 기록에서 자동으로 만들어졌어요. 부채 화면에서 고칠 수 있어요.',
  debt_repayment: '이 내역은 대출 상환 기록에서 자동으로 만들어졌어요. 부채 화면에서 고칠 수 있어요.',
};

function lockedMessage(row) {
  const origin = (row && row.origin) || 'manual';
  return LOCKED_MESSAGE_BY_ORIGIN[origin]
    || '이 내역은 자동으로 만들어졌어요. 원래 등록한 화면에서 고칠 수 있어요.';
}

// 주어진 id 목록 중 잠긴 것을 골라낸다. 일괄 삭제가 쓴다.
function findLocked(db, ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT id, origin FROM transactions WHERE id IN (${placeholders})`
  ).all(...ids);
  return rows.filter((r) => !isEditable(r));
}

// 전체 삭제 대상 중 잠긴 것이 하나라도 있는가.
function countLockedAll(db) {
  const placeholders = LOCKED_ORIGINS.map(() => '?').join(',');
  return db.prepare(
    `SELECT count(*) AS c FROM transactions WHERE origin IN (${placeholders})`
  ).get(...LOCKED_ORIGINS).c;
}

// ─────────────────────────────────────────────────────────────────────────
// 집계에서 파생 거래를 뺄 것인가(#272)
//
// 기간 필터의 "할부·리볼빙 등 자동 생성 내역 포함" 토글이 여기로 온다.
//
// **기본값은 포함이다.** #269 가 B안(원금+이자를 회차별 거래로 생성, 구매 시점
// 거래는 사용자가 넣지 않는다)으로 확정됐다. 파생 행이 **실제 지출 기록 그
// 자체**라서, 빼면 할부 지출이 합계에서 통째로 사라진다.
//
// 잠금 판정과 같은 집합을 쓴다. `recurring` 은 여기 없다 — 반복거래는 사용자가
// 등록한 실제 결제고 거래내역에서 고칠 수도 있다. 그걸 "자동 생성" 으로 묶어
// 빼면 공과금·구독료가 합계에서 사라진다.

// 집계 쿼리에 끼울 조건. 포함이면 빈 문자열이라 쿼리가 그대로다.
//
// @returns {{sql: string, params: string[]}}
function derivedFilter(query = {}) {
  // 'off' 만 제외로 본다. 값이 없거나 이상하면 포함이다 — 조용히 빼면 사용자가
  // 왜 합계가 줄었는지 알 수 없다.
  if ((query || {}).derived !== 'off') return { sql: '', params: [] };

  const placeholders = LOCKED_ORIGINS.map(() => '?').join(',');
  // COALESCE 를 두는 이유는 옛 데이터가 아니다 — 007 이 origin 을
  // `NOT NULL DEFAULT 'manual'` 로 넣어서 NULL 인 행은 존재할 수 없다.
  //
  // 이 조각이 **LEFT JOIN 의 ON 이 아니라 WHERE 로 옮겨질 때**를 막는다.
  // 그때는 매칭 안 된 쪽의 t.origin 이 NULL 이고, `NULL NOT IN (...)` 은 NULL
  // 이라 그 행이 조용히 빠진다. 카테고리가 통째로 사라지는데 원인이 안 보인다.
  return {
    sql: `AND COALESCE(t.origin, 'manual') NOT IN (${placeholders})`,
    params: [...LOCKED_ORIGINS],
  };
}

module.exports = { isEditable, lockedMessage, findLocked, countLockedAll, derivedFilter };
