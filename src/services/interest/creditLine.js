'use strict';

const { floorWon, addDays, daysBetween, daysInYear } = require('./money');

// 마이너스통장(한도대출) 이자(#286).
//
// ─────────────────────────────────────────────────────────────────────────
// 할부와 무엇이 다른가
//
//   할부            마이너스통장
//   원금 확정        원금이 인출·상환으로 수시 변동
//   개월수 확정      무기한
//   회차 배열        미리 만들 수 없다
//   단리            복리 — 이자가 잔액에 편입되고 그 위에 다시 이자가 붙는다
//
// "미리 만들 수 없다" 가 설계의 핵심이다. #267 computeSchedule 은 회차 배열을 한
// 번에 돌려주는데 여기서는 잔액이 언제 어떻게 바뀔지 모른다. 대신 **기간을 잘라
// 그 구간의 이자를 계산**하는 형태가 된다.
//
// ── 산식 (#284 조사, KB국민은행 1차)
//
//   하루 이자 = 사용금액 × 연 이자율 ÷ 365        (윤년 366)
//   구간 이자 = Σ(구간 잔액 × 그 구간 금리 × 일수 ÷ 365)
//
// ── 구간을 무엇으로 자르는가
//
// 잔액 변동점만으로는 부족하다. 실제 계좌가 **3개월 주기 변동금리**라서 금리
// 변경점에서도 잘라야 한다. 두 타임라인의 변곡점을 합쳐 자른다.
//
//   잔액 3,566,196 / 4.17% 30일 + 4.55% 30일
//     구간별 계산   12,222 + 13,336 = 25,558   ← 맞는 값
//     현재 금리로   26,673                     ← 1,115원 어긋남
//
// ── 정밀도
//
// 복리는 오차가 누적된다. 단리는 매달 독립적으로 틀리지만 복리는 지난달 오차가
// 이번달 원금에 들어가 커진다. 그래서
//   - 원 단위 정수로만 다룬다. 부동소수점 누적을 피한다
//   - 끝수 규칙은 money.js 한 곳에 있다
//   - 편입은 이자 결제일에만 일어난다. 매일 편입하면 실제보다 커진다
// ─────────────────────────────────────────────────────────────────────────
//
// 이 모듈은 DB 를 모른다. 타임라인을 인자로 받는다. 사용자 돈 계산이라 케이스를
// 많이 넣어야 하는데 DB 를 끼면 그게 어려워진다.

class MissingRateError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MissingRateError';
  }
}

// 타임라인에서 그 날짜에 유효한 값을 찾는다.
// 타임라인은 [{ from, ...값 }] 이고 from 오름차순이라고 본다.
function valueAt(timeline, date) {
  let found = null;
  for (const row of timeline) {
    if (row.from <= date) found = row;
    else break;
  }
  return found;
}

/**
 * [from, to) 를 잔액 변동점과 금리 변경점에서 잘라 구간 목록을 만든다.
 *
 * @param {object} args
 * @param {Array<{from:string, balance:number}>} args.balanceTimeline 그 날부터의 잔액
 * @param {Array<{from:string, to?:string, annual_rate:number}>} args.rateTimeline
 * @param {string} args.from 'YYYY-MM-DD' 포함
 * @param {string} args.to   'YYYY-MM-DD' 제외
 * @returns {Array<{from,to,days,balance,annual_rate}>}
 */
function segmentize({ balanceTimeline = [], rateTimeline = [], from, to }) {
  if (!from || !to || from >= to) return [];

  // 변곡점을 모은다. 구간 안에 들어오는 것만.
  const points = new Set([from]);
  for (const b of balanceTimeline) if (b.from > from && b.from < to) points.add(b.from);
  for (const r of rateTimeline) if (r.from > from && r.from < to) points.add(r.from);
  const cuts = [...points].sort();

  const segments = [];
  for (let i = 0; i < cuts.length; i += 1) {
    const segFrom = cuts[i];
    const segTo = cuts[i + 1] || to;
    const bal = valueAt(balanceTimeline, segFrom);
    const rate = valueAt(rateTimeline, segFrom);

    segments.push({
      from: segFrom,
      to: segTo,
      days: daysBetween(segFrom, segTo),
      balance: bal ? bal.balance : 0,
      // null 을 0 으로 흘리지 않는다. 금리를 모르는 구간을 0% 로 계산하면 이자가
      // 조용히 사라진다 — accrue 가 명시적으로 실패하도록 그대로 넘긴다.
      annual_rate: rate ? rate.annual_rate : null,
    });
  }
  return segments;
}

/**
 * 구간 이자 합계. **DB 를 모르는 순수 계산이다.**
 *
 * 구간마다 절사한 뒤 더한다. 전체를 더해 마지막에 한 번 절사하지 않는 이유는,
 * 실제 청구가 구간(이자 결제 주기)마다 원 단위로 확정되기 때문이다.
 */
function accrueInterest({ balanceTimeline, rateTimeline, from, to }) {
  const segments = segmentize({ balanceTimeline, rateTimeline, from, to });

  let interest = 0;
  const detail = segments.map((s) => {
    if (s.annual_rate === null || s.annual_rate === undefined) {
      throw new MissingRateError(
        `${s.from} 구간에 적용할 금리가 없습니다. 금리 이력을 먼저 입력해 주세요.`
      );
    }
    // 잔액이 0 이하면 이자가 없다. 마이너스통장은 다 갚으면 잔액 0 이고,
    // 예금 잔액(양수)에 대출 이자를 물리면 안 된다.
    const base = s.balance > 0 ? s.balance : 0;
    const amount = floorWon((base * (s.annual_rate / 100) * s.days) / daysInYear(s.from));
    interest += amount;
    return { ...s, interest: amount };
  });

  return { interest, segments: detail };
}

// 이자 결제일 목록. (from, to] 안에서 매월 interestDay 일.
//
// 그 달에 없는 날짜(2월 31일)는 말일로 당긴다 — 은행이 결제일을 건너뛰지 않는다.
function postingDates({ from, to, interestDay }) {
  if (!interestDay) return [];
  const dates = [];
  let [y, m] = from.split('-').map(Number);

  // 최대 회수를 제한한다. 잘못된 인자로 무한 루프에 빠지지 않게.
  for (let guard = 0; guard < 1200; guard += 1) {
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const day = Math.min(interestDay, lastDay);
    const d = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (d > to) break;
    if (d > from) dates.push(d);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return dates;
}

/**
 * 이자 결제일마다 이자를 확정하고, 복리면 잔액에 편입한다.
 *
 * 편입을 잔액 타임라인에 직접 쓰지 않고 누적분(carried)으로 따로 들고 다닌다.
 * 사용자가 넣은 잔액 이력은 사실 기록이라 계산이 덧쓰면 안 된다 — 나중에 실제
 * 명세서와 대조할 때 무엇이 입력이고 무엇이 계산인지 구분되어야 한다.
 *
 * @param {object} args
 * @param {Array} args.balanceTimeline  사용자가 기록한 잔액 이력
 * @param {Array} args.rateTimeline     금리 이력(services/debtRate.rateTimeline)
 * @param {string} args.from            계산 시작일(포함)
 * @param {string} args.to              계산 종료일(제외)
 * @param {number} [args.interestDay]   이자 결제일. 없으면 [from,to) 전체를 한 번에
 * @param {boolean} [args.compounds=true] 이자를 잔액에 편입하는가
 * @param {number} [args.creditLimit]   한도. 있으면 초과 여부를 함께 알린다
 */
function simulate({
  balanceTimeline = [], rateTimeline = [], from, to,
  interestDay = null, compounds = true, creditLimit = null,
}) {
  const dates = postingDates({ from, to, interestDay });
  // 결제일이 없으면 기간 전체가 한 회차다.
  const boundaries = dates.length ? dates : [to];

  const postings = [];
  let carried = 0;        // 편입된 이자 누적
  let totalInterest = 0;
  let cursor = from;

  for (const at of boundaries) {
    // 편입분을 잔액 이력 위에 얹은 타임라인. 원본은 건드리지 않는다.
    const shifted = carried === 0
      ? balanceTimeline
      : balanceTimeline.map((b) => ({ ...b, balance: b.balance + carried }));

    const { interest, segments } = accrueInterest({
      balanceTimeline: shifted, rateTimeline, from: cursor, to: at,
    });

    const balanceBefore = balanceAt(balanceTimeline, at, carried);
    if (compounds) carried += interest;
    const balanceAfter = balanceAt(balanceTimeline, at, carried);

    postings.push({
      date: at,
      from: cursor,
      to: at,
      interest,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      over_limit: creditLimit !== null && creditLimit > 0 ? balanceAfter > creditLimit : false,
      segments,
    });

    totalInterest += interest;
    cursor = at;
  }

  // 마지막 결제일 이후 남은 구간. 아직 청구되지 않은 미수 이자다.
  let accrued = 0;
  if (cursor < to) {
    const shifted = carried === 0
      ? balanceTimeline
      : balanceTimeline.map((b) => ({ ...b, balance: b.balance + carried }));
    accrued = accrueInterest({ balanceTimeline: shifted, rateTimeline, from: cursor, to }).interest;
  }

  return {
    postings,
    total_interest: totalInterest,
    accrued_since_last_posting: accrued,
    capitalized: compounds ? carried : 0,
    final_balance: balanceAt(balanceTimeline, to, carried),
  };
}

// 그 시점의 잔액 = 사용자가 기록한 잔액 + 편입된 이자.
function balanceAt(balanceTimeline, date, carried = 0) {
  const row = valueAt(balanceTimeline, date);
  return (row ? row.balance : 0) + carried;
}

module.exports = {
  segmentize, accrueInterest, postingDates, simulate, balanceAt,
  MissingRateError,
};
