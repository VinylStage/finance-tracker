// 거래 입력 폼의 날짜 기본값을 정한다(#304).
//
// 문제는 날짜 피커가 아니라 **보고 있던 화면이 이미 아는 날짜가 폼으로 전달되지
// 않는 것**이었다. 7월 섹션을 펼쳐놓고 거래를 추가해도 기본값이 오늘(8월)이라
// 매번 고쳐야 했다.
//
// 상태는 한 방향으로만 흐른다 — 화면 컨텍스트에서 폼 기본값으로. 폼에서 날짜를
// 바꿔도 목록 펼침이나 달력 월은 움직이지 않는다.

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const YM = /^\d{4}-\d{2}$/;

export function defaultTxDate({ selectedDay, expandedMonths, today }) {
  // 1) 달력뷰에서 이미 날짜를 골랐으면 더 정할 게 없다.
  if (typeof selectedDay === 'string' && YMD.test(selectedDay)) return selectedDay;

  // 2) 목록뷰에서 펼친 달이 곧 사용자가 보고 있는 기간이다.
  const months = (Array.isArray(expandedMonths) ? expandedMonths : [])
    .filter((m) => typeof m === 'string' && YM.test(m));

  if (months.length > 0) {
    // 'YYYY-MM' 은 사전순이 곧 시간순이다.
    const latest = months.reduce((a, b) => (a > b ? a : b));

    // 그 달이 이번 달이면 오늘이 가장 나은 기본값이다. 그 달 안에서 1일보다
    // 오늘이 사용자가 넣으려는 날짜에 가깝다.
    if (typeof today === 'string' && today.startsWith(`${latest}-`)) return today;

    // 다른 달이면 1일로 간다. 말일은 달마다 달라 예측이 어렵고, "그 달에
    // 마지막으로 입력한 거래의 날짜" 는 상태를 하나 더 들고 있어야 한다.
    return `${latest}-01`;
  }

  // 3) 컨텍스트가 없으면 오늘. 상단 '+ 거래 추가' 가 이 경로다.
  return today;
}
