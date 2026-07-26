'use strict';

// FND-04(감사): 보안 헤더가 전무했다(CSP/HSTS/X-Frame-Options/X-Content-Type-Options/
// Referrer-Policy 전부 없음, X-Powered-By로 스택 노출). 새 의존성(Helmet) 없이
// 필요한 헤더만 직접 설정한다 — 이 앱이 필요로 하는 정책은 고정적이라 범용
// 미들웨어의 나머지 기능이 불필요하고, 의존성 표면을 늘리지 않는 편이 낫다.
//
// HSTS는 넣지 않는다 — 이 앱은 HTTPS를 쓰지 않는 로컬 전용 서버라(ARCHITECTURE.md
// 네트워크 바인딩 정책 참고) HTTP로만 서빙되는데 HSTS를 보내면 브라우저가 이후
// 같은 오리진에 대한 HTTPS 강제를 학습해 버려 오히려 접속 불가를 유발할 수 있다.
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"
  );
  next();
}

module.exports = { securityHeaders };
