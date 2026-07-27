// 거래 빠른입력 보조 계산(#196).
//
// 두 가지를 다룬다.
//  1. 카테고리 선택 시 보여줄 이번달 잔여예산 — mental accounting 을 입력 시점에 체감시킨다.
//  2. 모달 포커스 트랩의 다음 포커스 인덱스 — DOM 없이 계산만 떼어내 테스트 가능하게 했다.

// 예산 소진 단계. #193 의 budgetStatus 와 같은 경계(80%/100%)를 쓴다.
// 입력 폼에서도 대시보드와 같은 기준으로 보여야 사용자가 두 화면을 오가며 혼란스럽지 않다.
const CAUTION_AT = 0.8;

// category: /api/categories 의 한 행({ name, monthly_budget, major_type })
// spentByCategory: { [카테고리명]: 이번달 지출합 }
export function remainingBudget(category, spentByCategory) {
  const budget = Number(category?.monthly_budget) || 0;

  // 수입 카테고리에는 예산 개념이 없다. 예산 미설정(0)도 표시할 게 없다.
  if (!category || category.major_type === '수입' || budget <= 0) {
    return { show: false, budget: 0, spent: 0, remaining: 0, over: 0, level: 'none' };
  }

  const spent = Number(spentByCategory?.[category.name]) || 0;
  const ratio = spent / budget;
  const level = ratio > 1 ? 'over' : ratio >= CAUTION_AT ? 'caution' : 'normal';

  return {
    show: true,
    budget,
    spent,
    remaining: Math.max(0, budget - spent),
    over: Math.max(0, spent - budget),
    level,
  };
}

// 배열을 카테고리명 → 합계 맵으로 바꾼다.
// /api/transactions/summary/category-breakdown 응답이 [{ category, total }] 형태다.
export function toSpentMap(rows) {
  const map = {};
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    if (!r || r.category == null) return;
    map[r.category] = (map[r.category] || 0) + (Number(r.total) || 0);
  });
  return map;
}

// 포커스 트랩의 다음 인덱스. Tab 은 앞으로, Shift+Tab 은 뒤로 돌며 양끝에서 순환한다.
// 순환이 없으면 Tab 이 모달 밖으로 새어나가 배경 요소에 포커스가 간다.
export function trapIndex(current, count, backwards) {
  if (!Number.isFinite(count) || count <= 0) return -1;
  // 컨테이너 자체에 포커스가 있는 경우(current === -1) Tab 은 첫 요소, Shift+Tab 은 마지막.
  if (current < 0) return backwards ? count - 1 : 0;
  const next = backwards ? current - 1 : current + 1;
  return ((next % count) + count) % count;
}
