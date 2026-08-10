// 감사 이력을 사람이 읽는 형태로 바꾼다(#301).
//
// JSON 을 그대로 뱉지 않는다. `category_id: 12 → 15` 는 사용자에게 아무 의미가
// 없다 — `카테고리: 식비 → 교통비` 로 보여야 한다.

// 파싱 실패와 "원래 null" 을 구분한다. 둘을 같게 다루면 깨진 로그가 "생성됨" 으로
// 보인다 — 실제로는 무엇이었는지 모르는 상태다. 틀린 diff 를 보여주느니 아무것도
// 안 보여주는 편이 낫다.
const BROKEN = Symbol('broken');

function parse(json) {
  if (json === null || json === undefined) return null;
  try {
    const v = JSON.parse(json);
    return v && typeof v === 'object' ? v : BROKEN;
  } catch {
    // 로그가 깨져 있어도 화면 전체가 죽으면 안 된다.
    return BROKEN;
  }
}

// diffFields(beforeJson, afterJson) → [{ key, before, after }]
//
// 값이 달라진 필드만 담는다. 안 바뀐 필드까지 늘어놓으면 무엇이 바뀌었는지
// 오히려 안 보인다.
export function diffFields(beforeJson, afterJson) {
  const before = parse(beforeJson);
  const after = parse(afterJson);

  // 한쪽이라도 깨졌으면 diff 를 신뢰할 수 없다.
  if (before === BROKEN || after === BROKEN) return [];
  if (!before && !after) return [];

  const keys = new Set([
    ...(before ? Object.keys(before) : []),
    ...(after ? Object.keys(after) : []),
  ]);

  const out = [];
  for (const key of [...keys].sort()) {
    const b = before ? before[key] : null;
    const a = after ? after[key] : null;
    // 생성·삭제는 전부 보여준다. 수정은 달라진 것만.
    if (before && after && String(b ?? '') === String(a ?? '')) continue;
    out.push({ key, before: before ? (b ?? null) : null, after: after ? (a ?? null) : null });
  }
  return out;
}

// id 계열 필드를 이름으로 바꾼다. 사용자는 id 를 모른다.
const ID_FIELDS = {
  category_id: 'categories',
  payment_method_id: 'paymentMethods',
};

export function labelForField(key, value, lookups) {
  if (value === null || value === undefined) return '(없음)';

  const bucket = ID_FIELDS[key];
  if (bucket && lookups && lookups[bucket]) {
    // 매핑에 없으면 값 그대로 — 지워진 카테고리를 참조하는 과거 기록도 있다.
    return lookups[bucket][value] ?? String(value);
  }
  return String(value);
}

// 화면에 쓰는 필드 이름. 정본을 여기 두어 화면마다 다르게 부르지 않게 한다.
export const FIELD_LABELS = {
  date: '날짜',
  amount: '금액',
  merchant: '가맹점',
  memo: '메모',
  category_id: '카테고리',
  payment_method_id: '결제수단',
  payment_style: '결제방식',
  status: '상태',
  name: '이름',
  major_type: '대분류',
};

export function fieldName(key) {
  return FIELD_LABELS[key] || key;
}

// 무엇을 어떻게 했는지 부르는 이름. 이력 화면과 스낵바가 같은 말을 쓰도록 여기 둔다.
export const TABLE_LABELS = {
  transactions: '거래',
  categories: '카테고리',
  payment_methods: '결제수단',
  installments: '할부',
  debts: '부채',
  accounts: '계좌',
  card_products: '카드',
  recurring_rules: '반복 규칙',
};

export const OP_LABELS = {
  INSERT: '추가', UPDATE: '수정', DELETE: '삭제', RESTORE: '복원',
};

export const ACTOR_LABELS = {
  user: '내 작업', system: '자동 처리', import: '불러오기',
};

// 작업 이름을 만든다.
//
// 라벨은 선택이라(#298) 대개 비어 있다. "방금 한 작업" 같은 말은 무엇을 되돌리는지
// 알려주지 않는다 — 되돌리기 버튼 옆에서는 그게 바로 위험이다. 라벨이 없으면
// 무엇을(table) 어떻게(op) 했는지로 이름을 짓는다.
export function describeAction({ label, tables, ops } = {}) {
  if (label) return label;

  const t = (tables || []).map((x) => TABLE_LABELS[x] || x);
  const o = (ops || []).map((x) => OP_LABELS[x] || x);
  // 여러 표·여러 조작이 한 작업에 섞이면 어느 하나로 부를 수 없다.
  if (t.length !== 1 || o.length !== 1) return t.length ? `${t.join('·')} 변경` : '방금 한 작업';
  return `${t[0]} ${o[0]}`;
}
