'use strict';

const { fetchJson, maskSecrets } = require('../utils/http');

/**
 * 한국수출입은행 환율 API 연동 서비스 모듈
 */

/**
 * 수출입은행 API 키가 없거나 비어있을 경우 에러를 던진다.
 * @throws {Error} API 키가 없을 경우 발생
 */
function validateEximApiKey() {
  if (!process.env.EXIM_API_KEY) {
    throw new Error('EXIM_API_KEY is not set in environment variables');
  }
}

/**
 * 현재 환율 정보를 조회한다.
 * @returns {Promise<Array>} 환율 데이터 배열
 * @throws {Error} API 호출 실패 또는 데이터 없음
 */
async function getExchangeRates() {
  validateEximApiKey();

  const url = `https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=${process.env.EXIM_API_KEY}&data=AP01`;

  try {
    // fetchJson 이 타임아웃(무한 대기 방지)과 시크릿 마스킹을 처리한다
    const data = await fetchJson(url);

    // 응답이 성공적이지 않거나 데이터가 없을 경우 에러
    if (!data || !Array.isArray(data)) {
      throw new Error('EXIM API returned invalid data');
    }

    return data;
  } catch (e) {
    // fetchJson 에서 온 오류는 이미 마스킹됨. 그 외 메시지도 방어적으로 마스킹한다.
    throw new Error(maskSecrets(`Failed to fetch exchange rates from EXIM API: ${e.message}`));
  }
}

module.exports = { getExchangeRates };