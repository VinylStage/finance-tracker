// 서버 기동은 공용 헬퍼가 맡는다(#379). 조기 종료를 즉시 감지한다.
// FND-18(감사): stocks.js가 DB 오류든 프로그래밍 오류든 전부 "미활성화"로
// 보고하고 로깅조차 안 했다(serverError 미사용). kisService.getStockPrice가
// "미활성화" 상태를 더 이상 예외로 던지지 않고 구조화된 값으로 돌려주도록
// 바꿔, 이 라우트의 catch는 이제 진짜 예상 못한 에러만 만나며 serverError()로
// 로그를 남긴다. 여기서는 (구현 미완성 상태에서) 유일하게 실제로 도달 가능한
// 응답 계약 — 503 "미활성화" — 이 그대로 유지되는지 확인한다.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const PORT = 34578; // 다른 테스트와 충돌 안 나게 임의 포트 사용
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  server = await startTestServer({ port: PORT, env: { KIS_ENABLED: 'false' } });
});

after(() => {
  if (server) server.stop();
});

test('FND-18: KIS_ENABLED=false — 정상 경로(예외 아님)로 503 "미활성화" 응답', async () => {
  const resp = await fetch(`${BASE}/api/stocks/AAPL`);
  assert.strictEqual(resp.status, 503);
  const body = await resp.json();
  assert.deepStrictEqual(body, { error: '주가 조회 기능은 아직 준비 중입니다.' });
});
