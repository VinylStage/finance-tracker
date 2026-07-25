'use strict';

// 정수로 강제. 정수가 아니면 null (NaN/Infinity/소수/비숫자 문자열 거부).
function asInt(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? v : null;
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return Number.parseInt(v, 10);
  return null;
}

// body 에서 누락된 필수 키 목록을 반환 (undefined/null 만 누락으로 본다).
function missingFields(body, keys) {
  return keys.filter((k) => body[k] === undefined || body[k] === null);
}

// SQLite LIKE 패턴의 와일드카드(%, _)와 이스케이프 문자(\)를 이스케이프.
// 사용 시 쿼리에 ESCAPE '\' 를 붙일 것.
function escapeLike(s) {
  return String(s).replace(/[\\%_]/g, (c) => '\\' + c);
}

module.exports = { asInt, missingFields, escapeLike };
