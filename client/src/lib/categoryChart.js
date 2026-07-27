// 카테고리별 지출 시각화 집계(#194).
//
// 파이차트 조각이 5~6개를 넘으면 각도 비교만으로 판독성이 급격히 떨어진다.
// 상위 5개만 조각으로 남기고 나머지는 '기타' 하나로 합친다.
//
// 5개 이하면 원본을 그대로 돌려준다 — 합칠 게 없는데 '기타'를 만들면
// 오히려 정보가 줄어든다. 즉 '기타'는 카테고리가 6개 이상일 때만 생긴다.
// 6개일 때 '기타'가 카테고리 1개만 담게 되는 건 의도된 동작이다(경계 일관성).

export const PALETTE = [
  '#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#3b82f6',
  '#a855f7', '#ec4899', '#14b8a6', '#f97316', '#84cc16',
];

export const OTHERS_LABEL = '기타';

const TOP_N = 5;

export function capTopCategories(rows, topN = TOP_N) {
  const list = Array.isArray(rows) ? rows.filter((r) => r && r.category != null) : [];
  // API 응답의 정렬을 신뢰하지 않는다. Top5 판정이 정렬에 직접 의존하므로
  // 여기서 내림차순을 보장한다.
  const sorted = [...list].sort((a, b) => Number(b.total || 0) - Number(a.total || 0));

  if (sorted.length <= topN) {
    return { slices: sorted, others: [], othersTotal: 0 };
  }

  const head = sorted.slice(0, topN);
  const others = sorted.slice(topN);
  const othersTotal = others.reduce((sum, r) => sum + Number(r.total || 0), 0);

  return {
    slices: [...head, { category: OTHERS_LABEL, total: othersTotal, isOthers: true }],
    others,
    othersTotal,
  };
}

export function shareOf(total, grandTotal) {
  const g = Number(grandTotal) || 0;
  if (g <= 0) return 0;
  return (Number(total) || 0) / g;
}
