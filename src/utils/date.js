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

// FND-20(감사): SQL의 strftime(..., 'now')는 UTC 기준이라 KST에서 매월 1일
// 00:00~09:00 사이엔 여전히 전월로 계산되는, localYMD와 동일한 문제를 겪는다.
// SQL이 직접 'now'를 참조하지 않도록 현재 연/월을 여기서 계산해 바인딩한다.
function localYearMonth(d = new Date()) {
  return [d.getFullYear(), d.getMonth() + 1];
}

// FND-08(감사): "strftime('%Y-%m', t.date) = ?" 형태의 WHERE는 인덱스 컬럼을
// 함수로 감싸 idx_tx_date를 못 쓴다(풀스캔). 대신 [해당 월 1일, 다음 달 1일)
// 범위 비교를 쓰면 인덱스를 그대로 탈 수 있다. 이 경계값을 계산한다.
function monthBounds(ym) {
  const [y, m] = ym.split('-').map(Number);
  const start = `${ym}-01`;
  const endExclusive = m === 12 ? `${y + 1}-01-01` : `${y}-${pad2(m + 1)}-01`;
  return [start, endExclusive];
}

module.exports = { localYMD, pad2, lastNDates, mondayOf, lastNWeeks, lastNMonths, lastNYears, localYearMonth, monthBounds };
