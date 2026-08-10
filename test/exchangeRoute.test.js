// 서버 기동은 공용 헬퍼가 맡는다(#379). 조기 종료를 즉시 감지한다.
'use strict';
/**
 * 환율 라우트에 대한 HTTP 테스트
 * EXIM_API_KEY가 없을 경우 500 에러를 반환해야 한다.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { startTestServer } = require('./helpers/testServer');

const PORT = 34603;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  server = await startTestServer({ port: PORT, env: { EXIM_API_KEY: undefined } });
});

after(() => {
  if (server) server.stop();
});

test('exchange 라우트 — API 키가 없을 경우 500 에러 반환', async () => {
  const resp = await fetch(`${BASE}/api/exchange`);
  
  // 상태 코드 확인
  assert.strictEqual(resp.status, 500);
  
  const body = await resp.json();
  
  // 에러 메시지 검증 - 실제 API 키가 노출되지 않아야 함
  assert.ok(body.error);
  assert.ok(!body.error.includes(process.env.EXIM_API_KEY), '에러 메시지에 API 키가 포함되어 있음');
  
  // 원본 스택트레이스나 내부 정보가 노출되지 않도록 방어
  assert.ok(!body.error.includes('EXIM_API_KEY is not set'), '원본 에러 메시지가 노출됨');
});
