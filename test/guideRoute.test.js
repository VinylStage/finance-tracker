// 서버 기동은 공용 헬퍼가 맡는다(#379). 조기 종료를 즉시 감지한다.
const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { startTestServer } = require('./helpers/testServer');

const PORT = 34601; // 다른 테스트와 충돌 안 나게 임의 포트 사용
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
});

after(() => {
  if (server) server.stop();
});

test('guide 라우트 — GET /api/guide returning markdown content', async () => {
  const response = await fetch(`${BASE}/api/guide`);
  
  // Should return 200
  assert.strictEqual(response.status, 200);
  
  // Check Content-Type header value (not guessed)
  const contentType = response.headers.get('content-type');
  assert.ok(contentType, 'Content-Type header should be present');
  assert.ok(contentType.includes('text/markdown'), `Content-Type should include 'text/markdown', got: ${contentType}`);
  
  // Check that response body is not empty
  const content = await response.text();
  assert.ok(content.length > 0, 'Response body should not be empty');
  assert.ok(content.startsWith('# 사용자 가이드'), 'Response should contain guide content');
});
