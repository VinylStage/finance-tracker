'use strict';
const { pad2 } = require('../utils/date');

// 반복 규칙의 발생일을 계산한다(#278). DB 를 모르는 순수 함수다 — 호출부가
// 규칙 행을 읽어 넘긴다.
//
// 달력 계산은 로컬 시각 기준으로 한다. UTC 로 하면 KST 자정~9시 사이에 날짜가
// 하루 어긋난다(FND-20 에서 실제로 겪은 문제다).

const FREQS = ['daily', 'monthly', 'yearly'];

function toYMD(y, m, d) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
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

// offset 이상인 interval 의 배수 중 가장 작은 것. 음수면 0 — 규칙이 아직 시작 전이다.
// interval 이 2 이상일 때 조회 구간이 주기 중간에서 시작해도 기준점에 맞춘다.
function firstAlignedStep(offset, interval) {
  if (offset <= 0) return 0;
  const rem = offset % interval;
  return rem === 0 ? offset : offset + (interval - rem);
}

// 실제로 훑을 구간 — 규칙 기간과 조회 구간의 교집합. 비면 null.
function scanWindow(rule, from, to) {
  const rangeFrom = parseYMD(from);
  const rangeTo = parseYMD(to);
  if (!rangeFrom || !rangeTo) return null;

  const startsOn = parseYMD(rule.starts_on) || rangeFrom;
  const endsOn = parseYMD(rule.ends_on);

  const lo = daysBetween(startsOn, rangeFrom) >= 0 ? rangeFrom : startsOn;
  const hi = endsOn && daysBetween(endsOn, rangeTo) > 0 ? endsOn : rangeTo;
  if (daysBetween(lo, hi) < 0) return null;
  return { startsOn, lo, hi };
}

// 기준점은 starts_on 이다. interval 이 2 면 starts_on 에서 짝수 일차만 발생한다.
function dailyOccurrences({ startsOn, lo, hi }, interval) {
  const out = [];
  for (let n = firstAlignedStep(daysBetween(startsOn, lo), interval); ; n += interval) {
    const d = new Date(startsOn.y, startsOn.m - 1, startsOn.d + n);
    const cur = { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
    if (daysBetween(cur, hi) < 0) break;
    out.push(toYMD(cur.y, cur.m, cur.d));
  }
  return out;
}

// 기준 달은 starts_on 의 달이다.
function monthlyOccurrences({ startsOn, lo, hi }, interval, dayOfMonth) {
  const out = [];
  const offset = monthsBetween(startsOn, { y: lo.y, m: lo.m, d: 1 });
  for (let step = firstAlignedStep(offset, interval); ; step += interval) {
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

// month_of_year + day_of_month 조합. 2월 29일 연 반복도 말일 규칙을 탄다.
function yearlyOccurrences({ startsOn, lo, hi }, interval, monthOfYear, dayOfMonth) {
  const out = [];
  const yearOffset = lo.y - startsOn.y;
  for (let step = firstAlignedStep(yearOffset, interval); ; step += interval) {
    const y = startsOn.y + step;
    const cur = { y, m: monthOfYear, d: clampDay(y, monthOfYear, dayOfMonth) };
    if (daysBetween(cur, hi) < 0) break;
    if (daysBetween(lo, cur) >= 0) out.push(toYMD(cur.y, cur.m, cur.d));
    if (step > yearOffset + interval * 200) break;
  }
  return out;
}

// 0·음수·빈 값은 기본값으로. 0 을 그대로 쓰면 interval 은 무한루프, 일·월은 없는 날이 된다.
function positiveOr(value, fallback) {
  return Number(value) > 0 ? Number(value) : fallback;
}

// occurrencesBetween(rule, from, to) → ['YYYY-MM-DD', ...]
//
// from·to 는 둘 다 포함이다. 규칙의 starts_on 이 없으면 from 부터로 본다.
// ends_on 은 그날까지 포함한다 — "12월 31일까지" 가 12월 31일을 빼면 사용자
// 기대와 어긋난다.
function occurrencesBetween(rule, from, to) {
  if (!rule || !FREQS.includes(rule.freq || 'monthly')) return [];
  const freq = rule.freq || 'monthly';
  const interval = Math.floor(positiveOr(rule.interval, 1));

  const win = scanWindow(rule, from, to);
  if (!win) return [];

  if (freq === 'daily') return dailyOccurrences(win, interval);
  const dayOfMonth = positiveOr(rule.day_of_month, win.startsOn.d);
  if (freq === 'monthly') return monthlyOccurrences(win, interval, dayOfMonth);
  const monthOfYear = positiveOr(rule.month_of_year, win.startsOn.m);
  return yearlyOccurrences(win, interval, monthOfYear, dayOfMonth);
}

module.exports = { occurrencesBetween, clampDay, lastDayOf, FREQS };
