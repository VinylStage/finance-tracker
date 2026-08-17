#!/usr/bin/env node
// 클라이언트 테스트의 **파일별 실행 시간**을 재서 오래 걸리는 것을 보고한다(#630).
//
// CI 는 샤드로 나눠 도는데(#640) `--shard` 는 파일을 경로순으로 정렬해 **개수를
// 균등하게** 나눈다. 시간이 아니라 개수라서, 무거운 파일이 한쪽에 몰리면 그 샤드만
// 오래 끌고 벽시계가 그만큼 늘어난다.
//
// 그래서 무거운 것들을 `vite.config.js` 의 `jsdom-heavy` 갈래로 따로 빼 두었다.
// **그 목록이 낡았는지 확인하는 것이 이 스크립트의 일이다.**
//
// 파일 목록을 CLI 로 넘겨 시간 기준으로 나누는 방법도 시도했으나, vitest 4 의
// projects 모드에서는 CLI 파일 필터가 project include 와 안 맞아 «No test files found»
// 로 죽는다. 그래서 분배는 설정에 두고 측정만 여기서 한다.
//
// 사용: node scripts/test-timings.mjs [상위N=10]

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.join(HERE, '..', 'client');

function main(argv) {
  const topN = Number(argv[0]) || 10;
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'timings-')), 'r.json');

  try {
    execFileSync('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${out}`], {
      cwd: CLIENT, stdio: 'ignore',
    });
  } catch {
    // 테스트가 실패해도 리포트는 남는다. 시간만 볼 것이므로 계속한다.
  }

  if (!fs.existsSync(out)) {
    process.stderr.write('리포트를 못 만들었다. client 에서 vitest 가 도는지 확인해라.\n');
    return 1;
  }

  const report = JSON.parse(fs.readFileSync(out, 'utf-8'));
  const rows = (report.testResults || [])
    .map((r) => ({
      file: String(r.name || '').split('/client/').pop(),
      ms: (r.endTime || 0) - (r.startTime || 0),
    }))
    .sort((a, b) => b.ms - a.ms);

  const total = rows.reduce((sum, r) => sum + r.ms, 0);
  process.stdout.write(`파일 ${rows.length}개 · 합계 ${(total / 1000).toFixed(1)}초\n\n`);
  for (const r of rows.slice(0, topN)) {
    const share = total ? ((100 * r.ms) / total).toFixed(0) : '0';
    process.stdout.write(`  ${(r.ms / 1000).toFixed(2).padStart(6)}s  ${String(share).padStart(2)}%  ${r.file}\n`);
  }

  const heavy = rows.slice(0, 3);
  process.stdout.write(
    `\n상위 3개가 ${(heavy.reduce((s, r) => s + r.ms, 0) / 1000).toFixed(1)}초다.\n`
    + 'vite.config.js 의 `jsdom-heavy` 갈래에 이 셋이 들어 있는지 확인해라 — 다르면 갱신한다.\n'
  );
  return 0;
}

process.exit(main(process.argv.slice(2)));
