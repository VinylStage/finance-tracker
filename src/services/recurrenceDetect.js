'use strict';

// 반복되는 거래를 알아채고 규칙 등록을 제안한다(#499).
//
// ─────────────────────────────────────────────────────────────────────────
// 이 모듈은 DB 를 모른다. 거래 배열을 받아 후보를 돌려줄 뿐이다.
//
// 감지 규칙이 이 기능의 어려운 부분이라 순수 함수로 뺐다. 느슨하면 소음이 되고
// 빡빡하면 안 뜬다 — 경계를 여러 번 조정하게 될 텐데, DB 를 끼면 그때마다
// 픽스처를 다시 만들어야 한다.
//
// ── 왜 자동 생성하지 않는가
//
// 감지는 틀릴 수 있다. 이 저장소는 "자동으로 만들어진 거래" 가 사용자를 놀라게
// 하는 문제를 이미 다뤘다(#280 — 안 알리면 자기가 만들지 않은 거래가 목록에
// 나타난 것으로 보인다). 틀릴 수 있는 기능에서 자동 생성까지 가면 그 문제가
// 커진다. **제안까지만 한다.**
// ─────────────────────────────────────────────────────────────────────────

// 서로 다른 달에 3번. 같은 달에 세 번 간 것은 반복이 아니라 단골이다.
const MIN_MONTHS = 3;

// 금액이 이만큼 넘게 흔들리면 "금액이 달라진다" 고 표시한다. 통신비처럼 매달
// 조금씩 다른 항목이 흔해서, 금액이 같아야만 패턴으로 보면 대부분 안 잡힌다.
// 대신 그 사실을 사용자에게 말한다 — 반복 규칙은 고정 금액을 전제하므로
// (`Settings` 안내문) 흔들리는 항목은 등록을 권하지 않는다.
const AMOUNT_TOLERANCE = 0.2;

// 결제일이 며칠까지 흔들려도 같은 주기로 볼 것인가. "매달 15일" 이 아니라
// "매달 15일 언저리" 인 경우가 흔하다(주말·공휴일에 밀린다).
const DAY_TOLERANCE = 5;

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function mode(values) {
  const count = new Map();
  for (const v of values) count.set(v, (count.get(v) || 0) + 1);
  let best = null;
  let bestN = -1;
  for (const [v, n] of count) if (n > bestN) { best = v; bestN = n; }
  return best;
}

function normalizeMerchant(s) {
  return String(s ?? '').trim().replace(/\s+/g, ' ');
}

/**
 * 반복 후보를 찾는다.
 *
 * @param {Array} rows  거래 배열. { date, amount, merchant, category_id, payment_method_id, payment_style }
 * @param {object} opts
 * @param {string[]} opts.existingMerchants  이미 규칙이 있는 가맹점. 제외한다
 * @param {string[]} opts.dismissedMerchants 사용자가 "아니오" 한 가맹점. 제외한다
 * @param {number}   opts.minMonths          몇 개 달에 나타나야 패턴인가
 * @returns {Array} 후보 배열 (occurrences 많은 순)
 */
function detectRecurringCandidates(rows, opts = {}) {
  const {
    existingMerchants = [],
    dismissedMerchants = [],
    minMonths = MIN_MONTHS,
    amountTolerance = AMOUNT_TOLERANCE,
    dayTolerance = DAY_TOLERANCE,
  } = opts;

  if (!Array.isArray(rows)) return [];

  // 이미 규칙이 있거나 사용자가 거절한 가맹점은 후보로 올리지 않는다.
  //
  // **거절을 기억하는 것이 특히 중요하다.** "아니오" 를 눌렀는데 다음 달에 또
  // 물으면 사용자는 제안 자체를 무시하게 되고, 그러면 이 기능이 무의미해진다.
  const excluded = new Set(
    [...existingMerchants, ...dismissedMerchants].map(normalizeMerchant).filter(Boolean)
  );

  const groups = new Map();
  for (const r of rows) {
    if (!r) continue;
    const merchant = normalizeMerchant(r.merchant);
    if (!merchant || excluded.has(merchant)) continue;
    const date = String(r.date ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const amount = Number(r.amount);
    if (!Number.isFinite(amount) || amount === 0) continue;
    // 파생 거래는 계산 결과지 사용자의 소비 습관이 아니다. 이걸 패턴으로 보면
    // "할부 이자를 반복 규칙으로 등록하시겠어요" 같은 제안이 나온다.
    if (r.origin && r.origin !== 'manual') continue;

    if (!groups.has(merchant)) groups.set(merchant, []);
    groups.get(merchant).push({ ...r, merchant, date, amount });
  }

  const out = [];
  for (const [merchant, items] of groups) {
    const months = new Set(items.map((i) => i.date.slice(0, 7)));
    if (months.size < minMonths) continue;

    const amounts = items.map((i) => i.amount);
    const days = items.map((i) => Number(i.date.slice(8, 10)));
    const amountMedian = median(amounts);
    const dayMedian = median(days);

    // 편차는 "얼마나 흔들리나" 다. 최대 이탈로 잰다 — 평균 편차는 한 번 크게
    // 튄 것을 감춘다.
    const amountSpread = amountMedian === 0
      ? 0
      : Math.max(...amounts.map((a) => Math.abs(a - amountMedian))) / amountMedian;
    const daySpread = Math.max(...days.map((d) => Math.abs(d - dayMedian)));

    out.push({
      merchant,
      occurrences: items.length,
      months: months.size,
      first_seen: items.reduce((a, b) => (a.date < b.date ? a : b)).date,
      last_seen: items.reduce((a, b) => (a.date > b.date ? a : b)).date,
      // 규칙 폼이 그대로 채울 값
      amount: amountMedian,
      day_of_month: dayMedian,
      category_id: mode(items.map((i) => i.category_id)),
      payment_method_id: mode(items.map((i) => i.payment_method_id)),
      payment_style: mode(items.map((i) => i.payment_style)) || '일시불',
      // 사용자가 판단할 근거. 숨기면 "왜 이 금액이지" 를 알 수 없다.
      amount_varies: amountSpread > amountTolerance,
      day_varies: daySpread > dayTolerance,
      amount_min: Math.min(...amounts),
      amount_max: Math.max(...amounts),
    });
  }

  // **흔들리지 않는 것을 먼저 올린다.**
  //
  // 반복 규칙은 고정 금액을 전제한다(`Settings` 안내문: "매달 금액이 완전히 고정된
  // 지출만 등록하세요"). 그런데 건수로만 정렬하면 자주 가는 쇼핑몰·교통충전이
  // 위를 차지한다 — 실거래 580건으로 돌려 보니 상위 8개 중 7개가 금액 변동이었다.
  //
  // 등록하면 안 되는 것을 위에 두면 사용자는 목록을 읽다 지치고, 그러면 정작
  // 등록해야 할 구독료가 아래에 묻힌다.
  const stability = (c) => (c.amount_varies ? 1 : 0) + (c.day_varies ? 1 : 0);
  out.sort((a, b) =>
    stability(a) - stability(b)
    || b.occurrences - a.occurrences
    || b.last_seen.localeCompare(a.last_seen));
  return out;
}

module.exports = {
  detectRecurringCandidates,
  MIN_MONTHS,
  AMOUNT_TOLERANCE,
  DAY_TOLERANCE,
};
