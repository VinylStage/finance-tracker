'use strict';

// 정수로 강제. 정수가 아니면 null (NaN/Infinity/소수/비숫자 문자열 거부).
function asInt(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? v : null;
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return Number.parseInt(v, 10);
  return null;
}

// id 목록을 실제 id 로만 걸러 낸다.
//
// **`Array.prototype.map(Number)` 을 쓰면 안 된다.** `Number(true)` 는 `1`,
// `Number([2])` 는 `2`, `Number(null)` 은 `0` 이라 전부 `Number.isInteger` 를
// 통과한다. 그래서 `{ ids: [true] }` 로 부르면 **1번 거래가 지워지고 200 이
// 돌아온다**(2026-08-06 실측). 사용자가 고른 적 없는 행이다.
//
// `asInt` 는 number 와 숫자 문자열만 통과시키므로 그 강제변환이 일어나지 않는다.
// id 는 항상 양수라 0 이하도 뺀다 — 통과시켜도 매칭되진 않지만, 남겨 두면
// "하나라도 유효하면 진행" 판정이 잘못 서서 빈 요청이 성공으로 보인다.
function toIdList(ids) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map(asInt).filter((n) => n !== null && n > 0))];
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

module.exports = {
  toIdList, asInt, missingFields, escapeLike, numericBody };
