// 카테고리별 지출 시각화 집계(#194).
//
// 파이차트 조각이 5~6개를 넘으면 각도 비교만으로 판독성이 급격히 떨어진다.
// 상위 5개만 조각으로 남기고 나머지는 '기타' 하나로 합친다.
//
// 5개 이하면 원본을 그대로 돌려준다 — 합칠 게 없는데 '기타'를 만들면
// 오히려 정보가 줄어든다. 즉 '기타'는 카테고리가 6개 이상일 때만 생긴다.
// 6개일 때 '기타'가 카테고리 1개만 담게 되는 건 의도된 동작이다(경계 일관성).

// 카테고리에는 색을 배정하지 않는다. 카테고리는 사용자가 계속 추가할 수 있어
// 개수가 늘어나고, 색으로 구분하면 팔레트가 반드시 바닥난다. 무지개 팔레트가
// 한 화면에 hue 를 여섯 개 이상 뿌리던 것이 "색이 안 어울린다" 의 실제 원인이었다.
//
// 파이 조각은 액센트 한 색의 농도 램프로 간다. 조각이 크기순으로 정렬돼 있으므로
// 농도가 순위를 따라가고, 색 자체는 카테고리의 정체성이 아니라 순서만 나타낸다.
// 히트맵과 같은 램프를 공유한다 — 둘 다 "액센트 한 색의 농도" 라는 같은 규칙이다.
//
// 조각의 의미는 툴팁의 카테고리명과 랭킹 뷰가 전달하므로 색 단독 전달이 아니다.
export const SLICE_RAMP = [
  'var(--color-heat-4)',
  'var(--color-brand-fill)',
  'var(--color-heat-3)',
  'var(--color-brand-tint-strong)',
  'var(--color-brand-tint)',
];

// '기타' 는 카테고리가 아니라 묶음이므로 램프 밖 무채색으로 뺀다.
export const OTHERS_COLOR = 'var(--color-flow-rest)';

export function sliceColor(index, isOthers) {
  if (isOthers) return OTHERS_COLOR;
  return SLICE_RAMP[Math.min(index, SLICE_RAMP.length - 1)];
}

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
