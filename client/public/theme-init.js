// 다크모드 첫 프레임 깜빡임 방지(#201, #228).
//
// React 마운트 후에 테마를 적용하면 다크 사용자에게 흰 화면이 한 번 번쩍인다.
// 그래서 HTML 파싱 중에 data-theme 을 먼저 찍어야 한다.
//
// 인라인 스크립트가 아니라 별도 파일인 이유: CSP 가 script-src 'self' 라
// 인라인은 차단된다(#228). 'unsafe-inline' 을 열면 앱 전체의 XSS 방어가
// 무너지고, CSP 해시는 이 파일이 한 글자만 바뀌어도 조용히 깨진다.
// 같은 오리진의 클래식 스크립트는 CSP 를 만족하면서 파서를 막고 즉시 실행된다.
//
// 이 파일은 번들러를 거치지 않고 그대로 복사된다(vite publicDir).
// import 를 쓸 수 없어 저장소 키가 client/src/lib/theme.js 와 중복된다.
// 키를 바꾸면 양쪽을 함께 고쳐야 한다 — test/theme-init.test.js 가 불일치를 잡는다.
(function () {
  try {
    if (window.localStorage.getItem('ft.theme') === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch (e) {
    // 저장소 접근이 막힌 환경에서는 기본값(라이트)으로 둔다.
  }
})();
