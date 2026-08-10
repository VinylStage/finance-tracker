#!/usr/bin/env node
'use strict';

// 테스트 파일들이 쓰는 HTTP 포트가 겹치는지 본다.
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 필요한가
//
// 포트가 겹치면 **단독 실행은 통과하고 전체 스위트에서만 간헐 실패한다.**
// 재실행하면 통과해서, 원인을 짚기 전까지는 무엇이 문제인지 안 보인다.
//
// 실제로 두 번 냈다. 둘 다 별도 서버를 `PORT + 1` 로 띄운 것이 원인이었다.
//
//   auditRoute(34625) + 1, + 2  →  recurringRulesFields(34626), cardBenefits(34627)
//   guideRoute(34601) + 1       →  savingsRoute(34602)
//
// 파생 포트는 "지금은 비어 있다" 를 가정하는데, 그 가정은 다른 파일이 포트를
// 고를 때 아무도 확인하지 않는다. 그래서 파생 자체를 막는다.
//
// 사용: node scripts/check-test-ports.js
// 종료코드 0 통과, 1 충돌 있음.

const fs = require('node:fs');
const path = require('node:path');

const TEST_DIR = path.join(__dirname, '..', 'test');

const DECL = /const PORT = (\d{4,5})/g;
const INLINE = /startTestServer\(\s*\{[^}]*?port:\s*(\d{4,5})/g;
const DERIVED = /startTestServer\(\s*\{[^}]*?port:\s*PORT\s*[+\-]/;

function main() {
  const owners = new Map(); // port -> [{file, kind}]
  const derived = [];

  for (const name of fs.readdirSync(TEST_DIR).filter((f) => f.endsWith('.test.js'))) {
    const text = fs.readFileSync(path.join(TEST_DIR, name), 'utf-8');

    if (DERIVED.test(text)) derived.push(name);

    for (const [re, kind] of [[DECL, 'const PORT'], [INLINE, 'startTestServer']]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        const port = Number(m[1]);
        if (!owners.has(port)) owners.set(port, []);
        owners.get(port).push({ file: name, kind });
      }
    }
  }

  const clashes = [...owners.entries()]
    .filter(([, list]) => new Set(list.map((o) => o.file)).size > 1)
    .sort((a, b) => a[0] - b[0]);

  let bad = false;

  if (clashes.length) {
    bad = true;
    console.error('포트가 겹친다. 전체 스위트에서만 간헐 실패한다.\n');
    for (const [port, list] of clashes) {
      console.error(`  ${port}`);
      for (const o of list) console.error(`    ${o.file}  (${o.kind})`);
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

  console.log(`테스트 포트 ${owners.size}개, 충돌 없음`);
  return 0;
}

process.exit(main());
