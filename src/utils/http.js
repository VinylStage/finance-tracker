'use strict';

const DEFAULT_TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS) || 10000;

// 로그/에러 메시지에서 알려진 시크릿 값을 마스킹한다.
// 외부 API 키가 URL(경로/쿼리)에 실리므로, fetch 실패 메시지에 URL이 섞여 나올 때 키 유출을 막는다.
// 카카오는 키를 URL 이 아니라 Authorization 헤더에 싣지만(#275), 헤더도 에러
// 메시지에 섞여 나올 수 있으므로 같이 마스킹한다. 목록에서 빠지면 그 키만
// 조용히 노출된다.
const SECRET_ENV_KEYS = ['ECOS_API_KEY', 'EXIM_API_KEY', 'KIS_APP_KEY', 'KIS_APP_SECRET', 'KAKAO_REST_API_KEY'];
function maskSecrets(s) {
  let out = String(s);
  for (const k of SECRET_ENV_KEYS) {
    const v = process.env[k];
    if (v) out = out.split(v).join('***');
  }
  return out;
}

// 타임아웃이 걸린 fetch + JSON 파싱. 실패 메시지는 마스킹한다.
//
// headers 는 선택이다. 키를 URL 이 아니라 헤더로 받는 API 가 있다(카카오
// 로컬, #275). 안 넘기면 기존 호출부의 동작이 그대로다.
async function fetchJson(url, { timeout = DEFAULT_TIMEOUT_MS, headers } = {}) {
  let res;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(timeout),
      ...(headers ? { headers } : {}),
    });
  } catch (e) {
    if (e && e.name === 'TimeoutError') {
      throw new Error(`외부 API 응답 시간 초과 (${timeout}ms)`);
    }
    throw new Error(maskSecrets(`외부 API 요청 실패: ${e.message}`));
  }
  if (!res.ok) {
    throw new Error(`외부 API 응답 오류: HTTP ${res.status}`);
  }
  return res.json();
}

module.exports = { fetchJson, maskSecrets, DEFAULT_TIMEOUT_MS };
