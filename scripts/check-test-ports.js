#!/usr/bin/env node
'use strict';

// 테스트 파일들이 쓰는 HTTP 포트를 검사한다. 두 가지를 본다.
//
// ─────────────────────────────────────────────────────────────────────────
// 1. 포트가 파일끼리 겹치는가
//
// 포트가 겹치면 **단독 실행은 통과하고 전체 스위트에서만 간헐 실패한다.**
// 재실행하면 통과해서, 원인을 짚기 전까지는 무엇이 문제인지 안 보인다.
//
// 실제로 두 번 냈다. 둘 다 별도 서버를 `PORT + 1` 로 띄운 것이 원인이었다.
//
//   auditRoute(20625) + 1, + 2  →  recurringRulesFields(20626), cardBenefits(20627)
//   guideRoute(20601) + 1       →  savingsRoute(20602)
//
// 파생 포트는 "지금은 비어 있다" 를 가정하는데, 그 가정은 다른 파일이 포트를
// 고를 때 아무도 확인하지 않는다. 그래서 파생 자체를 막는다.
//
// ─────────────────────────────────────────────────────────────────────────
// 2. 포트가 커널 임시 대역 안인가 (#627)
//
// 예전 대역(34574~35975)은 리눅스 기본 임시 포트 범위(32768~60999) **안**이었다.
// 임시 포트는 바깥으로 나가는 연결에 커널이 아무거나 골라 쓰는 대역이다. CI 에서
// `npm ci`·`fetch` 가 연결을 열면 커널이 그 중 한 번호를 잡을 수 있고, 마침 그
// 번호를 테스트 서버가 바인딩하려 하면 `EADDRINUSE` 로 죽는다.
//
// 1번 검사로는 못 잡는다 — 상대가 다른 테스트 파일이 아니라 커널이다. macOS
// 임시 대역은 49152~65535 라 **로컬에서는 영영 재현되지 않고** CI 에서만 무작위로
// 난다. 그래서 포트를 20000~21999(등록 대역 안, 임시 대역 밖)로 옮겼고, 새 테스트가
// 다시 임시 대역으로 돌아가지 못하게 여기서 막는다.
//
// 사용: node scripts/check-test-ports.js
// 종료코드 0 통과, 1 위반 있음.

const fs = require('node:fs');
const path = require('node:path');

const TEST_DIR = process.env.TEST_PORTS_DIR || path.join(__dirname, '..', 'test');

// 허용 대역. 등록 포트(1024~49151) 안이면서 리눅스 임시 하한(32768) 아래다.
const ALLOWED_LO = 20000;
const ALLOWED_HI = 21999;

// 리눅스 기본 `net.ipv4.ip_local_port_range`. 위반 사유를 구분해 찍으려고 들고 있다.
const EPHEMERAL_LO = 32768;
const EPHEMERAL_HI = 60999;

// 포트가 어떻게 적히는지는 파일마다 다르다. `const PORT` 와
// `startTestServer({ port: N })` 두 개만 보면 자체 헬퍼로 서버를 띄우는 파일을
// 놓친다 — serverExitCause 는 `withServer(N, ...)` 로 6개를 쓰는데 그 중 4개가
// 예전 검사에는 아예 보이지 않았다. 그래서 «포트 자리에 오는 숫자» 를 문맥으로 잡는다.
const PORT_CTX = new RegExp(
  '(?:' + [
    'const PORT\\s*=\\s*',
    'port:\\s*',
    'withServer\\(\\s*',
    'waitReady\\(\\s*',
    '127\\.0\\.0\\.1:',
    'localhost:',
    'finance-test-',
  ].map((alt) => `(?:${alt})`).join('|') + ')(\\d{4,5})',
  'g'
);

// PORT + N 으로 파생시키는 것을 막는다. 헬퍼 이름이 무엇이든 막는다.
const DERIVED = /(?:port:|withServer\(|waitReady\()\s*PORT\s*[+\-]/;

function main() {
  const owners = new Map(); // port -> Set<file>
  const derived = [];

  for (const name of fs.readdirSync(TEST_DIR).filter((f) => f.endsWith('.test.js'))) {
    const text = fs.readFileSync(path.join(TEST_DIR, name), 'utf-8');

    if (DERIVED.test(text)) derived.push(name);

    PORT_CTX.lastIndex = 0;
    let m;
    while ((m = PORT_CTX.exec(text)) !== null) {
      const port = Number(m[1]);
      if (!owners.has(port)) owners.set(port, new Set());
      owners.get(port).add(name);
    }
  }

  const clashes = [...owners.entries()].filter(([, files]) => files.size > 1).sort((a, b) => a[0] - b[0]);

  const outOfRange = [...owners.entries()]
    .filter(([port]) => port < ALLOWED_LO || port > ALLOWED_HI)
    .sort((a, b) => a[0] - b[0]);

  let bad = false;

  if (clashes.length) {
    bad = true;
    console.error('포트가 겹친다. 전체 스위트에서만 간헐 실패한다.\n');
    for (const [port, files] of clashes) {
      console.error(`  ${port}`);
      for (const f of [...files].sort()) console.error(`    ${f}`);
    }
    console.error('');
  }

  if (outOfRange.length) {
    bad = true;
    console.error(`테스트 포트는 ${ALLOWED_LO}~${ALLOWED_HI} 에서 고른다.\n`);
    for (const [port, files] of outOfRange) {
      const why =
        port >= EPHEMERAL_LO && port <= EPHEMERAL_HI
          ? `리눅스 임시 포트 범위(${EPHEMERAL_LO}~${EPHEMERAL_HI}) 안이다. CI 에서 커널이 그 번호를 먼저 잡으면 EADDRINUSE 로 죽고, macOS 에서는 재현되지 않는다`
          : '허용 대역 밖이다';
      console.error(`  ${port}  ${why}`);
      for (const f of [...files].sort()) console.error(`    ${f}`);
    }
    console.error('');
  }

  if (derived.length) {
    bad = true;
    console.error('포트를 PORT + N 으로 만들지 않는다. 그 자리를 다른 파일이 쓸 수 있다.\n');
    for (const f of derived) console.error(`  ${f}`);
    console.error('\n  비어 있는 대역에서 숫자를 골라 고정한다.\n');
  }

  if (bad) return 1;

  console.log(`테스트 포트 ${owners.size}개, 충돌 없음 · 전부 ${ALLOWED_LO}~${ALLOWED_HI}`);
  return 0;
}

process.exit(main());
