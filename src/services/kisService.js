const KIS_ENABLED = false;

/**
 * KIS API를 통해 주식 가격을 조회합니다.
 * @param {string} ticker - 주식 티커 심볼
 * @returns {Promise<Object>} 주식 가격 정보 또는 에러 정보
 */
async function getStockPrice(ticker) {
  if (!KIS_ENABLED) {
    // TODO: 확인 필요 (KIS API 실제 연동 시 인증/엔드포인트 확정 필요)
    throw new Error('KIS API is not yet enabled');
  }
  
  // 실제 KIS API 호출 로직이 여기에 위치해야 합니다.
  // 예시 URL: https://openapi.api.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/price
  // 인증 흐름: OAuth 2.0 / JWT 토큰 필요
  
  return { enabled: false, message: 'KIS API integration not yet enabled' };
}

module.exports = {
  getStockPrice,
};