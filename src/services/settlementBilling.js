'use strict';

const { billingMonthInfo } = require('./cardBilling');

// 신용카드 거래를 청구월로 묶는다(#289 A안).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 청구월이 필요한가
//
// `deferred`(신용카드 사용)는 통장을 즉시 줄이지 않는다. 나중에 카드대금이
// 한 번에 빠지고, 그때가 `settlement` 거래다. **둘을 이어야** 사용자가
// "이번 25일에 얼마 빠지나" 를 알 수 있다.
//
// 잇는 방법으로 A안(billing_month 로 묶기)과 B안(거래 간 참조)이 있었고
// A안으로 확정됐다. 리볼빙이 들어오면 그때 확장한다.
//
// ─────────────────────────────────────────────────────────────────────────
// 모르면 안 적는다
//
// 카드의 결제일·마감일이 설정돼 있지 않으면 청구월을 계산할 수 없다.
// `billingMonthInfo` 는 그럴 때 **구매일의 달력 월**로 떨어지고 `resolved:
// false` 로 알린다(그쪽 폴백은 표시용으로 맞다).
//
// 하지만 **그 값을 DB 에 적으면 안 된다.** 추측한 청구월로 묶으면 사용자는
// 25일에 빠질 금액을 잘못 본다 — 숫자가 그럴듯하게 나오는데 틀렸고, 왜
// 틀렸는지 화면에서 알 수 없다. NULL 로 두면 적어도 "아직 모른다" 가 된다.
//
// 그래서 `resolved === true` 일 때만 적는다.
//
// ─────────────────────────────────────────────────────────────────────────
// 사용자가 직접 적은 값이 우선이다
//
// 명세서를 보고 청구월을 직접 넣는 경우가 있다. 계산이 그걸 덮으면 사용자가
// 고쳐도 저장할 때마다 되돌아간다.

/**
 * 이 거래에 적을 청구월을 정한다.
 *
 * @param {object} input
 * @param {string} input.settlement    'immediate' | 'deferred' | 'settlement'
 * @param {string} input.date          'YYYY-MM-DD'
 * @param {string|null} [input.billingMonth]  호출부가 명시한 값
 * @param {object|null} [input.cardProduct]   { billing_cycle_day, statement_close_day }
 * @returns {string|null} 'YYYY-MM' 또는 null
 */
function resolveBillingMonth({ settlement, date, billingMonth, cardProduct } = {}) {
  // 명시한 값이 있으면 그대로 둔다. 형식 검증은 라우트가 이미 한다.
  if (billingMonth) return billingMonth;

  // 즉시 결제와 카드대금 인출에는 청구월이 없다. 청구월은 **무엇이 언제
  // 청구되는가**를 말하는 값이라 인출 자체에 붙이면 뜻이 겹친다.
  if (settlement !== 'deferred') return null;

  if (!cardProduct || !date) return null;

  let info;
  try {
    info = billingMonthInfo(date, cardProduct);
  } catch {
    // 날짜 형식이 틀리면 라우트가 이미 막는다. 여기까지 왔으면 안 적는다.
    return null;
  }

  return info.resolved ? info.billingMonth : null;
}

module.exports = { resolveBillingMonth };
