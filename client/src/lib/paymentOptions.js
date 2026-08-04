// 거래 입력의 결제수단 선택지(#302 2단계).
//
// 거래 한 건이 들고 있어야 하는 값은 둘이다 — 카드사(payment_method_id)와
// 카드상품(card_product_id). <select> 는 값을 하나만 실을 수 있으므로 어느
// 쪽인지 접두사로 밝힌 합성 키를 쓴다. 숫자만 쓰면 카드사 1번과 카드상품
// 1번이 같은 값이 되어 구분할 수 없다.
//
// 카드사 단위로는 전략 추천이 성립하지 않는다(#302). 같은 카드사 카드 두 장의
// 혜택이 다른데 어느 쪽으로 결제했는지가 데이터에 안 남기 때문이다. 그래서
// 카드는 **상품명이 주표기**, 카드사는 보조표기로 뒤에 붙인다.

// 정본은 src/constants.js(백엔드, CommonJS)의 CARD_TYPES.
// 프런트(ESM/Vite)와 빌드 도구가 분리되어 값을 공유하지 못하므로 수동 동기화 필요(#90).
export const CARD_TYPES = ['신용', '체크'];

export const CARD_GROUP_LABEL = '카드';

// 카드사는 알지만 어느 카드인지 모르는 거래다. 016 이 정한 대로 "미상" 은
// card_product_id IS NULL 이며 전용 센티널 행을 두지 않는다. 기억나지 않아
// 못 고르는 거래가 실제로 남으므로(#306) 이 선택지는 항상 있어야 한다.
export const UNASSIGNED_LABEL = '상품 미지정';

// 카드도 현금성도 이체도 아닌 type 이 들어왔을 때의 그룹명. 결제수단 type 은
// 자유 문자열이라 새 값이 생겨도 선택지에서 사라지지 않게 받아 둔다.
const FALLBACK_GROUP_LABEL = '기타';

function isCardMethod(pm) {
  return CARD_TYPES.includes(pm.type);
}

// 선택 상태 → <select> 값. 상품이 정해졌으면 상품이 이긴다.
export function optionValue({ payment_method_id, card_product_id } = {}) {
  if (card_product_id !== undefined && card_product_id !== null && card_product_id !== '') {
    return `cp:${card_product_id}`;
  }
  if (payment_method_id !== undefined && payment_method_id !== null && payment_method_id !== '') {
    return `pm:${payment_method_id}`;
  }
  return '';
}

// <select> 값 → 저장할 두 컬럼. 상품을 고르면 그 상품이 달린 카드사가 함께
// 정해진다 — 화면에서 카드사를 따로 고르게 하지 않는 이유이자, 둘이 어긋난
// 채로 저장되지 않게 막는 지점이다.
//
// 목록에 없는 상품 id 는 빈 선택으로 떨어뜨린다. 카드사만 남기면 사용자가
// 고르지 않은 카드사가 조용히 저장된다.
export function parseSelection(value, cardProducts = []) {
  const empty = { payment_method_id: null, card_product_id: null };
  if (!value) return empty;

  if (value.startsWith('cp:')) {
    const id = Number(value.slice(3));
    const product = cardProducts.find((p) => p.id === id);
    if (!product) return empty;
    return { payment_method_id: product.payment_method_id, card_product_id: product.id };
  }
  if (value.startsWith('pm:')) {
    const id = Number(value.slice(3));
    if (!Number.isInteger(id)) return empty;
    return { payment_method_id: id, card_product_id: null };
  }
  return empty;
}

// 그룹핑된 선택지를 만든다. 카드가 10장이어도 고를 수 있어야 한다는 요건이라
// 카드/현금성/이체를 optgroup 으로 나눈다. 카드사별로 다시 나누지 않는 것은
// optgroup 을 중첩할 수 없기 때문이고, 카드사는 어차피 각 항목에 붙는다.
//
// 반환: [{ label, options: [{ value, label }] }]
export function buildPaymentOptions(paymentMethods = [], cardProducts = []) {
  const byMethod = new Map();
  for (const product of cardProducts) {
    if (!byMethod.has(product.payment_method_id)) byMethod.set(product.payment_method_id, []);
    byMethod.get(product.payment_method_id).push(product);
  }

  const cards = [];
  const others = new Map(); // type → options. Map 이라 결제수단 목록의 순서가 유지된다.

  for (const pm of paymentMethods) {
    if (!isCardMethod(pm)) {
      const label = pm.type || FALLBACK_GROUP_LABEL;
      if (!others.has(label)) others.set(label, []);
      others.get(label).push({ value: `pm:${pm.id}`, label: pm.name });
      continue;
    }

    const products = byMethod.get(pm.id) || [];
    byMethod.delete(pm.id);
    for (const product of products) {
      cards.push({ value: `cp:${product.id}`, label: `${product.product_name} · ${pm.name}` });
    }
    // 등록된 카드가 없는 카드사는 이름만 보인다. 한 장도 등록하지 않은 사용자에게
    // "· 상품 미지정" 을 여섯 줄 보여 봐야 고를 것이 하나뿐이라 뜻이 없다.
    cards.push({
      value: `pm:${pm.id}`,
      label: products.length ? `${pm.name} · ${UNASSIGNED_LABEL}` : pm.name,
    });
  }

  // 결제수단 목록에 없는 카드사에 달린 상품. /api/payment-methods 가 기본으로
  // 비활성 결제수단을 빼기 때문에 실제로 생긴다. 여기서 흘리면 그 카드로 기록된
  // 과거 거래를 수정할 때 선택이 비고, 저장하는 순간 카드가 지워진다.
  for (const products of byMethod.values()) {
    for (const product of products) {
      cards.push({ value: `cp:${product.id}`, label: `${product.product_name} · ${product.issuer}` });
    }
  }

  const groups = [];
  if (cards.length) groups.push({ label: CARD_GROUP_LABEL, options: cards });
  for (const [label, options] of others) groups.push({ label, options });
  return groups;
}
