// 일별 지출 강도 히트맵의 계산 유틸.
//
// 색상 단독으로 정보를 전달하지 않기 위한 아이콘 채널(WCAG SC 1.4.1).
// 사용자마다 예산 규모가 다르므로, 절대 금액이 아닌 상대적인 기준선을 사용한다.
// 이 기준선은 월 예산을 해당 월의 일수로 나눈 값이다.

export function dailyBasis(monthlyBudgetTotal, daysInMonth, recentDailyAverage) {
  const budget = Number(monthlyBudgetTotal) || 0;
  const days = Number(daysInMonth) || 0;
  const fallback = Number(recentDailyAverage) || 0;

  // 예산 또는 일수를 정의할 수 없으면 최근 폴백값을 사용한다.
  if (budget <= 0 || days <= 0) {
    return fallback <= 0 ? 0 : fallback;
  }

  return budget / days;
}

// 지출 강도는 기준선 대비 배수로 표현한다.
// 이 배수에 따라 0~4 단계로 분류한다.
export function heatLevel(dayAmount, basis) {
  const amount = Number(dayAmount) || 0;
  const base = Number(basis) || 0;

  // 기준선을 정의할 수 없으면 색을 칠하지 않는다.
  if (base <= 0) return 0;

  // 경계는 전부 이하(<=)로, 어느 쪽에 붙는지가 화면에 보이는 색을 바꾼다.
  if (amount <= base * 0.5) return 1;
  if (amount <= base) return 2;
  if (amount <= base * 2) return 3;
  return 4;
}

// 0단계: 무지출
// 1단계: 기준의 0.5배 이하
// 2단계: 기준 이하
// 3단계: 기준의 2배 이하
// 4단계: 기준의 2배 초과
export const HEAT_CLASS = [
  'border border-line',
  'bg-heat-1 text-body',
  'bg-heat-2 text-ink',
  'bg-heat-3 text-[var(--color-heat-3-on)]',
  'bg-heat-4 text-[var(--color-heat-4-on)]'
];

export function heatClass(dayAmount, basis) {
  return HEAT_CLASS[heatLevel(dayAmount, basis)];
}

export function heatLabel(dayAmount, basis) {
  const amount = Number(dayAmount) || 0;
  const base = Number(basis) || 0;

  if (amount <= 0) return '지출 없음';

  // 배수는 소수점 한 자리까지 표기한다.
  const ratio = amount / base;
  return `기준의 ${ratio.toFixed(1)}배`;
}
