// 카테고리 대분류의 표시 규칙(아이콘 + 색상 토큰) 정본.
//
// 대분류 값 자체의 정본은 src/constants.js(백엔드, CommonJS)의 MAJOR_TYPES.
// 프런트(ESM/Vite)와 빌드 도구가 분리되어 있어 값을 공유하지 못하므로 수동 동기화 필요(#90).
//
// 색상만으로 대분류를 구분하면 적록색약(남성 약 8%)이 인지할 수 없어 WCAG SC 1.4.1 을
// 위반한다(#191). 그래서 아이콘 + 텍스트 이중 인코딩을 쓴다. 아이콘은 화면에
// 텍스트 이름이 항상 함께 나오는 자리에서만 쓰이므로 aria-hidden 으로 감춘다 —
// 스크린리더가 "돼지 저금통"처럼 이모지 이름을 읽어봤자 잡음이다.
//
// 이모지를 쓰지 않는 이유는 크기·정렬·굵기를 통제할 수 없고 OS 마다 다르게 렌더되기
// 때문이다. 카테고리 구분이 아이콘 모양 하나에 걸리므로 실루엣이 흔들리면 안 된다.
//
// 카테고리에 색을 배정하지 않는다. 카테고리는 사용자가 계속 추가할 수 있어 개수가
// 늘어나고, 색으로 구분하면 팔레트가 반드시 바닥난다. 예전에는 대분류마다 hue 를
// 하나씩 배정해 한 화면에 색이 여섯 개 떠 있었고, 그 색들이 공유하는 축이 없어
// 각자 따로 놀았다. 구분은 아이콘 모양이 맡고 색은 하나로 통일한다.
//
// 카테고리 구분이 아이콘 모양 하나에 걸리므로, 그 아이콘 색이 화면에서 가장 약한
// 요소가 되면 안 된다. caption 을 흰 카드뿐 아니라 페이지·가라앉은 면 위에서도
// 4.5:1 을 넘도록 잡아둔 이유가 이것이다(index.css).
const CATEGORY_COLOR = 'text-caption';

// 백엔드 MAJOR_TYPES 에는 '미분류'가 포함돼 있고 카드 임포트 등에서 실제로 들어올 수
// 있다. UI 상수(Settings.jsx 의 CATEGORY_TYPES)에는 6종만 있으므로 여기서 7번째로
// 받아준다. 그 밖의 값은 FALLBACK 으로 흘린다.
const CATEGORY_ICON = {
  '수입': 'payments',
  '고정지출': 'home',
  '변동필수': 'shopping_basket',
  '부채상환': 'account_balance',
  '선택지출': 'movie',
  '저축': 'savings',
  '미분류': 'category',
};

const FALLBACK_ICON = 'category';

export const CATEGORY_STYLE = Object.fromEntries(
  Object.entries(CATEGORY_ICON).map(([type, icon]) => [type, { icon, color: CATEGORY_COLOR }])
);

export function categoryStyle(majorType) {
  return {
    icon: CATEGORY_ICON[majorType] ?? FALLBACK_ICON,
    color: CATEGORY_COLOR,
  };
}

// 수입/지출 금액의 부호를 색상 외 채널로도 구분한다(#191).
// 부호 문자(+/-)만으로는 스캔 속도가 느리고, 색상은 색약에서 무력하다.
export const AMOUNT_MARK = {
  income: { arrow: '▲', sign: '+' },
  expense: { arrow: '▼', sign: '-' },
};
