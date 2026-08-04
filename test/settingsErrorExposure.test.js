// 서버 기동은 공용 헬퍼가 맡는다(#379). 조기 종료를 즉시 감지한다.
// FND-11(감사): settings.js:25-27의 GET 핸들러만 catch에서 e.message를
// 그대로 응답에 실었다(같은 파일의 PUT은 serverError()를 올바르게 씀).
// src/utils/errors.js가 명시한 "내부 메시지를 클라이언트에 노출하지
// 않는다" 정책을 GET 한 곳만 위반했다.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const { startTestServer } = require('./helpers/testServer');

const PORT = 34579; // 다른 테스트와 충돌 안 나게 임의 포트 사용
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
});

after(() => {
  if (server) server.stop();
});

test('FND-11: 감사 PoC — GET /api/settings가 DB 오류 시 내부 메시지를 노출하지 않음', async () => {
  // 별도 연결로 app_settings 테이블을 지워 GET 핸들러가 실제 SQLite 오류를
  // 만나게 한다(WAL 모드라 서버 프로세스의 연결과 별개로 안전하게 접근 가능).
  const raw = new Database(server.dbPath);
  raw.exec('DROP TABLE app_settings');
  raw.close();

  const resp = await fetch(`${BASE}/api/settings`);
  assert.strictEqual(resp.status, 500);
  assert.ok((resp.headers.get('content-type') || '').includes('application/json'));
  const body = await resp.json();
  assert.deepStrictEqual(body, { error: '처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.' });
  const bodyText = JSON.stringify(body);
  assert.ok(!bodyText.includes('no such table'), 'SQLite 원문 에러 메시지가 노출되면 안 됨');
});
