'use strict';

// 로컬(서버) 타임존 기준 날짜 포맷. new Date().toISOString()은 UTC라서 KST에서
// 매일 0~9시 사이에 날짜가 하루 밀리는 문제가 있었다.
function localYMD(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// FND-20(감사): SQL의 strftime(..., 'now')는 UTC 기준이라 KST에서 매월 1일
// 00:00~09:00 사이엔 여전히 전월로 계산되는, localYMD와 동일한 문제를 겪는다.
// SQL이 직접 'now'를 참조하지 않도록 현재 연/월을 여기서 계산해 바인딩한다.
function localYearMonth(d = new Date()) {
  return [d.getFullYear(), d.getMonth() + 1];
}

module.exports = { localYMD, localYearMonth };
