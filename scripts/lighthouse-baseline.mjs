#!/usr/bin/env node
// C1~C3 보완(감사보고서 6.2절): "p75 RUM" 대신 로컬 단일사용자 앱에 맞춘
// "Lighthouse 실험실 측정 3회 중앙값"을 성능 판정 근거로 쓰기 위한 스크립트.
// 서버를 직접 기동/종료까지 관리하므로 `npm run perf:baseline` 한 줄로 완결된다.
// 사용법: npm run perf:baseline (client는 미리 빌드돼 있어야 함 — npm run build)
'use strict';

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as chromeLauncher from 'chrome-launcher';
import lighthouse, { desktopConfig } from 'lighthouse';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.LH_TARGET_PORT || '3099';
const URL = `http://localhost:${PORT}`;
const RUNS = 3;

// INP(Interaction to Next Paint)는 실사용자 상호작용이 있어야 산출되는 필드 전용
// 지표라 랩(단발성 페이지 로드) 환경에서는 측정 자체가 불가능하다(Google 공식 문서
// 기준). 랩에서는 그 대체 지표로 총 차단 시간(TBT)을 함께 기록한다.
const METRICS = [
  ['lcp', 'largest-contentful-paint'],
  ['cls', 'cumulative-layout-shift'],
  ['tbt', 'total-blocking-time'],
  ['fcp', 'first-contentful-paint'],
  ['speedIndex', 'speed-index'],
];

function median(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (async function poll() {
      while (Date.now() - start < timeoutMs) {
        try {
          const res = await fetch(url);
          if (res.ok) return resolve();
        } catch {
          // 서버가 아직 준비되지 않음 — 계속 폴링
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      reject(new Error(`서버가 ${timeoutMs}ms 내에 응답하지 않음: ${url}`));
    })();
  });
}

async function runOnce(url, port) {
  const result = await lighthouse(url, {
    port,
    output: 'json',
    logLevel: 'error',
    onlyCategories: ['performance'],
  }, desktopConfig);

  const { lhr } = result;
  const metrics = { performanceScore: lhr.categories.performance.score };
  for (const [key, auditId] of METRICS) {
    metrics[key] = lhr.audits[auditId].numericValue;
  }
  return metrics;
}

async function main() {
  console.log(`[perf-baseline] 서버 기동 중... (포트 ${PORT})`);
  const server = spawn('node', ['src/server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT, HOST: '127.0.0.1' },
    stdio: 'pipe',
  });
  server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

  let chrome;
  try {
    await waitForServer(URL);
    console.log('[perf-baseline] 서버 준비 완료. Chrome 기동 중...');
    chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new'] });

    const runs = [];
    for (let i = 1; i <= RUNS; i++) {
      console.log(`[perf-baseline] ${i}/${RUNS}회차 측정 중...`);
      const metrics = await runOnce(URL, chrome.port);
      runs.push(metrics);
      console.log(
        `  점수 ${Math.round(metrics.performanceScore * 100)} · LCP ${Math.round(metrics.lcp)}ms` +
        ` · CLS ${metrics.cls.toFixed(3)} · TBT ${Math.round(metrics.tbt)}ms`
      );
    }

    const summary = {
      url: URL,
      runs: RUNS,
      note: 'INP는 필드(RUM) 전용 지표라 랩 측정 불가 — TBT를 대체 지표로 기록',
      median: {
        performanceScore: median(runs.map((r) => r.performanceScore)),
        ...Object.fromEntries(METRICS.map(([key]) => [key, median(runs.map((r) => r[key]))])),
      },
      raw: runs,
    };

    const outDir = path.join(ROOT, 'docs', 'audit');
    mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'lighthouse-baseline.json');
    writeFileSync(outPath, JSON.stringify(summary, null, 2));

    console.log('\n=== 중앙값 (3회, desktop preset) ===');
    console.log(`성능 점수: ${Math.round(summary.median.performanceScore * 100)}`);
    console.log(`LCP: ${Math.round(summary.median.lcp)}ms`);
    console.log(`CLS: ${summary.median.cls.toFixed(3)}`);
    console.log(`TBT: ${Math.round(summary.median.tbt)}ms`);
    console.log(`FCP: ${Math.round(summary.median.fcp)}ms`);
    console.log(`Speed Index: ${Math.round(summary.median.speedIndex)}ms`);
    console.log(`\n결과 저장: ${path.relative(ROOT, outPath)}`);
  } finally {
    if (chrome) await chrome.kill();
    server.kill();
  }
}

main().catch((e) => {
  console.error('[perf-baseline] 실패:', e.message);
  process.exit(1);
});
