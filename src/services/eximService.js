'use strict';

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
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`EXIM API request failed with status ${response.status}`);
    }

    const data = await response.json();
    
    // 응답이 성공적이지 않거나 데이터가 없을 경우 에러
    if (!data || !Array.isArray(data)) {
      throw new Error('EXIM API returned invalid data');
    }

    return data;
  } catch (e) {
    if (e instanceof Error && e.message.includes('EXIM API')) {
      throw e;
    } else {
      throw new Error(`Failed to fetch exchange rates from EXIM API: ${e.message}`);
    }
  }
}

module.exports = { getExchangeRates };