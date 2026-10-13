'use strict';

// 감사 M4 — Host 헤더 허용목록(DNS 리바인딩 차단). 단위(미들웨어·파서·허용목록
// 구성) + 통합(실제 서버에 위조 Host 로 원시 요청). undici(fetch)는 Host 를
// 금지 헤더로 무시하므로 통합 검증은 node:http 로 직접 보낸다.

const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { createHostGuard, hostnameOf, buildAllowed, DEFAULT_HOSTS } = require('../src/utils/hostGuard');
const { startTestServer } = require('./helpers/testServer');

function mockRes() {
  return {
    statusCode: null, body: null,
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
  };
}
function run(guard, hostHeader) {
  const req = { headers: hostHeader === undefined ? {} : { host: hostHeader } };
  const res = mockRes();
  let nexted = false;
  guard(req, res, () => { nexted = true; });
  return { nexted, res };
}

test('hostnameOf — 포트 제거·IPv6 리터럴·빈 값', () => {
  assert.strictEqual(hostnameOf('127.0.0.1:21000'), '127.0.0.1');
  assert.strictEqual(hostnameOf('localhost'), 'localhost');
  assert.strictEqual(hostnameOf('[::1]:21000'), '::1');
  assert.strictEqual(hostnameOf('[::1]'), '::1');
  assert.strictEqual(hostnameOf('evil.example:80'), 'evil.example');
  assert.strictEqual(hostnameOf(''), '');
  assert.strictEqual(hostnameOf(undefined), '');
});

test('buildAllowed — 기본 루프백 + ALLOWED_HOSTS 추가 + HOST 추가(와일드카드 제외)', () => {
  const base = buildAllowed({});
  for (const h of DEFAULT_HOSTS) assert.ok(base.has(h), `기본 허용에 ${h}`);
  assert.ok(!base.has('evil.example'));

  const withEnv = buildAllowed({ ALLOWED_HOSTS: 'a.test, b.test ', HOST: '192.168.0.9' });
  assert.ok(withEnv.has('a.test') && withEnv.has('b.test'), 'ALLOWED_HOSTS 항목');
  assert.ok(withEnv.has('192.168.0.9'), '구체 HOST 는 허용');
  assert.ok(withEnv.has('127.0.0.1'), '기본 루프백은 항상 유지');

  // 와일드카드 바인딩은 특정 이름이 아니므로 허용목록에 넣지 않는다.
  assert.ok(!buildAllowed({ HOST: '0.0.0.0' }).has('0.0.0.0'));
  assert.ok(!buildAllowed({ HOST: '::' }).has('::'));
});

test('미들웨어 — 루프백 Host 는 통과, 포트 붙어도 통과', () => {
  const guard = createHostGuard({});
  for (const h of ['127.0.0.1', 'localhost:21000', '[::1]:21000']) {
    const { nexted, res } = run(guard, h);
    assert.ok(nexted, `${h} 통과`);
    assert.strictEqual(res.statusCode, null);
  }
});

test('미들웨어 — 허용목록 밖 Host 는 403, next 호출 안 함', () => {
  const guard = createHostGuard({});
  const { nexted, res } = run(guard, 'evil.example');
  assert.strictEqual(nexted, false, 'next 를 부르면 안 된다');
  assert.strictEqual(res.statusCode, 403);
  assert.ok(res.body && /호스트/.test(res.body.error));
});

test('미들웨어 — Host 헤더 자체가 없으면 403(빈 이름은 허용목록에 없다)', () => {
  const { nexted, res } = run(createHostGuard({}), undefined);
  assert.strictEqual(nexted, false);
  assert.strictEqual(res.statusCode, 403);
});

test('미들웨어 — ALLOWED_HOSTS 로 추가한 이름만 통과', () => {
  const guard = createHostGuard({ ALLOWED_HOSTS: 'app.test' });
  assert.ok(run(guard, 'app.test').nexted, '추가된 이름 통과');
  assert.strictEqual(run(guard, 'other.test').res.statusCode, 403, '추가 안 된 이름은 거부');
});

// 통합: 실제 서버가 위조 Host 를 403 으로 막고, 정상 Host 는 200 을 주는가.
function rawGet(port, hostHeader) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: '/api/health', method: 'GET', headers: { Host: hostHeader } },
      (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => resolve({ status: res.statusCode, body: b })); }
    );
    req.on('error', reject);
    req.end();
  });
}

test('통합 — 위조 Host 는 403, 루프백 Host 는 200', async () => {
  const PORT = 21977;
  const server = await startTestServer({ port: PORT });
  try {
    const evil = await rawGet(PORT, 'evil.example');
    assert.strictEqual(evil.status, 403, '위조 Host 거부');
    const ok = await rawGet(PORT, `127.0.0.1:${PORT}`);
    assert.strictEqual(ok.status, 200, '루프백 Host 통과');
    assert.ok(/"ok":true/.test(ok.body));
  } finally {
    server.stop();
  }
});
