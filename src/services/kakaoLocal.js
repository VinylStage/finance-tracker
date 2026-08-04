'use strict';

const { fetchJson, maskSecrets } = require('../utils/http');
const { toMajorType, extractCategoryGroup } = require('./kakaoCategoryMap');

// 카카오 로컬 API 로 가맹점을 분류한다(#275).
//
// ─────────────────────────────────────────────────────────────────────────
// 이건 보조 기능이다
//
// **실패해도 입력을 막지 않는다.** 카테고리 자동제안이 안 되는 것과 거래를
// 저장 못 하는 것은 전혀 다른 문제다. 외부 API 는 실패하고, 쿼터는 소진되고,
// 키는 없을 수 있다 — 전부 정상 경로로 다룬다.
//
// 그래서 이 모듈의 함수는 **던지지 않는다.** 실패는 구조화된 값으로 돌려준다
// (kisService 가 "미활성화" 를 예외 대신 값으로 알리는 것과 같은 방침).
//
// ─────────────────────────────────────────────────────────────────────────
// 키가 없으면 꺼진다
//
// KIS_ENABLED 패턴을 따른다. 키가 없는 것은 오류가 아니라 **기능이 꺼진
// 상태**다. 앱은 그대로 동작해야 한다.

const KAKAO_SEARCH_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';

// 쿼터를 소진 전에 알 수 있어야 한다(인수 기준). 프로세스가 사는 동안의
// 호출 횟수를 센다 — 이 앱은 사용자가 열 때만 프로세스가 산다.
let callCount = 0;
let lastError = null;

function isEnabled() {
  return Boolean(process.env.KAKAO_REST_API_KEY);
}

function getStats() {
  return { enabled: isEnabled(), calls: callCount, lastError };
}

// 테스트가 상태를 초기화한다. 프로덕션 경로에서는 쓰지 않는다.
function resetStats() {
  callCount = 0;
  lastError = null;
}

/**
 * 가맹점명으로 카카오 로컬을 조회해 분류를 얻는다.
 *
 * **던지지 않는다.** 실패는 { ok: false, reason } 으로 돌려준다.
 *
 * @param {string} merchant
 * @returns {Promise<{ok: true, group: string|null, name: string|null, majorType: string}
 *                  | {ok: false, reason: 'disabled'|'invalid-input'|'not-found'|'error'}>}
 */
async function lookupMerchant(merchant) {
  if (!isEnabled()) return { ok: false, reason: 'disabled' };

  const query = typeof merchant === 'string' ? merchant.trim() : '';
  if (!query) return { ok: false, reason: 'invalid-input' };

  const url = `${KAKAO_SEARCH_URL}?query=${encodeURIComponent(query)}&size=1`;

  let body;
  try {
    callCount++;
    body = await fetchJson(url, {
      headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` },
    });
  } catch (e) {
    // 마스킹은 fetchJson 이 이미 하지만, 여기서 저장하는 값도 로그·응답으로
    // 흘러갈 수 있으므로 한 번 더 거른다.
    lastError = maskSecrets(String(e && e.message ? e.message : e));
    return { ok: false, reason: 'error' };
  }

  // **응답 형태를 신뢰하지 않는다.** documents 가 없거나 배열이 아닐 수 있다.
  const docs = body && Array.isArray(body.documents) ? body.documents : [];
  if (docs.length === 0) return { ok: false, reason: 'not-found' };

  const group = extractCategoryGroup(docs[0]);
  if (group === null) return { ok: false, reason: 'not-found' };

  return {
    ok: true,
    group,
    // 상세 분류는 있으면 남기고 없으면 null 이다. 표시용이라 없어도 된다.
    name: typeof docs[0].category_name === 'string' && docs[0].category_name
      ? docs[0].category_name
      : null,
    majorType: toMajorType(group),
  };
}

module.exports = {
  lookupMerchant, isEnabled, getStats, resetStats,
  KAKAO_SEARCH_URL,
};
