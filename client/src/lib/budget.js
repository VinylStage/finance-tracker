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
    return { level: 'normal', ratio: 0, barPct: 0, remaining: 0, over: 0 };
  }

  const ratio = used / budget;
  const level = ratio > 1 ? 'over' : ratio >= CAUTION_AT ? 'caution' : 'normal';

  return {
    level,
    ratio,
    // 막대는 100% 를 넘지 않는다. 초과분은 색과 문구로 알린다.
    barPct: Math.min(100, Math.max(0, Math.round(ratio * 100))),
    remaining: Math.max(0, budget - used),
    over: Math.max(0, used - budget),
  };
}

// 단계별 색상 토큰(#190). 컴포넌트가 조건식을 다시 쓰지 않도록 여기서 묶는다.
export const BUDGET_TONE = {
  normal: { bar: 'bg-accent-bar', text: 'text-ink-muted' },
  caution: { bar: 'bg-warning-bar', text: 'text-warning' },
  over: { bar: 'bg-expense-bar', text: 'text-expense' },
};

// fmt 는 금액 포매터를 주입받는다(Dashboard 의 fmt 를 그대로 쓰기 위함).
export function budgetLabel(status, fmt) {
  if (status.level === 'over') return `${fmt(status.over)} 초과`;
  if (status.level === 'caution') return `${fmt(status.remaining)} 남음 (얼마 안 남음)`;
  return `${fmt(status.remaining)} 남음`;
}
