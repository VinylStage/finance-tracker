// .env 의 KIS_ENABLED 를 실제로 읽는다(기존에는 false 하드코딩이라 환경변수가 무동작이었다).
const KIS_ENABLED = process.env.KIS_ENABLED === 'true';

/**
 * KIS API를 통해 주식 가격을 조회합니다.
 * @param {string} ticker - 주식 티커 심볼
 * @returns {Promise<Object>} 주식 가격 정보 또는 에러 정보
 */
async function getStockPrice(ticker) {
  // KIS API 실연동은 미구현이다. OAuth2/JWT 인증과 엔드포인트
  // (예: https://openapi.api.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/price)
  // 확정이 필요하며, 실연동은 별도 작업으로 다룬다(#92 기능 확장 목록 참조).
  // KIS_ENABLED 는 실연동 도입 시 게이트로 쓰기 위해 읽어둔다.
  if (!KIS_ENABLED) {
    throw new Error('KIS API is not yet enabled');
  }
  // 플래그가 켜져도 실제 구현이 없으므로 미구현임을 명확히 알린다.
  return { enabled: false, message: 'KIS API integration not yet implemented' };
}

module.exports = {
  getStockPrice,
};