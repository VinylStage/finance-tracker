'use strict';

// 반복 규칙의 발생일을 계산한다(#278). DB 를 모르는 순수 함수다 — 호출부가
// 규칙 행을 읽어 넘긴다.
//
// 달력 계산은 로컬 시각 기준으로 한다. UTC 로 하면 KST 자정~9시 사이에 날짜가
// 하루 어긋난다(FND-20 에서 실제로 겪은 문제다).

const FREQS = ['daily', 'monthly', 'yearly'];

function pad(n) {
  return String(n).padStart(2, '0');
}

function toYMD(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

// 그 달의 마지막 날. Date 의 0번째 날이 전달 마지막 날이라는 성질을 쓴다.
function lastDayOf(year, month) {
  return new Date(year, month, 0).getDate();
}

function parseYMD(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > lastDayOf(y, m)) return null;
  return { y, m, d };
}

// 지정일이 그 달에 없으면 말일로 당긴다(A안, 2026-08-03 확정).
//
// 월세·구독료는 카드사도 말일로 당겨 청구한다. 건너뛰면 사용자가 "왜 2월만
// 빠졌지" 를 겪는다.
function clampDay(year, month, day) {
  return Math.min(day, lastDayOf(year, month));
}

// 두 날짜 사이의 개월 수. interval 이 2 이상일 때 "몇 번째 주기인가" 를 센다.
function monthsBetween(a, b) {
  return (b.y - a.y) * 12 + (b.m - a.m);
}

function daysBetween(a, b) {
  const ms = new Date(b.y, b.m - 1, b.d) - new Date(a.y, a.m - 1, a.d);
  return Math.round(ms / 86400000);
}

// occurrencesBetween(rule, from, to) → ['YYYY-MM-DD', ...]
//
// from·to 는 둘 다 포함이다. 규칙의 starts_on 이 없으면 from 부터로 본다.
// ends_on 은 그날까지 포함한다 — "12월 31일까지" 가 12월 31일을 빼면 사용자
// 기대와 어긋난다.
function occurrencesBetween(rule, from, to) {
  if (!rule || !FREQS.includes(rule.freq || 'monthly')) return [];

  const freq = rule.freq || 'monthly';
  const interval = Number(rule.interval) > 0 ? Math.floor(Number(rule.interval)) : 1;

  const rangeFrom = parseYMD(from);
  const rangeTo = parseYMD(to);
  if (!rangeFrom || !rangeTo) return [];

  const startsOn = parseYMD(rule.starts_on) || rangeFrom;
  const endsOn = parseYMD(rule.ends_on);

  // 실제로 훑을 구간 — 규칙 기간과 조회 구간의 교집합.
  const lo = daysBetween(startsOn, rangeFrom) >= 0 ? rangeFrom : startsOn;
  const hi = endsOn && daysBetween(endsOn, rangeTo) > 0 ? endsOn : rangeTo;
  if (daysBetween(lo, hi) < 0) return [];

  const out = [];

  if (freq === 'daily') {
    // 기준점은 starts_on 이다. interval 이 2 면 starts_on 에서 짝수 일차만 발생한다.
    const offset = daysBetween(startsOn, lo);
    const first = offset % interval === 0 ? offset : offset + (interval - (offset % interval));
    for (let n = first; ; n += interval) {
      const d = new Date(startsOn.y, startsOn.m - 1, startsOn.d + n);
      const cur = { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
      if (daysBetween(cur, hi) < 0) break;
      out.push(toYMD(cur.y, cur.m, cur.d));
    }
    return out;
  }

  const dayOfMonth = Number(rule.day_of_month) > 0 ? Number(rule.day_of_month) : startsOn.d;

  if (freq === 'monthly') {
    // 기준 달은 starts_on 의 달이다.
    const offset = monthsBetween(startsOn, { y: lo.y, m: lo.m, d: 1 });
    const firstStep = offset <= 0
      ? 0
      : (offset % interval === 0 ? offset : offset + (interval - (offset % interval)));

    for (let step = firstStep; ; step += interval) {
      const base = new Date(startsOn.y, startsOn.m - 1 + step, 1);
      const y = base.getFullYear();
      const m = base.getMonth() + 1;
      const cur = { y, m, d: clampDay(y, m, dayOfMonth) };
      if (daysBetween(cur, hi) < 0) break;
      if (daysBetween(lo, cur) >= 0) out.push(toYMD(cur.y, cur.m, cur.d));
      // 무한루프 방지 — 구간을 크게 넘어서면 멈춘다.
      if (step > offset + interval * 1200) break;
    }
    return out;
  }

  // yearly — month_of_year + day_of_month 조합. 2월 29일 연 반복도 말일 규칙을 탄다.
  const monthOfYear = Number(rule.month_of_year) > 0 ? Number(rule.month_of_year) : startsOn.m;
  const yearOffset = lo.y - startsOn.y;
  const firstYearStep = yearOffset <= 0
    ? 0
    : (yearOffset % interval === 0 ? yearOffset : yearOffset + (interval - (yearOffset % interval)));

  for (let step = firstYearStep; ; step += interval) {
    const y = startsOn.y + step;
    const cur = { y, m: monthOfYear, d: clampDay(y, monthOfYear, dayOfMonth) };
    if (daysBetween(cur, hi) < 0) break;
    if (daysBetween(lo, cur) >= 0) out.push(toYMD(cur.y, cur.m, cur.d));
    if (step > yearOffset + interval * 200) break;
  }
  return out;
}

module.exports = { occurrencesBetween, clampDay, lastDayOf, FREQS };
