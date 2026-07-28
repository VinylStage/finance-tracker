// 카테고리 대분류의 표시 규칙(아이콘 + 색상 토큰) 정본.
//
// 대분류 값 자체의 정본은 src/constants.js(백엔드, CommonJS)의 MAJOR_TYPES.
// 프런트(ESM/Vite)와 빌드 도구가 분리되어 있어 값을 공유하지 못하므로 수동 동기화 필요(#90).
//
// 색상만으로 대분류를 구분하면 적록색약(남성 약 8%)이 인지할 수 없어 WCAG SC 1.4.1 을
// 위반한다(#191). 그래서 색상 + 아이콘 + 텍스트 3중 인코딩을 쓴다. 아이콘은 화면에
// 텍스트 이름이 항상 함께 나오는 자리에서만 쓰이므로 aria-hidden 으로 감춘다 —
// 스크린리더가 "돼지 저금통"처럼 이모지 이름을 읽어봤자 잡음이다.
//
// 백엔드 MAJOR_TYPES 에는 '미분류'가 포함돼 있고 카드 임포트 등에서 실제로 들어올 수
// 있다. UI 상수(Settings.jsx 의 CATEGORY_TYPES)에는 6종만 있으므로 여기서 7번째로
// 받아준다. 그 밖의 값은 FALLBACK 으로 흘린다.

export const CATEGORY_STYLE = {
  '수입': { icon: '💵', color: 'text-cat-income' },
  '고정지출': { icon: '🏠', color: 'text-cat-fixed' },
  '변동필수': { icon: '🛒', color: 'text-cat-needs' },
  '부채상환': { icon: '🏦', color: 'text-cat-debt' },
  '선택지출': { icon: '🎬', color: 'text-cat-wants' },
  '저축': { icon: '🐷', color: 'text-cat-savings' },
  '미분류': { icon: '❓', color: 'text-ink-muted' },
};

const FALLBACK = { icon: '❓', color: 'text-ink-muted' };

export function categoryStyle(majorType) {
  return CATEGORY_STYLE[majorType] || FALLBACK;
}

// 수입/지출 금액의 부호를 색상 외 채널로도 구분한다(#191).
// 부호 문자(+/-)만으로는 스캔 속도가 느리고, 색상은 색약에서 무력하다.
export const AMOUNT_MARK = {
  income: { arrow: '▲', sign: '+' },
  expense: { arrow: '▼', sign: '-' },
};
