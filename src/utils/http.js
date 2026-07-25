'use strict';

const DEFAULT_TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS) || 10000;

// 로그/에러 메시지에서 알려진 시크릿 값을 마스킹한다.
// 외부 API 키가 URL(경로/쿼리)에 실리므로, fetch 실패 메시지에 URL이 섞여 나올 때 키 유출을 막는다.
const SECRET_ENV_KEYS = ['ECOS_API_KEY', 'EXIM_API_KEY', 'KIS_APP_KEY', 'KIS_APP_SECRET'];
function maskSecrets(s) {
  let out = String(s);
  for (const k of SECRET_ENV_KEYS) {
    const v = process.env[k];
    if (v) out = out.split(v).join('***');
  }
  return out;
}

// 타임아웃이 걸린 fetch + JSON 파싱. 실패 메시지는 마스킹한다.
async function fetchJson(url, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
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
