// 예산 소진율 3단계 프레이밍(#193).
//
// 프로스펙트 이론(Kahneman & Tversky)에 따르면 "얼마 남았다"(자원 프레이밍)와
// "얼마 초과했다"(손실 프레이밍)는 서로 다른 심리적 반응을 유도한다. 기존에는
// 초과 여부만 2색으로 구분해서, 예산을 다 쓰기 전에 개입할 여지가 없었다.
//
// 경계 정의:
//   ratio <  0.8        → 'normal'   중립.  "OO원 남음"
//   0.8 <= ratio <= 1.0 → 'caution'  주의.  "OO원 남음 (얼마 안 남음)"
//   ratio >  1.0        → 'over'     손실.  "OO원 초과"
//
// 소진율 100.0% 는 'over' 가 아니라 'caution' 이다 — 아직 초과하지 않았기 때문이다.
// 경계를 어느 쪽에 붙이느냐가 사용자에게 보이는 문구를 바꾸므로 여기 명시해 둔다.

const CAUTION_AT = 0.8;

export function budgetStatus(spent, monthlyBudget) {
  const budget = Number(monthlyBudget) || 0;
  const used = Number(spent) || 0;

  // 예산이 0 이하면 소진율 자체를 정의할 수 없다(0 으로 나누면 Infinity/NaN).
  // 막대를 비우고 중립으로 둔다.
  if (budget <= 0) {
    return { level: 'normal', ratio: 0, barPct: 0, remaining: 0, over: 0, overRatio: 0 };
  }

  const ratio = used / budget;
  const level = ratio > 1 ? 'over' : ratio >= CAUTION_AT ? 'caution' : 'normal';

  return {
    level,
    ratio,
    // 막대 본체는 100% 를 넘지 않는다. 초과분은 막대 밖 별도 세그먼트로 나간다.
    barPct: Math.min(100, Math.max(0, Math.round(ratio * 100))),
    remaining: Math.max(0, budget - used),
    over: Math.max(0, used - budget),
    // 초과분이 예산 대비 몇 배인지. 초과 세그먼트의 길이를 여기에 비례시킨다.
    overRatio: Math.max(0, ratio - 1),
  };
}

// 임계 눈금 위치. 막대 위 80% 지점에 세로선을 그어 "얼마 남았는지" 의 기준선을
// 시각화한다. 이 선은 애니메이션하지 않는다 — 기준선은 처음부터 고정돼 있어야
// 판단의 근거로 쓰인다.
export const CAUTION_TICK_PCT = CAUTION_AT * 100;

// 초과 세그먼트의 픽셀 폭. 막대를 100% 에서 잘라버리면 얼마나 넘었는지 알 수 없어
// 초과분을 막대 밖으로 빼내는데, 그 길이를 고정하면 "넘쳤다" 는 사실만 남고
// "얼마나" 가 다시 사라진다. 그래서 초과율에 비례시키되 상한을 둔다 —
// 예산의 50% 를 넘게 쓴 경우까지만 길이로 구분하고, 그 위는 문구가 담당한다.
const OVERFLOW_MAX_PX = 44;
const OVERFLOW_MIN_PX = 8;
const OVERFLOW_SATURATE_AT = 0.5;

export function overflowWidthPx(status) {
  if (!status || status.overRatio <= 0) return 0;
  const t = Math.min(status.overRatio, OVERFLOW_SATURATE_AT) / OVERFLOW_SATURATE_AT;
  return Math.round(OVERFLOW_MIN_PX + t * (OVERFLOW_MAX_PX - OVERFLOW_MIN_PX));
}

// 단계별 색상 토큰. 컴포넌트가 조건식을 다시 쓰지 않도록 여기서 묶는다.
//
// 정상 단계는 액센트다. 액센트를 버튼에 쓰지 않는다는 규칙과 충돌하지 않는다 —
// 그 규칙은 큰 면적의 채색 덩어리를 막는 것이고, 예산 막대는 데이터를 나타내는
// 얇은 요소라 액센트가 배정되는 자리다(수입·차트·선택 상태와 같은 부류).
//
// 주의 단계는 warn(레드의 옅은 단계)이다. pending(앰버)을 쓰지 않는다 —
// "아직 안 쓴 돈" 과 "너무 많이 쓴 돈" 이 같은 색이 되면 구별이 사라진다.
export const BUDGET_TONE = {
  normal: { bar: 'bg-brand-fill', text: 'text-body' },
  caution: { bar: 'bg-warn-fill', text: 'text-warn-text' },
  over: { bar: 'bg-loss-fill', text: 'text-loss-text' },
};

// 색상 단독으로 상태를 전달하지 않기 위한 아이콘 채널(WCAG SC 1.4.1).
// 정상 단계에는 아이콘을 붙이지 않는다 — 붙일 정보가 없다.
export const BUDGET_MARK = {
  normal: null,
  caution: '!',
  over: '!!',
};

// fmt 는 금액 포매터를 주입받는다(Dashboard 의 fmt 를 그대로 쓰기 위함).
//
// 남은 금액을 앞에 두고 상태는 명사로 뒤에 붙인다. 사람은 비율보다 금액으로
// 판단하므로 퍼센트는 보조로 내린다.
export function budgetLabel(status, fmt) {
  if (status.level === 'over') return `${fmt(status.over)} 초과`;
  if (status.level === 'caution') return `${fmt(status.remaining)} 남음 · 주의`;
  return `${fmt(status.remaining)} 남음`;
}
