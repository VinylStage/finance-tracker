'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// scripts/check-test-ports.js 의 동작을 잠근다 (#627).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 이 테스트가 필요한가
//
// 이 검사는 **CI 에서만 나는 실패**를 막는 장치다. 예전 테스트 포트(34574~35975)는
// 전부 리눅스 임시 포트 범위(32768~60999) 안이어서, CI 에서 커널이 그 번호를 먼저
// 잡으면 테스트 서버가 EADDRINUSE 로 죽었다. macOS 임시 대역은 49152~65535 라
// 로컬에서는 재현되지 않는다.
//
// 즉 이 검사가 조용히 망가져도 **아무도 로컬에서 알아채지 못한다.** 그래서 검사
// 자체를 테스트로 잠근다.
//
// 4번 케이스가 특히 회귀 방지용이다. 예전 검사는 `const PORT` 와 `startTestServer`
// 두 패턴만 봐서, serverExitCause 가 자체 헬퍼 `withServer()` 로 쓰는 포트 6개 중
// 4개를 아예 보지 못했다.
//
// ─────────────────────────────────────────────────────────────────────────
// 포트 번호를 리터럴로 쓰지 않는 이유
//
// 이 파일도 check-test-ports.js 의 스캔 대상이다. 픽스처용 위반 포트를 리터럴로
// 적으면 검사가 **이 테스트 파일을 위반으로 잡아** `npm run test:ports` 가 실패한다.
// 그래서 아래 포트 값은 전부 산술로 만든다.

const SCRIPT = path.join(__dirname, '..', 'scripts', 'check-test-ports.js');

const GOOD = 20000 + 501; // 허용 대역 안
const EPHEMERAL = 34000 + 600; // 리눅스 임시 대역 안 — 예전 대역이 여기였다
const LOW = 3000 + 0; // 허용 대역 밖이지만 임시 대역도 아니다

// 픽스처 디렉터리를 만들고 검사를 돌린다. files 는 {파일이름: 내용} 이다.
function runCheck(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'port-check-'));
  try {
    for (const [name, body] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), body);
    }
    const r = spawnSync(process.execPath, [SCRIPT], {
      env: { ...process.env, TEST_PORTS_DIR: dir },
      encoding: 'utf-8',
    });
    return { code: r.status, stdout: r.stdout, stderr: r.stderr };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('허용 대역 안이고 겹치지 않으면 통과한다', () => {
  const r = runCheck({
    'a.test.js': `const PORT = ${GOOD};\nstartTestServer({ port: PORT });\n`,
  });
  assert.equal(r.code, 0, `통과해야 하는데 실패했다:\n${r.stderr}`);
  assert.match(r.stdout, /충돌 없음/);
});

test('리눅스 임시 대역 포트는 막는다 — CI 에서만 EADDRINUSE 가 나는 자리다', () => {
  const r = runCheck({ 'a.test.js': `const PORT = ${EPHEMERAL};\n` });
  assert.equal(r.code, 1, '임시 대역 포트가 통과했다');
  assert.match(r.stderr, /20000~21999/);
  assert.match(r.stderr, /리눅스 임시 포트 범위/);
});

test('두 파일이 같은 포트를 쓰면 막는다', () => {
  const r = runCheck({
    'a.test.js': `const PORT = ${GOOD};\n`,
    'b.test.js': `const PORT = ${GOOD};\n`,
  });
  assert.equal(r.code, 1, '포트 중복이 통과했다');
  assert.match(r.stderr, /포트가 겹친다/);
});

test('자체 헬퍼로 띄우는 포트도 본다 — const PORT 도 startTestServer 도 없다', () => {
  const r = runCheck({ 'a.test.js': `await withServer(${EPHEMERAL}, fn);\n` });
  assert.equal(r.code, 1, '자체 헬퍼가 쓰는 포트를 못 봤다');
  assert.match(r.stderr, /리눅스 임시 포트 범위/);
});

test('PORT + N 파생은 막는다', () => {
  // 파생 패턴도 포트 리터럴과 같은 이유로 소스에 그대로 두지 못한다 — 그러면 검사가
  // 이 파일을 파생 위반으로 잡는다. 그래서 `+` 를 떼어 조립한다.
  const r = runCheck({
    'a.test.js': `const PORT = ${GOOD};\nstartTestServer({ port: PORT ${'+'} 1 });\n`,
  });
  assert.equal(r.code, 1, '파생 포트가 통과했다');
  assert.match(r.stderr, /PORT \+ N/);
});

test('임시 대역이 아니어도 허용 대역 밖이면 막는다', () => {
  const r = runCheck({ 'a.test.js': `const PORT = ${LOW};\n` });
  assert.equal(r.code, 1, '허용 대역 밖 포트가 통과했다');
  assert.match(r.stderr, /허용 대역 밖이다/);
  // 사유를 구분해 찍는지도 본다. 임시 대역이 아닌데 그 사유가 붙으면 안내가 틀린 것이다.
  assert.ok(
    !r.stderr.includes('리눅스 임시 포트 범위'),
    `임시 대역이 아닌데 그 사유가 붙었다:\n${r.stderr}`
  );
});
