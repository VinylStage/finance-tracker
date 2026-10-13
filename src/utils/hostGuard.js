'use strict';

// FND(감사 M4): 서버가 요청의 Host 헤더를 검증하지 않아 DNS 리바인딩에 노출됐다.
// 이 앱은 루프백(127.0.0.1)에만 바인딩하지만, 공격자가 자기 도메인(evil.example)의
// DNS 를 127.0.0.1 로 재지정하면 피해자 브라우저가 그 도메인으로 로컬 서버에 접속해
// 자격증명 없는 API 를 그대로 호출할 수 있다(csrfGuard 의 same-origin 판정도 그
// 도메인 기준이라 통과한다). 방어는 "로컬에서 띄운 서버는 로컬 이름으로만 접근한다"
// 는 사실을 Host 허용목록으로 못박는 것이다.
//
// 상태변경(csrfGuard)뿐 아니라 모든 메서드에 적용한다 — 리바인딩은 GET 으로 데이터를
// 읽는 것만으로도 성립한다. 새 의존성은 쓰지 않는다(securityHeaders 와 같은 판단).

// 기본 허용: 루프백 이름들. 포트는 비교에서 제외한다.
const DEFAULT_HOSTS = ['127.0.0.1', 'localhost', '::1'];

// ALLOWED_HOSTS(쉼표 구분)로 추가 허용할 수 있다 — 예: LAN IP 로 바인딩(HOST=0.0.0.0)
// 하고 다른 기기에서 접속하는 경우. 기본 루프백은 항상 포함한다.
function buildAllowed(env = process.env) {
  const set = new Set(DEFAULT_HOSTS);
  for (const h of String(env.ALLOWED_HOSTS || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    set.add(h);
  }
  // 바인딩 주소가 구체적 호스트/IP 면(0.0.0.0·:: 같은 와일드카드 제외) 그 이름으로도
  // 접속하므로 허용한다.
  const host = String(env.HOST || '').trim();
  if (host && host !== '0.0.0.0' && host !== '::') set.add(host);
  return set;
}

// 'example.com:3000' → 'example.com', '[::1]:3000' → '::1', '127.0.0.1' → '127.0.0.1'
function hostnameOf(hostHeader) {
  if (!hostHeader) return '';
  const h = String(hostHeader);
  if (h.startsWith('[')) { // IPv6 리터럴
    const end = h.indexOf(']');
    return end > 0 ? h.slice(1, end) : h;
  }
  return h.split(':')[0];
}

function createHostGuard(env = process.env) {
  const allowed = buildAllowed(env);
  return function hostGuard(req, res, next) {
    const name = hostnameOf(req.headers && req.headers.host);
    if (allowed.has(name)) return next();
    return res.status(403).json({ error: '허용되지 않은 호스트에서의 요청입니다.' });
  };
}

// 기본 인스턴스(서버가 그대로 app.use 할 수 있게). 테스트는 createHostGuard 로
// 환경을 주입해 허용목록 구성을 검증한다.
const hostGuard = createHostGuard();

module.exports = { hostGuard, createHostGuard, hostnameOf, buildAllowed, DEFAULT_HOSTS };
