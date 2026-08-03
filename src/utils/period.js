'use strict';

// 조회 기간을 한 가지 형태로 정규화한다(#272).
//
// 지금 엔드포인트마다 파라미터 규약이 다르다 — 거래내역은 from/to, 월별 요약은
// year, 반복거래는 month, 자금흐름은 period 모드다. 화면이 "이번 달" 을 물을 때
// 어디에 무엇을 보내야 하는지가 엔드포인트마다 달라진다.
//
// 이 함수는 어떤 형태로 들어와도 { from, to } 로 환원한다. 기존 파라미터를
// 없애지 않고 받아들이므로 기존 호출부는 그대로 동작한다.
//
// 날짜 계산은 문자열로 한다. 'YYYY-MM-DD' 는 사전순 비교가 곧 시간순이고,
// Date 로 바꾸면 UTC 로 해석돼 KST 자정~9시에 하루 어긋난다(FND-20).

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const YM = /^\d{4}-\d{2}$/;
const Y = /^\d{4}$/;

function pad2(n) {
  return String(n).padStart(2, '0');
}

// 그 달의 마지막 날. Date 의 0번째 날이 전달 마지막 날이라는 성질을 쓴다.
// 로컬 기준 연·월만 넘기므로 시간대 영향이 없다.
function lastDayOf(year, month) {
  return new Date(year, month, 0).getDate();
}

function isRealDate(s) {
  if (!YMD.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12) return false;
  return d >= 1 && d <= lastDayOf(y, m);
}

function fail(message) {
  return { from: null, to: null, source: 'none', error: message };
}

function ok(from, to, source) {
  return { from, to, source, error: null };
}

// resolvePeriod(query) → { from, to, source, error }
//
// 우선순위는 좁은 것부터다 — from/to > month > year. 여러 개가 함께 오면
// 사용자가 가장 구체적으로 지정한 것을 존중한다.
function resolvePeriod(query = {}) {
  const { from, to, month, year } = query || {};

  if (from || to) {
    if (from && !isRealDate(from)) return fail('시작 날짜를 YYYY-MM-DD 형식으로 입력해 주세요.');
    if (to && !isRealDate(to)) return fail('종료 날짜를 YYYY-MM-DD 형식으로 입력해 주세요.');
    if (from && to && from > to) return fail('시작 날짜가 종료 날짜보다 늦습니다. 두 날짜를 확인해 주세요.');
    return ok(from || null, to || null, 'range');
  }

  if (month) {
    if (!YM.test(month)) return fail('조회할 달을 YYYY-MM 형식으로 입력해 주세요.');
    const [y, m] = month.split('-').map(Number);
    if (m < 1 || m > 12) return fail('조회할 달을 YYYY-MM 형식으로 입력해 주세요.');
    return ok(`${month}-01`, `${month}-${pad2(lastDayOf(y, m))}`, 'month');
  }

  if (year) {
    const yStr = String(year);
    if (!Y.test(yStr)) return fail('조회할 연도를 네 자리 숫자로 입력해 주세요.');
    return ok(`${yStr}-01-01`, `${yStr}-12-31`, 'year');
  }

  // 아무것도 지정하지 않으면 전체 기간이다. 오류가 아니다.
  return ok(null, null, 'none');
}

module.exports = { resolvePeriod, lastDayOf, isRealDate };
