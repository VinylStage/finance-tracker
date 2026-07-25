// 로컬(브라우저) 타임존 기준 날짜 포맷. new Date().toISOString()은 UTC라서 KST에서
// 매일 0~9시 사이에 날짜가(월 경계에서는 달까지) 하루 밀리는 문제가 있었다.
export function localYMD(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function localYearMonth(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
