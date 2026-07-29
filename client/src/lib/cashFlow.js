// 자금흐름 집계 — "수입이 어디로 갔나" 에 한 장으로 답하기 위한 데이터 변형.
//
// 수입 → 지출 대분류들 → 남은 돈. 대시보드의 개별 KPI 는 "얼마 벌었나" 와 "얼마 썼나" 를
// 따로 답할 뿐이라 그 사이의 배분을 보여주지 못한다. 배분을 보려면 수입 한 덩어리가
// 여러 갈래로 갈라지는 형태가 필요하다.
//
// 대분류 값의 정본은 src/constants.js(백엔드, CommonJS)의 MAJOR_TYPES 다.
// 프런트(ESM/Vite)와 빌드 도구가 분리되어 있어 값을 공유하지 못하므로 수동 동기화가
// 필요하다(#90). 여기서는 '수입' 과 '미분류' 를 뺀 지출 대분류 5종만 흐름으로 다룬다.

// 흐름의 순서. 화면에서 위에서 아래로 이 순서로 쌓인다.
// 고정 → 변동필수 → 부채 → 선택 → 저축. 재량이 적은 것부터 많은 것 순이며,
// 저축을 맨 아래 두는 것은 "쓰고 남은 것" 이 아니라 배분의 결과로 읽히게 하기 위함이다.
export const FLOW_TYPES = ['고정지출', '변동필수', '부채상환', '선택지출', '저축'];

// 남은 돈은 지출 대분류가 아니다. 따로 둔다.
export const REST_KEY = '남은 돈';

// 대분류 → 색 토큰. 이 맵은 자금흐름 차트의 밴드·노드 전용이다.
//
// hue 2개 원칙(액센트 블루 + 손실 레드)의 유일한 예외 구역이다. 이 차트는 여섯 갈래를
// 서로 구별하는 것 자체가 목적이라 단일 hue 농도 램프로는 인접한 밴드를 가를 수 없다.
//
// 대신 두 가지로 통제한다.
//   (1) 여섯 색을 비슷한 명도대에 묶어 한 가족으로 읽히게 한다
//   (2) 이 색은 차트 밖으로 나가지 않는다 — 목록·표·아이콘·배지에 쓰면 카테고리 색을
//       되살리는 것과 같아진다
//
// (2)를 코드로 강제할 수는 없으므로 접근 경로를 이 함수 하나로 좁혀 둔다. 다른 곳에서
// flowColor 를 import 하고 있다면 그것이 규칙 위반의 신호다.
const FLOW_COLOR = {
  '고정지출': 'var(--color-flow-fixed)',
  '변동필수': 'var(--color-flow-variable)',
  '부채상환': 'var(--color-flow-debt)',
  '선택지출': 'var(--color-flow-optional)',
  '저축': 'var(--color-flow-saving)',
  [REST_KEY]: 'var(--color-flow-rest)',
};

// 수입 소스 노드도 지출 카테고리가 아니므로 무채색이다.
export const SOURCE_COLOR = 'var(--color-flow-source)';

export function flowColor(key) {
  return FLOW_COLOR[key] || 'var(--color-flow-rest)';
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// rows: [{ major_type, total }] 형태. 대분류별 지출 합계.
// income: 같은 기간의 수입 합계.
//
// 반환은 차트 구현에 독립적인 형태로 둔다 — Sankey 로 그리든 100% 스택 바로 그리든
// 같은 데이터를 쓴다. 모바일에서는 좁은 폭에서 Sankey 가 읽히지 않아 스택 바로
// 치환하는데, 두 뷰가 서로 다른 집계를 쓰면 같은 화면에서 숫자가 어긋난다.
export function cashFlow(rows, income) {
  const totalIncome = Math.max(0, num(income));

  const byType = {};
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || r.major_type == null) continue;
    // 수입은 흐름의 출발점이지 갈래가 아니다. 미분류는 대분류로 승격시키지 않는다 —
    // 정체를 모르는 돈에 자리를 주면 "어디로 갔나" 의 답이 "모름" 이 되어버린다.
    if (!FLOW_TYPES.includes(r.major_type)) continue;
    byType[r.major_type] = (byType[r.major_type] || 0) + Math.max(0, num(r.total));
  }

  const flows = FLOW_TYPES
    .map((type) => ({ key: type, value: byType[type] || 0 }))
    .filter((f) => f.value > 0);

  const spent = flows.reduce((sum, f) => sum + f.value, 0);

  // 지출이 수입을 넘으면 "남은 돈" 은 음수가 아니라 0 이다. 음수 밴드는 그릴 수 없고,
  // 그릴 수 있더라도 "마이너스만큼의 돈이 어딘가로 흘렀다" 는 잘못된 상을 준다.
  // 초과분은 별도 필드로 넘겨 문구가 담당하게 한다.
  const rest = Math.max(0, totalIncome - spent);
  const overspent = Math.max(0, spent - totalIncome);

  const nodes = [...flows];
  if (rest > 0) nodes.push({ key: REST_KEY, value: rest });

  // 비율의 분모는 수입이 아니라 실제로 그려지는 총량이다. 지출이 수입을 넘긴 달에
  // 수입을 분모로 쓰면 합이 100% 를 넘어 스택 바가 넘쳐난다.
  const denominator = nodes.reduce((sum, n) => sum + n.value, 0);

  return {
    income: totalIncome,
    spent,
    rest,
    overspent,
    // 그릴 것이 없으면 빈 배열이다. 호출부가 길이로 빈 상태를 판정한다.
    nodes: nodes.map((n) => ({
      ...n,
      color: flowColor(n.key),
      share: denominator > 0 ? n.value / denominator : 0,
    })),
  };
}
