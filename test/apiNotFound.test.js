// 서버 기동은 공용 헬퍼가 맡는다(#379). 조기 종료를 즉시 감지한다.
// FND-10(감사): SPA 폴백이 /api/* 를 예외 처리하지 않아 잘못된 API 경로가
// 404 JSON이 아니라 200 + index.html을 반환했다. client/src/lib/api.js는
// res.ok만 보고 성공으로 간주하므로, 오타 난 경로가 알 수 없는 형태로 화면에
// 나타났다. /api/* 전용 404 핸들러를 SPA 폴백보다 앞에 추가했다.
const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { startTestServer } = require('./helpers/testServer');

const PORT = 34581; // 다른 테스트와 충돌 안 나게 임의 포트 사용
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
});

after(() => {
  if (server) server.stop();
});

test('FND-10: 감사 PoC — 존재하지 않는 /api 경로는 200+HTML이 아니라 404 JSON', async () => {
  const resp = await fetch(`${BASE}/api/does-not-exist`);
  assert.strictEqual(resp.status, 404);
  assert.ok((resp.headers.get('content-type') || '').includes('application/json'));
  const body = await resp.json();
  assert.strictEqual(body.error, '요청한 주소를 찾을 수 없습니다.');
});

test('FND-10: 존재하는 라우트의 존재하지 않는 하위 경로도 404 JSON', async () => {
  const resp = await fetch(`${BASE}/api/transactions/summary/nope`);
  assert.strictEqual(resp.status, 404);
  const body = await resp.json();
  assert.strictEqual(body.error, '요청한 주소를 찾을 수 없습니다.');
});

test('FND-10: POST 등 다른 메서드로도 /api/* 404가 동일하게 적용됨', async () => {
  const resp = await fetch(`${BASE}/api/does-not-exist`, { method: 'POST' });
  assert.strictEqual(resp.status, 404);
});

test('FND-10: 실제 존재하는 API 라우트는 여전히 정상 동작', async () => {
  const resp = await fetch(`${BASE}/api/categories`);
  assert.strictEqual(resp.status, 200);
});

test('FND-10: /api가 아닌 알 수 없는 경로는 여전히 SPA 폴백(정적 파일 서빙 정책 영향 없음)', async () => {
  const resp = await fetch(`${BASE}/some-random-frontend-route`);
  // 빌드 산출물(public/index.html)이 없으면 서버가 안내 메시지를 JSON으로,
  // 있으면 index.html을 200으로 돌려준다 — 어느 쪽이든 /api 404 로직과
  // 무관하게 SPA 폴백 경로 자체는 방해받지 않아야 한다(404가 아니어야 함).
  assert.notStrictEqual(resp.status, 404);
});
