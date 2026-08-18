'use strict';

const { estimateBenefit } = require('./cardStrategy');

// 사후 분석 — 실제로 쓴 카드와 최적 카드의 차액(#276).
//
// ─────────────────────────────────────────────────────────────────────────
// 이 값이 무엇을 말하고 무엇을 말하지 않는가
//
// **"그때 이 카드를 썼으면 얼마 더 받았다" 를 말한다.** 그 이상은 말하지
// 않는다 — 사용자가 그 카드를 갖고 있었는지, 한도가 남아 있었는지, 실적을
// 채웠는지는 그 시점의 사정이고 우리는 지금 값으로만 계산한다.
//
// 그래서 이건 **"놓친 돈" 이 아니라 "지금 기준으로 다시 계산한 차이"** 다.
// 화면이 그렇게 말해야 한다.
//
// ─────────────────────────────────────────────────────────────────────────
// 카드가 하나면 하지 않는다
//
// 비교 대상이 없다. 억지로 "최적입니다" 라고 말하면 사용자는 선택지가 있는
// 줄 안다. 빈 결과를 돌려주고 화면이 그 이유를 말한다(인수 기준).
//
// ─────────────────────────────────────────────────────────────────────────
// 파생 거래를 뺀다
//
// 할부 이자·리볼빙 수수료는 카드 혜택 대상이 아니다(#268 의 origin 구분).
// 넣으면 "이 카드를 썼으면 이자에도 적립이 붙었다" 는 거짓이 된다.
// 호출부가 걸러 넘기는 것이 원칙이지만, 여기서도 한 번 막는다 — 두 곳에서
// 막아야 한 곳이 빠져도 거짓이 안 나온다.

// ─────────────────────────────────────────────────────────────────────────
// "카드를 안 썼다" 와 "어느 카드인지 모른다" 는 다르다
//
// 실측(2026-08-04): 거래 546건 중 **458건이 신용·체크 결제인데
// card_product_id 가 전부 NULL** 이다. 카드 상품 등록 화면(#302)이 아직
// 없어서다.
//
// 이 둘을 같게 보면 458건 전부가 "카드를 안 썼다" 가 되고, 최적 카드 혜택
// **전액이 '놓친 돈' 으로 잡힌다.** 사용자는 실제로 카드를 썼는데 앱이
// 수십만원을 놓쳤다고 말하는 상태가 된다.
//
// 그래서 세 가지를 나눈다.
//
//   card_product_id 있음         → 실제 혜택을 계산해 차액을 낸다
//   카드 결제수단인데 id 없음      → **차액 계산에서 뺀다.** 모르는 것은 모른다고 한다
//   현금·이체                    → 카드를 안 쓴 것이 맞다. 차액은 최적 카드 혜택 전액
//
// 두 번째는 unknownCard 로 세어 화면이 "카드 상품을 등록하면 N건을 더
// 분석할 수 있어요" 를 말할 수 있게 한다.

// 카드로 결제된 것으로 보는 결제수단 종류. constants 의 CARD_TYPES 와 같은
// 값이지만 이쪽은 payment_methods.type 이라 별도로 둔다.
const CARD_PAYMENT_TYPES = new Set(['신용', '체크']);

// 혜택 대상이 아닌 출처. constants 의 LOCKED_ORIGINS 와 겹치지만 뜻이 다르다 —
// 저쪽은 "화면에서 못 고친다", 이쪽은 "혜택 대상이 아니다".
const NON_ELIGIBLE_ORIGINS = new Set(['installment', 'revolving', 'debt_interest', 'debt_repayment']);

// 카드 결제인데 어느 상품인지 모르는가. 이걸 "카드 안 씀" 과 섞으면 차액이
// 부풀려진다.
function isUnknownCard(tx) {
  if (!tx) return false;
  if (tx.card_product_id !== null && tx.card_product_id !== undefined) return false;
  return CARD_PAYMENT_TYPES.has(tx.payment_method_type);
}

function isEligible(tx) {
  const origin = tx && tx.origin ? tx.origin : 'manual';
  return !NON_ELIGIBLE_ORIGINS.has(origin);
}

/**
 * 거래 목록을 카드별로 다시 계산해 실제 대비 최적의 차액을 낸다.
 *
 * @param {object} input
 * @param {Array} input.transactions  { id, amount, category_id, merchant, card_product_id, origin }
 * @param {Array} input.cards         { id, product_name, benefits: [...], thresholdMet }
 * @returns {{comparable: boolean, reason?: string, totalGap: number, byCard: Array, details: Array}}
 */
// 추천 후보인가. 더 안 쓰기로 한 카드(#410)는 "이걸 썼어야 한다" 로 권할 수
// 없다. is_active 가 없는 호출부(예전 테스트, 계산기 단독 사용)는 전부 후보로 본다.
function isCandidate(card) {
  return card.is_active === undefined || card.is_active === null || !!card.is_active;
}

/**
 * `cardsByMonth` 는 «그 달 기준으로 실적을 판정한 카드 목록» 이다(#650).
 *
 * 실적은 **달마다 다시 정해지는 값**이다(전월 달력월, #526 · #398). 그런데 예전에는
 * 호출부가 `to` 하나로 판정한 목록을 넘겼고, 그 판정이 구간 전체에 그대로 쓰였다.
 * 기본 구간이 3개월이라 거의 항상 여러 달을 훑으므로 **마지막 달의 판정이 앞의 달들을
 * 덮어썼다.**
 *
 * 실측: 6월에 실적을 채우고 7월에 결제한 거래가
 *   `from=2026-03-01&to=2026-10-31` → 차액 3,450원 (9월 지출이 0 이라 «미달» 로 판정)
 *   `from=2026-07-01&to=2026-07-31` → 차액 19,000원
 * 로 갈렸다. 반대 방향도 성립한다 — 마지막 달만 채웠으면 못 채운 달까지 혜택이 붙어
 * 과대추정된다.
 *
 * 안 넘기면 예전처럼 `cards` 하나를 모든 달에 쓴다. 계산기를 단독으로 쓰는 호출부와
 * 기존 테스트가 그대로 동작해야 하기 때문이다.
 */
function compareCards({ transactions, cards, cardsByMonth } = {}) {
  const list = Array.isArray(transactions) ? transactions : [];
  const cardList = Array.isArray(cards) ? cards : [];

  // **cards 는 두 가지로 쓰인다.**
  //   조회용   그 거래가 실제로 어느 카드로 얼마를 받았나  → 비활성도 있어야 한다
  //   후보용   그 거래를 어느 카드로 썼어야 했나           → 활성만
  // 하나로 뭉뚱그리면 둘 중 하나가 틀린다. 비활성을 빼면 그 카드로 결제한
  // 과거 거래가 "혜택 0" 으로 잡혀 차액이 부풀고, 넣으면 못 쓰는 카드를 권한다.
  const candidates = cardList.filter(isCandidate);

  // 비교는 고를 수 있는 카드가 둘 이상일 때만 성립한다.
  if (candidates.length < 2) {
    return { comparable: false, reason: 'single-card', totalGap: 0, byCard: [], details: [] };
  }
  const candidateIds = new Set(candidates.map((c) => c.id));

  const eligible = list.filter(isEligible);
  if (eligible.length === 0) {
    return { comparable: false, reason: 'no-eligible-transactions', totalGap: 0, byCard: [], details: [], unknownCard: 0 };
  }

  // 카드로 썼는데 어느 상품인지 모르는 건은 차액 계산에서 뺀다.
  const analyzable = eligible.filter((tx) => !isUnknownCard(tx));
  const unknownCard = eligible.length - analyzable.length;

  if (analyzable.length === 0) {
    return { comparable: false, reason: 'card-product-unknown', totalGap: 0, byCard: [], details: [], unknownCard };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 한도 누적을 두 벌로 나눠 든다(#637)
  //
  // 예전에는 한 벌(`used`)이었고 **실제로 쓴 카드만** 올렸다. 그 결정에는 이유가
  // 있었다 — 카드 A 가정과 카드 B 가정이 서로의 한도를 깎으면 계산이 뒤엉킨다.
  //
  // 그런데 그러면 **한 번도 안 쓴 카드는 한도가 영원히 열려 있다.** 「B카드로
  // 바꿨다면」 을 계산할 때 B 의 누적이 0 으로 고정되므로, 한 달에 여러 건이 있으면
  // 월 한도가 건마다 새로 열린다. 실측으로 **6배 과대추정**이 나왔다 —
  // 한 달 10만원 3건 · 적립 10% / 월 한도 5,000 인 카드에서 12,000 vs 정답 2,000.
  //
  // 갈라야 하는 것은 «가정끼리» 가 아니라 «어느 시나리오인가» 였다.
  //
  //   hypo    그 카드로 **적격 거래를 계속 썼다면** 그 카드가 받은 누적
  //           → 카드마다 독립이다. A 가정이 B 의 누적을 건드리지 않는다
  //   actual  **실제로 그 카드로 결제한** 거래에서 받은 누적
  //           → 실제 카드 쪽 계산에 쓴다. hypo 와 다르다(일부 거래만 그 카드였다)
  //
  // 그리고 둘 다 **달력월로 리셋한다.** 예전에는 창 개념이 없어 조회 기간 전체에
  // 한 번만 열렸다(`/comparison` 기본 기간은 최근 3개월이다). 월 경계를 달력월로
  // 두는 것은 전월 실적과 같은 기준이다(#398).
  const hypoUsed = new Map(cardList.map((c) => [c.id, new Map()]));
  const actualUsed = new Map(cardList.map((c) => [c.id, new Map()]));
  const gained = new Map(cardList.map((c) => [c.id, 0]));

  // 거래일에서 달력월을 꺼낸다. 'YYYY-MM-DD' 라 앞 7자다.
  const monthOf = (date) => String(date || '').slice(0, 7);
  const readUsed = (store, cardId, ym) => {
    const per = store.get(cardId);
    return per ? (per.get(ym) || 0) : 0;
  };
  const addUsed = (store, cardId, ym, delta) => {
    if (!delta) return;
    let per = store.get(cardId);
    if (!per) { per = new Map(); store.set(cardId, per); }
    per.set(ym, (per.get(ym) || 0) + delta);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 항목별·창별 누적(#637)
  //
  // 위 두 벌과 **같은 이유로 두 벌**이다. 가정과 실제가 서로 다른 값을 봐야 하는데,
  // 항목 한도만 한 벌로 두면 «이 카드로 계속 썼다면» 이 실제 결제 건수만큼만
  // 소진돼 항목 한도가 헐거워진다.
  //
  //   1. `day` 창이 계산에 **걸린다.** 예전에는 일 누적을 아무도 몰라 선언만 받고
  //      넘겼다(#631) — «군마트 일 2만원» 같은 줄이 전부 안 걸리고 있었다
  //   2. `month` 창을 **항목 단위**로 자른다. 카드 단위 누적을 넘기면 같은 카드의
  //      다른 항목이 쓴 몫까지 빼서 과하게 잘린다
  //
  // 저장 표를 새로 만들지 않는다. 훑는 동안만 들고 있으면 된다 — 표를 두면 계산할
  // 때마다 쓰고 지워야 하고, 그 표가 계산 결과와 어긋나는 순간을 아무도 못 잡는다.
  //
  // 키에 창을 박아 둔다(`혜택id|2026-03`). 위 `hypoUsed` 가 달력월로 키를 잡는 것과
  // 같은 이유다 — 훑는 순서에 기대지 않아야 «앞 창에서 넘어옴» 이 안 생긴다.
  const itemStore = () => ({ month: new Map(), day: new Map() });
  const hypoItem = itemStore();
  const actualItem = itemStore();

  // 이 거래 시점에서 그 혜택 줄이 이미 받은 몫. 계산기가 **고른 줄에 대해서만** 묻는다.
  // 창마다 «얼마» 와 «몇 번» 을 같이 든다. 횟수 한도(#638)는 금액과 같은 창을 쓰지만
  // 세는 것이 달라서, 한쪽만 들면 「월 1회」 를 표현할 수 없다.
  const ZERO = { amount: 0, count: 0 };
  const itemUsedFrom = (store, ym, ymd) => (benefitId) => {
    const m = store.month.get(`${benefitId}|${ym}`) || ZERO;
    const used = { month: m.amount };
    const count = { month: m.count };
    // 날짜를 모르면 `day` 를 아예 안 싣는다. 0 으로 채우면 한도가 안 걸린 것을
    // 걸린 것처럼 보이게 한다 — 신호 부재를 통과로 읽는 셈이다. 안 실으면
    // 계산기가 «적용 못 한 창» 으로 보고해 화면이 그 사실을 말할 수 있다.
    if (ymd !== null) {
      const d = store.day.get(`${benefitId}|${ymd}`) || ZERO;
      used.day = d.amount;
      count.day = d.count;
    }
    return { used, count };
  };

  // 고른 줄이 있고 실제로 붙었을 때만 적는다. 아무것도 안 걸린 거래는 어떤 줄의
  // 한도도 소진하지 않는다.
  const addItemUsed = (store, result, ym, ymd) => {
    if (!result || !result.applied || !(result.benefit > 0)) return;
    const id = result.applied.id;
    const bump = (map, key) => {
      const cur = map.get(key) || ZERO;
      // 금액과 함께 **붙은 횟수**를 센다(#638). 「월 1회」 는 결제액과 무관하다.
      map.set(key, { amount: cur.amount + result.benefit, count: cur.count + 1 });
    };
    bump(store.month, `${id}|${ym}`);
    if (ymd !== null) bump(store.day, `${id}|${ymd}`);
  };

  let totalGap = 0;
  const details = [];

  for (const tx of analyzable) {
    const amount = Number(tx.amount) || 0;
    const ym = monthOf(tx.date);
    // 일 창을 쓰려면 날짜가 온전해야 한다. 못 읽으면 **안다고 하지 않는다.**
    const ymd = /^\d{4}-\d{2}-\d{2}$/.test(String(tx.date || '')) ? String(tx.date) : null;

    // **그 거래가 일어난 달의 실적 판정**을 쓴다(#650). 없으면 예전처럼 하나를 쓴다.
    const monthCards = (cardsByMonth && cardsByMonth.get(ym)) || cardList;

    // 카드마다 이 거래를 계산한다. **그 카드의 가정 누적**을 넘긴다 — 한도가 작은
    // 카드가 실제보다 좋아 보이지 않게 하려면 이 값이 0 으로 고정돼선 안 된다.
    const perCard = monthCards.map((card) => {
      const r = estimateBenefit({
        benefits: card.benefits || [],
        amount,
        categoryId: tx.category_id,
        merchant: tx.merchant,
        // 카드사 상당수가 할부를 혜택 대상에서 뺀다(#563). 혜택에 제약이
        // 없으면 예전과 같이 결제방식을 가리지 않는다.
        paymentStyle: tx.payment_style,
        // 이번 달에 적용되는 구간(#563). 지난달 지출이 어느 구간에 드는지로
        // 정해지고, 그 구간에 걸린 혜택만 후보가 된다.
        activeTierId: card.threshold && card.threshold.tier ? card.threshold.tier.id : null,
        thresholdMet: card.thresholdMet !== false,
        benefitUsedThisMonth: readUsed(hypoUsed, card.id, ym),
        // 그 구간의 카드 월 통합 한도(#578). 구간이 없으면 undefined 이고, 그때는
        // 옛 `card_benefits.monthly_cap` 컬럼으로 되돌아간다.
        tierMonthlyCap: card.threshold && card.threshold.tier ? card.threshold.tier.monthly_cap : null,
        // 거래일(#638). 국군의 날·현충일처럼 특정 날에만 붙는 혜택을 가린다.
        // 안 넘기면 그런 혜택이 통째로 빠진다 — 여기서 빠뜨리면 계산기는
        // 「날짜를 모른다」 로 읽고 조용히 뺀다.
        date: tx.date,
        // 항목별·창별 누적(#637). **가정 쪽 누적**을 본다 — 계산기가 고른 줄에
        // 대해서만 불린다.
        itemUsedFor: itemUsedFrom(hypoItem, ym, ymd),
      });
      return { cardId: card.id, productName: card.product_name, ...r };
    });

    // 실제로 쓴 카드는 **비활성이어도 찾아야 한다.** 그 카드로 결제한 것은
    // 사실이고, 빼면 그 거래가 "혜택 0" 이 되어 차액이 부풀려진다.
    //
    // 다만 위 `perCard` 는 **가정 누적**으로 계산한 값이라 실제 카드의 값으로는 쓸 수
    // 없다. 실제 카드는 그 카드로 **실제 결제한 건들의 누적**을 봐야 하므로 따로 센다.
    // 두 누적이 다른 예: 세 건 중 한 건만 A 로 결제했다면 hypo 는 세 건, actual 은 한 건이다.
    const actualCard = tx.card_product_id === null || tx.card_product_id === undefined
      ? null
      : monthCards.find((c) => c.id === tx.card_product_id) || null;
    const actual = actualCard
      ? {
        cardId: actualCard.id,
        productName: actualCard.product_name,
        ...estimateBenefit({
          benefits: actualCard.benefits || [],
          amount,
          categoryId: tx.category_id,
          merchant: tx.merchant,
          paymentStyle: tx.payment_style,
          activeTierId: actualCard.threshold && actualCard.threshold.tier ? actualCard.threshold.tier.id : null,
          thresholdMet: actualCard.thresholdMet !== false,
          benefitUsedThisMonth: readUsed(actualUsed, actualCard.id, ym),
          tierMonthlyCap: actualCard.threshold && actualCard.threshold.tier
            ? actualCard.threshold.tier.monthly_cap : null,
          // 가정 쪽과 **같이** 넘긴다(#638). 여기만 빠뜨리면 날짜 조건이 붙은
          // 혜택이 실제 카드 계산에서만 조용히 사라져, 실제로 받은 혜택이 0 으로
          // 잡히고 차액이 그만큼 부풀려진다.
          date: tx.date,
          // 항목 누적도 **실제 쪽**을 본다(#637). 가정 누적을 물리면 실제로는
          // 한 건만 쓴 줄이 세 건 쓴 것으로 잘려 실제 혜택이 낮게 잡힌다.
          itemUsedFor: itemUsedFrom(actualItem, ym, ymd),
        }),
      }
      : null;

    // 반면 "썼어야 할 카드" 는 지금 고를 수 있는 것 중에서만 고른다.
    const bestPool = perCard.filter((p) => candidateIds.has(p.cardId));
    const best = bestPool.reduce((a, b) => (b.benefit > a.benefit ? b : a), bestPool[0]);

    // 누적을 두 벌 다 올린다.
    //
    // **가정은 카드마다 자기 시나리오에서만 오른다.** 「이 카드로 계속 썼다면」 이므로
    // 그 카드가 이 거래에서 받을 값을 그 카드의 누적에만 더한다 — A 가정이 B 의 누적을
    // 건드리지 않으므로 예전 주석이 걱정한 «가정끼리 뒤엉킴» 은 생기지 않는다.
    //
    // **통합 한도 밖인 줄은 카드 단위 누적에 안 넣는다**(#648). 넣으면 그 줄이 다른
    // 항목의 한도를 깎아, 「한도 밖」 이라는 말이 반쪽만 지켜진다. 가정·실제 두 벌에
    // 똑같이 건다 — 한쪽만 걸면 같은 혜택이 시나리오에 따라 다르게 취급된다.
    const inUnified = (r) => !(r && r.applied && r.applied.unifiedCapExempt);
    for (const p of perCard) if (inUnified(p)) addUsed(hypoUsed, p.cardId, ym, p.benefit);
    // 실제는 실제로 그 카드로 결제한 건에서만 오른다.
    if (actual && inUnified(actual)) addUsed(actualUsed, actual.cardId, ym, actual.benefit);
    // 항목 누적은 면제와 무관하게 올린다 — 면제는 **통합 한도 한 층**에만 걸린다.
    for (const p of perCard) addItemUsed(hypoItem, p, ym, ymd);
    if (actual) addItemUsed(actualItem, actual, ym, ymd);

    const actualBenefit = actual ? actual.benefit : 0;
    const gap = Math.max(0, best.benefit - actualBenefit);
    totalGap += gap;
    gained.set(best.cardId, (gained.get(best.cardId) || 0) + gap);

    details.push({
      transactionId: tx.id,
      merchant: tx.merchant,
      amount,
      // 실제 카드가 없는 거래(현금 등)도 있다. null 을 숨기지 않는다.
      actual: actual ? { cardId: actual.cardId, benefit: actual.benefit } : null,
      best: { cardId: best.cardId, productName: best.productName, benefit: best.benefit },
      gap,
    });
  }

  const byCard = cardList
    .map((c) => ({ cardId: c.id, productName: c.product_name, gapIfUsed: gained.get(c.id) || 0 }))
    .filter((c) => c.gapIfUsed > 0)
    .sort((a, b) => b.gapIfUsed - a.gapIfUsed);

  return { comparable: true, totalGap, byCard, details, unknownCard };
}

module.exports = { compareCards, isEligible, isUnknownCard, NON_ELIGIBLE_ORIGINS, CARD_PAYMENT_TYPES };
