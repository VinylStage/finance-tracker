// 서버 기동은 공용 헬퍼가 맡는다(#379). 조기 종료를 즉시 감지한다.
// FND-12(감사, B안): 18개 API 마운트 중 11개가 HTTP 테스트 전무했고, 그중
// export/settings 무테스트가 FND-03(설정 복원 100% 실패)이 릴리스까지
// 발견되지 못한 직접 원인이었다. settings 라우트는 이미 GET의 에러노출
// 회귀 테스트(FND-11, settingsErrorExposure.test.js)가 있으나 정상 경로
// (GET 기본값/PUT 갱신/GET 반영)는 아직 테스트가 없었다 — 이 파일이 채운다.
const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { startTestServer } = require('./helpers/testServer');

const PORT = 34576; // 다른 테스트와 충돌 안 나게 임의 포트 사용
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
});

after(() => {
  if (server) server.stop();
});

test('settings 라우트 — GET 기본값 → PUT 갱신 → GET 반영 → 부분 갱신 → 잘못된 입력 거부', async () => {
  const initial = await (await fetch(`${BASE}/api/settings`)).json();
  assert.strictEqual(initial.initial_balance, 0);
  assert.strictEqual(initial.monthly_income, 0);

  const putResp = await fetch(`${BASE}/api/settings`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initial_balance: 1000000, monthly_income: 3000000 }),
  });
  assert.strictEqual(putResp.status, 200);

  const afterFirst = await (await fetch(`${BASE}/api/settings`)).json();
  assert.strictEqual(afterFirst.initial_balance, 1000000);
  assert.strictEqual(afterFirst.monthly_income, 3000000);

  // 부분 갱신 — monthly_income만 보내면 initial_balance는 그대로 유지돼야 함
  const partialResp = await fetch(`${BASE}/api/settings`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ monthly_income: 3500000 }),
  });
  assert.strictEqual(partialResp.status, 200);

  const afterPartial = await (await fetch(`${BASE}/api/settings`)).json();
  assert.strictEqual(afterPartial.initial_balance, 1000000, '부분 갱신 시 보내지 않은 필드가 초기화되면 안 됨');
  assert.strictEqual(afterPartial.monthly_income, 3500000);

  const badResp = await fetch(`${BASE}/api/settings`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initial_balance: 'abc' }),
  });
  assert.strictEqual(badResp.status, 400);
});
