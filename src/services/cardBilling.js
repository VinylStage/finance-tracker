'use strict';

// 구매 하나가 **어느 청구서에 실리는가**를 계산한다(#290).
//
// #289 의 `billing_month` 가 이 값을 쓴다. 이게 틀리면 청구월이 통째로 어긋나고
// 통장 잔액 추적이 전부 틀어지므로, 규칙을 추측하지 않고 #284 조사에서 유도했다.
//
// ─────────────────────────────────────────────────────────────────────────
// 근거 — KB국민카드 결제일별 이용기간 (#284 §5, 조회일 2026-08-03)
//
//   결제일  이용기간
//    1일    전전월 18일 ~ 전월 17일
//   14일    전월 1일 ~ 전월 말일
//   20일    전월 7일 ~ 당월 6일
//   27일    전월 14일 ~ 당월 13일
//
// 이용기간의 **끝나는 날**이 마감일(statement_close_day)이다. 위 표에서 각각
// 17일 · 말일 · 6일 · 13일이다.
//
// 여기서 두 단계가 나온다.
//
//   1. 이 구매가 **어느 달 마감**에 걸리는가
//      구매일 <= 마감일이면 그 달 마감, 아니면 다음 달 마감
//
//   2. 그 마감이 **몇 달 뒤에 청구**되는가
//      결제일 <= 마감일이면 다음 달, 아니면 같은 달
//
// 2단계가 왜 성립하는지 — 마감 후에 결제일이 오려면 결제일이 마감일보다 뒤여야
// 한다. 결제일이 마감일보다 앞이거나 같으면 그 달 안에서는 이미 지났으므로
// 다음 달로 넘어간다. 위 네 행이 전부 이 규칙에 맞는다.
//
//   결제일 14 / 마감 말일(31) → 14 <= 31 → 다음 달 결제
//   결제일  1 / 마감 17       →  1 <= 17 → 다음 달 결제
//   결제일 20 / 마감  6       → 20 >  6 → 같은 달 결제
//   결제일 27 / 마감 13       → 27 > 13 → 같은 달 결제
//
// ─────────────────────────────────────────────────────────────────────────
// 카드사별 표를 하드코딩하지 않는 이유
//
// #284 가 KB 4개 결제일만 1차로 확보했다. 신한·삼성·현대는 각사 페이지가 JS
// 렌더·접근 차단이라 못 읽었고, 결제일 선택지 자체가 카드사마다 다르다.
// **조사 결론이 "사용자가 직접 입력받는 설계가 현실적"** 이었고, 이 모듈은 그
// 입력값(card_products.billing_cycle_day · statement_close_day)만 읽는다.
//
// KB 이외의 카드사에서 이 유도 규칙이 어긋나는 사례가 나오면, 그때는 규칙을
// 고치는 게 아니라 이용기간을 직접 입력받는 컬럼을 더해야 한다.

const { pad2 } = require('../utils/date');

// 그 달에 실제로 존재하는 날로 접는다. 마감일 31 은 2월에 28(윤년 29)이 된다.
// "말일 마감" 을 31 로 적어도 이 접기 때문에 모든 달에서 말일로 동작한다.
function clampDay(year, monthIndex, day) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(day, lastDay);
}

function toYearMonth(year, monthIndex) {
  // monthIndex 가 12 이상이거나 음수여도 Date 가 연도를 넘겨 준다.
  const d = new Date(year, monthIndex, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

// 1 ~ 31 사이의 정수만 유효한 날짜 설정으로 본다. null·0·문자열·범위 밖은
// "설정되지 않음" 이다 — 019 가 두 컬럼을 nullable 로 넣었고, 사용자가 카드를
// 등록하면서 비워 둘 수 있다.
function validDay(v) {
  return Number.isInteger(v) && v >= 1 && v <= 31;
}

/**
 * 구매일이 실리는 청구월을 'YYYY-MM' 으로 돌려준다.
 *
 * 카드 정보가 없거나 청구 주기가 설정되지 않았으면 **구매일의 달력 월**을
 * 그대로 쓴다. 청구 주기를 모르는데 추측해서 옮기면, 사용자가 보기에 거래가
 * 이유 없이 다른 달에 가 있다 — 모르는 것은 옮기지 않는 쪽이 안전하다.
 * 이 폴백은 호출부가 구분할 수 있어야 하므로 billingMonthInfo 로 노출한다.
 *
 * @param {string} purchaseDate 'YYYY-MM-DD'
 * @param {{billing_cycle_day?: number, statement_close_day?: number}|null} cardProduct
 * @returns {string} 'YYYY-MM'
 */
function billingMonthFor(purchaseDate, cardProduct) {
  return billingMonthInfo(purchaseDate, cardProduct).billingMonth;
}

/**
 * billingMonthFor 와 같은 계산을 하되, 폴백으로 떨어졌는지를 함께 돌려준다.
 * 화면이 "청구월 추정" 과 "청구 주기 미설정" 을 구분해 보여줄 수 있어야 한다.
 *
 * @returns {{billingMonth: string, resolved: boolean}}
 */
function billingMonthInfo(purchaseDate, cardProduct) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(purchaseDate || ''));
  if (!m) throw new TypeError(`purchaseDate 는 YYYY-MM-DD 여야 한다: ${purchaseDate}`);

  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  const day = Number(m[3]);

  const payDay = cardProduct ? cardProduct.billing_cycle_day : null;
  const closeDay = cardProduct ? cardProduct.statement_close_day : null;

  if (!validDay(payDay) || !validDay(closeDay)) {
    return { billingMonth: toYearMonth(year, monthIndex), resolved: false };
  }

  // 1단계 — 어느 달 마감에 걸리는가.
  const closeThisMonth = clampDay(year, monthIndex, closeDay);
  const closeMonthIndex = day <= closeThisMonth ? monthIndex : monthIndex + 1;

  // 2단계 — 그 마감이 몇 달 뒤에 청구되는가.
  const offset = payDay <= closeDay ? 1 : 0;

  return { billingMonth: toYearMonth(year, closeMonthIndex + offset), resolved: true };
}

module.exports = { billingMonthFor, billingMonthInfo };
