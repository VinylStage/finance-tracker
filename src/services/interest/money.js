'use strict';

// 이자 계산의 끝수 규칙(#286).
//
// 한 곳에서만 정한다. 유형마다 다르게 깎으면 같은 조건인데 화면마다 값이 달라지고,
// 복리에서는 그 차이가 다음 달 원금에 들어가 누적된다.
//
// **원 단위 절사.** 반올림이 아니라 절사인 이유는 카드사·은행 안내가 원 미만을
// 버리는 쪽이고(#284 조사에서 본 100원당 수수료 표기도 절사 기준), 사용자가
// 실제로 청구받는 값보다 앱이 크게 잡는 편보다 작게 잡는 편이 덜 놀랍기 때문이다.
//
// 예외: services/interest/generalLoan.js 는 Math.round 를 쓴다. 그건 이자 발생
// 계산이 아니라 M10 이전부터 목록에 띄우던 "월이자 (참고)" 어림값이고, 종전 SQL 의
// ROUND 와 값이 달라지면 화면 숫자가 이유 없이 바뀐다.
function floorWon(value) {
  if (!Number.isFinite(value)) {
    throw new Error('floorWon requires a finite number');
  }
  return Math.floor(value);
}

// 'YYYY-MM-DD' 하루 더하기. Date 로 파싱하되 UTC 로 고정한다 — 로컬 타임존으로
// 파싱하면 서머타임이 있는 지역에서 하루가 23시간이 되어 날짜가 밀린다.
function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// [a, b) 사이의 일수. 반개구간이라 하루를 두 번 세지 않는다 — 이자 계산에서
// 하루 중복은 그대로 금액 오차가 된다.
function daysBetween(a, b) {
  const parse = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(b) - parse(a)) / 86400000);
}

// 그 해의 일수. 여신금융협회·은행 약관 공통으로 1년을 365일(윤년 366)로 본다.
function daysInYear(ymd) {
  const y = Number(ymd.slice(0, 4));
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return leap ? 366 : 365;
}

module.exports = { floorWon, addDays, daysBetween, daysInYear };
