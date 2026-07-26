'use strict';

// FND-01(감사): CSRF 토큰·Origin/Referer 검증이 전무해 인증 없는 API가 브라우저를
// 경유한 임의 웹사이트로부터 그대로 실행될 수 있었다(예: 악성 <form> POST로 전체
// 거래내역 삭제). 상태 변경 요청(POST/PUT/DELETE/PATCH)에 한해 요청 출처를 검증한다.
//
// Sec-Fetch-Site(Fetch Metadata)를 우선 신뢰한다 — 현재 주요 브라우저가 모든 요청에
// 붙이며, 개발 환경의 vite 프록시(5173→3000)를 거쳐도 브라우저 기준 same-origin으로
// 정확히 반영된다. 이 헤더가 없으면(구형 브라우저 또는 브라우저가 아닌 클라이언트)
// Origin 헤더로 폴백한다. 둘 다 없으면(curl/서버 간 호출/테스트 스위트 등 브라우저가
// 아닌 요청) 통과시킨다 — CSRF는 브라우저가 자격증명을 자동 첨부하며 매개하는
// 공격이므로 브라우저 신호가 전혀 없는 요청은 이 공격 범주에 해당하지 않는다.
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

function csrfGuard(req, res, next) {
  if (!STATE_CHANGING_METHODS.has(req.method)) return next();

  const secFetchSite = req.get('Sec-Fetch-Site');
  if (secFetchSite) {
    if (secFetchSite === 'same-origin' || secFetchSite === 'none') return next();
    return res.status(403).json({ error: 'Cross-site request blocked' });
  }

  const origin = req.get('Origin');
  if (origin) {
    const selfOrigin = `${req.protocol}://${req.get('host')}`;
    if (origin === selfOrigin) return next();
    return res.status(403).json({ error: 'Cross-origin request blocked' });
  }

  return next();
}

module.exports = { csrfGuard };
