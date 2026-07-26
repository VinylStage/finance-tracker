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
  // FND-18(감사): 여기서 던지던 예외를 라우트(stocks.js)가 "모든 에러 =
  // 미활성화"로 뭉뚱그려 삼켜(로깅도 없이) 진짜 예상 못한 에러까지 같이
  // 가려버렸다. "미활성화"는 예외 상황이 아니라 기능 플래그의 정상 상태이므로
  // 예외 대신 구조화된 값으로 알린다 — 아래 KIS_ENABLED=true 분기와 동일한
  // { enabled: false, message } 형태라 라우트의 기존 처리와 그대로 맞는다.
  if (!KIS_ENABLED) {
    return { enabled: false, message: 'KIS API is not yet enabled' };
  }
  // 플래그가 켜져도 실제 구현이 없으므로 미구현임을 명확히 알린다.
  return { enabled: false, message: 'KIS API integration not yet implemented' };
}

module.exports = {
  getStockPrice,
};