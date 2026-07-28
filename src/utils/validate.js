'use strict';

// 정수로 강제. 정수가 아니면 null (NaN/Infinity/소수/비숫자 문자열 거부).
function asInt(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? v : null;
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return Number.parseInt(v, 10);
  return null;
}

// body 에서 누락된 필수 키 목록을 반환 (undefined/null/'' 만 누락으로 본다).
function missingFields(body, keys) {
  return keys.filter((k) => body[k] === undefined || body[k] === null || body[k] === '');
}

// SQLite LIKE 패턴의 와일드카드(%, _)와 이스케이프 문자(\)를 이스케이프.
// 사용 시 쿼리에 ESCAPE '\' 를 붙일 것.
function escapeLike(s) {
  return String(s).replace(/[\\%_]/g, (c) => '\\' + c);
}

// 라우트가 자기 숫자 필드를 선언하면 요청 시점에 강제하는 미들웨어(#211).
//
// 라우트마다 검증 함수를 하나씩 만드는 방식은 새 라우트에서 조용히 빠진다 —
// 감사 FND-06 시정 후에도 같은 유형이 16곳 남아 있었다. 선언을 라우트 정의에
// 붙여두면 "어디에 검증을 빠뜨렸는가"를 소스에서 기계적으로 셀 수 있다.
//
// 값이 있는 필드만 검사한다. PUT 은 부분 갱신이라 없는 필드는 기존 DB 값을
// 그대로 쓰므로 검증 대상이 아니다. 빈 문자열도 "없음"으로 본다 —
// missingFields() 와 같은 기준이다.
//
// 거부 메시지는 사용자에게 그대로 보이므로 필드명을 노출하지 않는다(#231).
function numericBody(fields) {
  return function numericBodyGuard(req, res, next) {
    const body = req.body || {};
    for (const f of fields) {
      const v = body[f];
      if (v === undefined || v === null || v === '') continue;
      if (asInt(v) === null) {
        return res.status(400).json({
          error: '숫자로 입력해야 하는 값에 숫자가 아닌 것이 들어왔습니다. 입력을 확인해 주세요.',
        });
      }
    }
    return next();
  };
}

module.exports = { asInt, missingFields, escapeLike, numericBody };
