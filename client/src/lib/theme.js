// 테마(라이트/다크) 상태(#201).
//
// 기본값은 라이트다. 이슈 리서치에 따르면 금융 앱은 "익숙한 인터페이스를 통한 신뢰
// 유지"를 이유로 라이트를 기본으로 두는 경향이 있어, 다크는 옵트인으로 둔다.
//
// prefers-color-scheme 자동 추종은 넣지 않는다. "옵트인"이라는 인수기준과 어긋나고,
// 사용자가 켠 적 없는데 밤에 갑자기 바뀌는 동작이 되기 때문이다.
//
// 적용은 <html> 의 data-theme 속성으로 한다. CSS 가 :root[data-theme='dark'] 로
// 토큰만 덮어쓰므로 컴포넌트는 테마를 알 필요가 없다.

const KEY = 'ft.theme';
export const THEMES = ['light', 'dark'];
export const DEFAULT_THEME = 'light';

// 저장된 값이 오염됐거나(수동 편집, 구버전) 없으면 기본값으로 떨어뜨린다.
export function normalizeTheme(value) {
  return THEMES.includes(value) ? value : DEFAULT_THEME;
}

export function readTheme() {
  try {
    return normalizeTheme(window.localStorage.getItem(KEY));
  } catch {
    // 접근이 막힌 환경(사파리 프라이빗 등)에서도 화면은 떠야 한다.
    return DEFAULT_THEME;
  }
}

export function saveTheme(theme) {
  const next = normalizeTheme(theme);
  try {
    window.localStorage.setItem(KEY, next);
    return true;
  } catch {
    return false;
  }
}

export function toggleTheme(current) {
  return normalizeTheme(current) === 'dark' ? 'light' : 'dark';
}

// 라이트일 때 속성을 지우는 이유: 기본 팔레트가 곧 라이트이므로 표식이 필요 없고,
// data-theme='light' 를 남겨두면 나중에 라이트 전용 오버라이드가 생겼을 때
// 어느 쪽이 기본인지 헷갈린다.
export function applyTheme(theme, root) {
  const el = root || (typeof document !== 'undefined' ? document.documentElement : null);
  if (!el) return DEFAULT_THEME;
  const next = normalizeTheme(theme);
  if (next === 'dark') el.setAttribute('data-theme', 'dark');
  else el.removeAttribute('data-theme');
  return next;
}
