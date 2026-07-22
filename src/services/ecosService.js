'use strict';

/**
 * 한국은행 ECOS API에서 기준금리 정보를 가져오는 서비스 모듈
 */

/**
 * ECOS API 키가 없거나 비어있을 경우 에러를 던진다.
 * @throws {Error} API 키가 없을 경우 발생
 */
function validateEcosApiKey() {
  if (!process.env.ECOS_API_KEY) {
    throw new Error('ECOS_API_KEY is not set in environment variables');
  }
}

/**
 * 기준금리를 조회한다.
 * @param {string} date - 조회할 날짜 (YYYYMMDD 포맷)
 * @returns {Promise<number>} 기준금리 값
 * @throws {Error} API 호출 실패 또는 데이터 없음
 */
async function getBaseRate(date) {
  validateEcosApiKey();

  const url = `https://ecos.bok.or.kr/api/StatisticSearch/${process.env.ECOS_API_KEY}/json/kr/1/1/028Y001/DD/${date}`;

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`ECOS API request failed with status ${response.status}`);
    }

    const data = await response.json();
    
    // 응답이 성공적이지 않거나 데이터가 없을 경우 에러
    if (!data || !data.STATISTIC_SEARCH || !data.STATISTIC_SEARCH.DATA || data.STATISTIC_SEARCH.DATA.length === 0) {
      throw new Error('ECOS API returned no data');
    }

    // 기준금리 데이터는 배열의 첫 번째 요소에 있어야 함
    const baseRate = data.STATISTIC_SEARCH.DATA[0].DATA_VALUE;

    if (baseRate === undefined || baseRate === null) {
      throw new Error('Base rate value is missing in API response');
    }

    return Number(baseRate);
  } catch (e) {
    if (e instanceof Error && e.message.includes('ECOS API')) {
      throw e;
    } else {
      throw new Error(`Failed to fetch base rate from ECOS API: ${e.message}`);
    }
  }
}

module.exports = { getBaseRate };