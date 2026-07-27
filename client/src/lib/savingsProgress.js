// 저축 상품 목표 진행률(#200).
//
// 스키마(savings_products)에는 진행률에 해당하는 컬럼이 없다. 데이터 구조를 바꾸지 않고
// start_date / maturity_date / monthly_contribution 만으로 프런트에서 파생한다.
//
// 목표 금액은 expected_payout(원금+이자)이 아니라 "월납입액 x 총 개월수"(원금)로 잡는다.
// 남은 금액에 이자를 섞으면 사용자가 앞으로 실제로 넣어야 할 돈과 어긋난다.
// 이자를 포함한 예상 수령액은 목록에 이미 별도 컬럼으로 있다.
//
// 날짜 계산에 Date 파싱을 쓰지 않고 'YYYY-MM-DD' 문자열을 직접 쪼갠다.
// 이 프로젝트는 과거에 toISOString() 의 UTC 기준 처리로 날짜가 하루 밀리는 버그를 냈다.

// goal-gradient effect(Kivetz et al. 2006) — 목표에 가까워질수록 동기가 강해진다.
// 큰 목표를 4등분해 구간마다 도달감을 반복 제공한다.
export const MILESTONES = [0.25, 0.5, 0.75];

function parseYMD(s) {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

// from 부터 to 까지 '완료된 개월수'. 일(day)이 아직 안 지났으면 그 달은 세지 않는다.
export function monthsBetween(fromYMD, toYMD) {
  const a = parseYMD(fromYMD);
  const b = parseYMD(toYMD);
  if (!a || !b) return null;
  let months = (b.y - a.y) * 12 + (b.m - a.m);
  if (b.d < a.d) months -= 1;
  return months;
}

export function savingsProgress(product, todayYMD) {
  const monthly = Number(product?.monthly_contribution) || 0;
  const total = monthsBetween(product?.start_date, product?.maturity_date);

  // 만기일이 없으면(선택 입력 컬럼이다) 총 개월수를 알 수 없어 진행률이 정의되지 않는다.
  // 화면에서는 진행바 대신 안내 문구를 띄운다.
  if (total === null || total <= 0 || monthly <= 0) {
    return { hasSchedule: false, totalMonths: 0, paidMonths: 0, goal: 0, contributed: 0,
             remaining: 0, ratio: 0, barPct: 0, milestone: null };
  }

  // 만기 처리된 상품은 날짜와 무관하게 목표를 채운 것으로 본다.
  const done = product?.status === '완료';
  const elapsed = monthsBetween(product.start_date, todayYMD);
  // 시작일 당일에 1회차를 납입한 것으로 센다. 총 회차를 넘지 않는다.
  const paidMonths = done ? total : Math.min(total, Math.max(0, (elapsed ?? 0) + 1));

  const goal = monthly * total;
  const contributed = monthly * paidMonths;
  const ratio = goal > 0 ? contributed / goal : 0;

  // 이미 지난 마일스톤 중 가장 높은 것. 아직 25% 전이면 null.
  let milestone = null;
  for (const m of MILESTONES) {
    if (ratio >= m) milestone = m;
  }

  return {
    hasSchedule: true,
    totalMonths: total,
    paidMonths,
    goal,
    contributed,
    remaining: Math.max(0, goal - contributed),
    ratio,
    barPct: Math.min(100, Math.max(0, Math.round(ratio * 100))),
    milestone,
  };
}
