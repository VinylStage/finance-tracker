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

module.exports = { isEditable, lockedMessage, findLocked, countLockedAll };
