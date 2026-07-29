// 1차 내비게이션 정본(#188).
//
// 기존에는 10개 화면이 전부 같은 위계로 가로 스크롤 탭 바에 나열돼 있었다.
// NN/g 등의 IA 리서치가 지적하듯 7~8개를 넘는 플랫 탭은 모바일에서 관리가 안 된다.
// 5개 그룹으로 묶고 하위 화면은 서브탭(자식 경로)으로 내렸다.
// 가이드는 어느 그룹에도 속하지 않고 헤더의 ? 버튼으로 분리한다.

// icon 은 이모지가 아니라 인라인 SVG 의 이름이다(components/icons/paths.js 의 키).
// 이모지는 크기·정렬·굵기를 통제할 수 없고 OS 마다 다르게 렌더된다. 탭바처럼
// 아이콘이 상태(활성/비활성)를 함께 나타내는 자리에서는 그 편차가 그대로 드러난다.
export const NAV_GROUPS = [
  { id: 'home', label: '홈', path: '/', icon: 'space_dashboard' },
  { id: 'transactions', label: '거래', path: '/transactions', icon: 'receipt_long' },
  {
    id: 'analysis',
    label: '분석',
    path: '/analysis',
    icon: 'analytics',
    children: [
      { label: '기간비교', path: '/analysis/comparison' },
      { label: '시뮬레이터', path: '/analysis/simulator' },
    ],
  },
  {
    id: 'assets',
    label: '자산·부채',
    path: '/assets',
    icon: 'account_balance',
    children: [
      { label: '할부', path: '/assets/installments' },
      { label: '리볼빙', path: '/assets/revolving' },
      { label: '부채', path: '/assets/debts' },
      { label: '적금', path: '/assets/savings' },
    ],
  },
  { id: 'settings', label: '설정', path: '/settings', icon: 'settings' },
];

// 모바일 하단 탭바에는 핵심 3개만 상시 노출하고 나머지는 '더보기'로 묶는다(#188 AC).
export const MOBILE_PRIMARY = ['home', 'transactions', 'analysis'];

// 현재 경로가 속한 1차 그룹을 돌려준다.
// '/' 는 모든 경로의 접두사라 startsWith 로 판정하면 전부 '홈'이 되므로 따로 처리한다.
// 자식 경로는 '/analysis/comparison' 처럼 구분자까지 포함해 비교해야
// '/analysis-x' 같은 경로가 잘못 매칭되지 않는다.
export function groupForPath(path) {
  if (path === '/') return NAV_GROUPS[0];
  return (
    NAV_GROUPS.find(
      (g) => g.path !== '/' && (path === g.path || path.startsWith(g.path + '/'))
    ) || null
  );
}
