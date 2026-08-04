'use strict';

const { clampDay, validDay } = require('./cardBilling');
const { NON_ELIGIBLE_ORIGINS } = require('./cardComparison');

// 전월 실적 합산(#276).
//
// ─────────────────────────────────────────────────────────────────────────
// 실적 구간은 달력 월이 아니다
//
// 카드 혜택의 "전월 실적" 은 **마감일에서 마감일까지**다. 마감일이 6일인
// 카드라면 8월에 적용되는 실적은 6/7 ~ 7/6 이지 7/1 ~ 7/31 이 아니다.
// 달력 월로 계산하면 마감일 근처 결제가 통째로 다른 구간에 잡히고, 사용자는
// 실적을 채웠다고 믿었는데 혜택을 못 받는다.
//
// 접는 규칙은 cardBilling 에서 가져온다. 청구월과 실적 구간이 **같은** 말일
// 접기를 써야 한다 — 마감일 31일 카드의 2월이 서로 다르면 안 된다.
//
// ─────────────────────────────────────────────────────────────────────────
// 마감일 당일은 아직 이번 구간이다
//
// billingMonthInfo 가 `day <= closeDay` 를 이번 달 마감으로 보는 것과 같다.
// 8/6 마감 카드에서 8/6 결제는 8/6 마감분에 들어간다. 그래서 8/6 시점의
// 전월 실적은 여전히 6/7 ~ 7/6 이다.
//
// ─────────────────────────────────────────────────────────────────────────
// 마감일을 모르면 달력 월로 떨어진다
//
// 019 가 statement_close_day 를 nullable 로 넣었고 사용자가 비워 둘 수 있다.
// 이때 추측해서 구간을 옮기면 근거 없는 숫자가 나온다. 달력 월로 떨어지되
// **resolved: false 로 알린다** — 화면이 "마감일을 설정하면 정확해집니다" 를
// 말할 수 있어야 한다(billingMonthInfo 와 같은 방침).
//
// ─────────────────────────────────────────────────────────────────────────
// 이 값이 틀리는 방향
//
// **카드사의 실적 제외 항목을 우리는 모른다.** 세금·공과금·상품권·선불충전·
// 아파트관리비는 대부분의 카드사가 실적에서 뺀다. 우리 DB 에는 그 구분이
// 없다. 그래서 이 합계는 **실제 실적보다 크게 나온다.**
//
// 크게 나온다는 것은 `met` 이 실제보다 쉽게 true 가 된다는 뜻이고, 그러면
// 혜택을 실제보다 많이 추정한다 — cardStrategy 가 경계한 바로 그 방향이다.
// 숫자를 임의로 깎지는 않는다(그건 지어내는 것이다). 대신 **estimated 를
// 항상 실어 보내고** 화면이 그 한계를 말하게 한다.

const INCOME_MAJOR_TYPE = '수입';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toYmd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// 그 달의 마감일. 말일보다 큰 마감일은 말일로 접힌다.
function closeDateOf(year, monthIndex, closeDay) {
  return new Date(year, monthIndex, clampDay(year, monthIndex, closeDay));
}

/**
 * asOf 시점에서 "전월 실적" 으로 볼 구간을 돌려준다.
 *
 * 가장 최근에 **마감이 끝난** 구간이다. 진행 중인 구간은 아직 실적이 아니다.
 *
 * @param {string} asOf 'YYYY-MM-DD'
 * @param {{statement_close_day?: number}|null} cardProduct
 * @returns {{start: string, end: string, resolved: boolean}} 양 끝 포함
 */
function prevPeriodFor(asOf, cardProduct) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(asOf || ''));
  if (!m) throw new TypeError(`asOf 는 YYYY-MM-DD 여야 한다: ${asOf}`);

  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  const day = Number(m[3]);

  const closeDay = cardProduct ? cardProduct.statement_close_day : null;

  if (!validDay(closeDay)) {
    // 지난 달력 월 1일 ~ 말일.
    return {
      start: toYmd(new Date(year, monthIndex - 1, 1)),
      end: toYmd(new Date(year, monthIndex, 0)),
      resolved: false,
    };
  }

  // 지금 진행 중인 구간이 마감되는 달.
  const currentEndMonth = day <= clampDay(year, monthIndex, closeDay) ? monthIndex : monthIndex + 1;

  const end = closeDateOf(year, currentEndMonth - 1, closeDay);

  // 시작일은 **그 앞 구간 마감일의 다음 날**이다. 마감일에서 하루를 빼는
  // 식으로 계산하면 말일 접기와 어긋난다 — 마감일 31 인 카드의 7월 구간은
  // 6/30 마감 다음 날인 7/1 에 시작한다.
  const before = closeDateOf(year, currentEndMonth - 2, closeDay);
  const start = new Date(before.getFullYear(), before.getMonth(), before.getDate() + 1);

  return { start: toYmd(start), end: toYmd(end), resolved: true };
}

// 설정되지 않은 실적 조건은 null 이다. 0 이하도 "조건 없음" 으로 본다 —
// "0원 이상 쓰면 혜택" 은 조건이 아니다.
function thresholdOf(cardProduct) {
  const raw = cardProduct ? cardProduct.prev_month_threshold : null;
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * 카드 한 장의 전월 실적을 합산하고 조건 충족 여부를 낸다.
 *
 * transactions 는 **그 카드로 결제된 것만** 넘어온다고 본다. 걸러내기는
 * 호출부의 몫이지만, 파생 거래와 수입은 여기서도 한 번 막는다 — 두 곳에서
 * 막아야 한 곳이 빠져도 거짓이 안 나온다(cardComparison 과 같은 방침).
 *
 * @param {object} input
 * @param {object|null} input.cardProduct { statement_close_day, prev_month_threshold }
 * @param {Array} input.transactions      { date, amount, origin, major_type }
 * @param {string} input.asOf             'YYYY-MM-DD'
 */
function computeThreshold({ cardProduct, transactions, asOf } = {}) {
  const period = prevPeriodFor(asOf, cardProduct);
  const threshold = thresholdOf(cardProduct);
  const list = Array.isArray(transactions) ? transactions : [];

  let spend = 0;
  let counted = 0;
  const excluded = { derived: 0, income: 0 };

  for (const tx of list) {
    if (!tx) continue;

    const date = String(tx.date || '');
    if (date < period.start || date > period.end) continue;

    if (tx.major_type === INCOME_MAJOR_TYPE) {
      excluded.income++;
      continue;
    }

    // 할부금·리볼빙 수수료·이자·상환은 파생 행이다. 원 결제가 따로 있으므로
    // 같이 세면 한 번 쓴 돈이 두 번 실적에 잡힌다.
    if (NON_ELIGIBLE_ORIGINS.has(tx.origin || 'manual')) {
      excluded.derived++;
      continue;
    }

    spend += Number(tx.amount) || 0;
    counted++;
  }

  return {
    period,
    spend,
    counted,
    excluded,
    threshold,
    // 조건이 없으면 채운 것으로 본다. compareCards 의 thresholdMet 계약과 같다.
    met: threshold === null ? true : spend >= threshold,
    shortfall: threshold === null ? 0 : Math.max(0, threshold - spend),
    // 카드사 실적 제외 항목을 반영하지 못한다. 항상 참이다 — 화면이 이걸
    // 보고 한계를 말한다.
    estimated: true,
  };
}

module.exports = { prevPeriodFor, computeThreshold, thresholdOf, INCOME_MAJOR_TYPE };
