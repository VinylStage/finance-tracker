// 서버 기동은 공용 헬퍼가 맡는다(#379). 조기 종료를 즉시 감지한다.
const { test, before, after } = require('node:test');
const assert = require('node:assert');

const os = require('node:os');
const path = require('node:path');

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

// 파일이 없을 때의 404 는 아무 테스트도 거치지 않았다(#448). 사용자에게 그대로
// 보이는 문구인데, 이 줄이 사라지거나 상태 코드가 바뀌어도 알 수 없는 상태였다.
//
// 문서를 실제로 치우는 대신 GUIDE_PATH 를 없는 경로로 주입한다. 테스트가 중간에
// 죽어도 저장소 파일이 사라진 채 남지 않는다.
//
// 포트는 PORT + 1 로 만들지 않는다. 34601 + 1 은 savingsRoute 가 쓰는 34602 라
// 전체 스위트에서만 간헐 실패한다. 같은 실수를 auditRoute 에서 실제로 냈다.
test('guide 라우트 — 문서가 없으면 404 이고 내부 경로를 흘리지 않는다', async () => {
  const missing = path.join(os.tmpdir(), `no-such-guide-${process.pid}.md`);
  const alt = await startTestServer({ port: 34810, env: { GUIDE_PATH: missing } });
  try {
    const response = await fetch(`${alt.base}/api/guide`);
    assert.strictEqual(response.status, 404);

    const body = await response.json();
    assert.ok(body.error, '거부 사유가 없다');
    // 서버 파일시스템 경로가 응답에 실리면 안 된다.
    assert.ok(!body.error.includes('/'), `문구에 경로 노출: ${body.error}`);
    assert.ok(!body.error.includes('GUIDE'), `문구에 내부 이름 노출: ${body.error}`);
  } finally {
    alt.stop();
  }
});
