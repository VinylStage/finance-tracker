'use strict';

// 로컬(서버) 타임존 기준 날짜 포맷. new Date().toISOString()은 UTC라서 KST에서
// 매일 0~9시 사이에 날짜가 하루 밀리는 문제가 있었다.
function localYMD(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pad2(n) { return String(n).padStart(2, '0'); }

// FND-13(감사): 아래 5개 헬퍼가 transactions.js와 cashflow.js에 글자단위로
// 동일하게 중복돼 있었다. 두 라우트 모두 "최근 N일/주/월/년" 구간 집계에 쓴다.
function lastNDates(n) {
  const arr = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    arr.push(localYMD(d));
  }
  return arr;
}

function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function lastNWeeks(n) {
  const weeks = [];
  const thisMonday = mondayOf(new Date());
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(thisMonday);
    start.setDate(thisMonday.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    weeks.push({ label: localYMD(start), start: localYMD(start), end: localYMD(end) });
  }
  return weeks;
}

function lastNMonths(n) {
  const arr = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    arr.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
  }
  return arr;
}

function lastNYears(n) {
  const arr = [];
  const year = new Date().getFullYear();
  for (let i = n - 1; i >= 0; i--) arr.push(String(year - i));
  return arr;
}

module.exports = { localYMD, pad2, lastNDates, mondayOf, lastNWeeks, lastNMonths, lastNYears };
