// 히트맵의 연·월 지정에 쓰는 기간 계산(#273).
//
// 히트맵은 다른 집계와 기간 의미가 다르다. 나머지는 from~to 구간 합계를 보지만
// 히트맵은 달력 격자에 날짜를 채우므로 **한 달 또는 한 해 단위로만** 의미가 있다.
// 임의 구간(7/15~8/20)을 넣으면 격자가 깨진다.
//
// 그래서 전역 기간 필터(#272)를 그대로 쓰지 않고 자체 단위를 갖는다(A안 확정).

function pad2(n) {
  return String(n).padStart(2, '0');
}

// 그 달의 마지막 날. Date 의 0번째 날이 전달 마지막 날이라는 성질을 쓴다.
// 연·월만 넘기므로 시간대 영향이 없다.
export function lastDayOf(year, month) {
  return new Date(year, month, 0).getDate();
}

export function monthRange(year, month) {
  return {
    from: `${year}-${pad2(month)}-01`,
    to: `${year}-${pad2(month)}-${pad2(lastDayOf(year, month))}`,
  };
}

export function yearMonths(year) {
  const out = [];
  for (let m = 1; m <= 12; m++) {
    out.push({ year, month: m, ...monthRange(year, m) });
  }
  return out;
}

// dailyBuckets 의 출력에서 그 달 지출만 꺼내 평평하게 만든다.
// SpendHeatmap 이 { 'YYYY-MM-DD': 금액 } 형태를 받기 때문이다.
//
// **expense 가 0 인 날의 키를 지우지 않는다.** 기록이 있으나 지출이 0원인 날과
// 아예 기록이 없는 날은 다르다 — 히트맵이 그 둘을 같게 칠하면 "안 썼다" 와
// "기록을 안 했다" 가 섞인다.
export function bucketToDaily(buckets, year, month) {
  if (!buckets || typeof buckets !== 'object') return {};

  const prefix = `${year}-${pad2(month)}-`;
  const out = {};
  for (const [date, v] of Object.entries(buckets)) {
    if (!date.startsWith(prefix)) continue;
    out[date] = Number(v?.expense) || 0;
  }
  return out;
}
