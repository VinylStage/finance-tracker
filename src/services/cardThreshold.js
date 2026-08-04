'use strict';

const { NON_ELIGIBLE_ORIGINS } = require('./cardComparison');

// 전월 실적 합산(#276).
//
// ─────────────────────────────────────────────────────────────────────────
// 실적 기간과 청구 기간은 다른 것이다
//
// 이 파일은 처음에 실적을 **마감일 ~ 마감일**로 잡았다가 고쳤다. 틀렸기
// 때문이다. 두 기간은 이름만 비슷하고 답하는 질문이 다르다.
//
//   결제일별 이용기간   이번 달에 **얼마를 청구**하나   → 결제일마다 다르다
//   전월실적 산정기간   혜택 **자격**을 채웠나          → **전월 1일 ~ 말일**
//
// 사람들이 결제일을 12·13·14·15일로 맞추는 관행이 근거다. **실적이 달력월로
// 고정이라서** 청구 이용기간을 거기에 맞추는 것이다 — 실적이 결제일을
// 따라간다면 이 관행이 성립할 이유가 없다. (현대 12일 / 삼성·하나·BC 13일 /
// 신한·롯데·KB·우리·NH 14일 / 기업 15일)
//
// 실제 오차도 쟀다. 결제일 25일 카드에서 2026-02 기준 실적조건 40만원이면
// 마감일 기준은 321,394원(미달), 달력월은 403,054원(충족)이다. **사용자가
// 자격을 채웠는데 앱이 혜택을 0 으로 계산해 추천에서 떨어뜨린다.**
//
// 그래서 여기서는 statement_close_day 를 **쓰지 않는다.** 그 컬럼은
// cardBilling.billingMonthFor 의 것이고, 청구월은 결제일·마감일 기준이 맞다.
// 두 함수를 같은 규칙으로 통일하려 들면 안 된다.
//
// ─────────────────────────────────────────────────────────────────────────
// 카드사별 예외는 지금 모델링하지 않는다
//
// "카드사마다 실적 계산 기준이 다르다" 는 언급이 있고, 결제일이 아니라
// **전표 접수일**(매출전표가 카드사에 접수된 날) 기준인 곳도 있다. 다만 어느
// 카드가 예외인지 확인된 것이 아직 없다.
//
// 쓰지도 않을 threshold_period_type 컬럼을 미리 넣지 않는다. 실제 예외 카드가
// 확인되면 그때 별도 이슈로 연다.
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

/**
 * asOf 시점에서 "전월 실적" 으로 볼 구간을 돌려준다. **전월 달력월이다.**
 *
 * 카드 정보를 받지 않는다. 실적 구간은 카드마다 다르지 않다 — 마감일·결제일이
 * 정하는 것은 청구 기간이지 실적 기간이 아니다(위 주석).
 *
 * @param {string} asOf 'YYYY-MM-DD'
 * @returns {{start: string, end: string}} 양 끝 포함
 */
function prevPeriodFor(asOf) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(asOf || ''));
  if (!m) throw new TypeError(`asOf 는 YYYY-MM-DD 여야 한다: ${asOf}`);

  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;

  // 말일은 다음 달 0일이다. 윤년과 30/31일이 자동으로 맞는다.
  return {
    start: toYmd(new Date(year, monthIndex - 1, 1)),
    end: toYmd(new Date(year, monthIndex, 0)),
  };
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
 * @param {object|null} input.cardProduct { prev_month_threshold }
 * @param {Array} input.transactions      { date, amount, origin, major_type }
 * @param {string} input.asOf             'YYYY-MM-DD'
 */
function computeThreshold({ cardProduct, transactions, asOf } = {}) {
  const period = prevPeriodFor(asOf);
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
