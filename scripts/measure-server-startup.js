'use strict';

// 테스트 서버 기동 시간을 잰다(#379).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 재는가
//
// #379 는 «서버가 15초 안에 안 떠서 CI 가 플레이키하다» 로 열렸다. 로컬에서
// 재보니 68개를 동시에 띄워도 최대 1,213ms 로 **상한의 8%** 였다 — 올릴 근거도
// 낮출 근거도 없었다.
//
// 그러나 로컬은 이 저장소가 도는 가장 빠른 환경이다. **CI 러너에서 실제로 몇
// 초인지는 아무도 모른다.** 그 값 없이 상한을 만지면 다음에 또 같은 자리에 선다.
//
// 그래서 야간 워크플로에 이걸 붙인다. 하루 한 번 CI 에서 재서 로그에 남긴다.
//
// ─────────────────────────────────────────────────────────────────────────
// 게이트가 아니다
//
// **실패시키지 않는다.** 재는 것이 목적이고, 임계값을 정할 근거가 아직 없다.
// 여기서 빌드를 깨면 «측정하려다 만든 플레이키» 가 된다 — 고치려던 것과 같은
// 종류다. 숫자가 쌓인 뒤에 게이트를 논한다.

const os = require('node:os');
const { startTestServer, READY_TIMEOUT_MS } = require('../test/helpers/testServer');

// `node --test` 의 기본 동시성은 CPU 코어 수다. 그 숫자만큼 동시에 띄워야
// 실제 테스트 실행과 같은 부하가 된다.
const CONCURRENCY = os.cpus().length;

// 다른 테스트와 겹치지 않는 대역. `npm run test:ports` 가 보는 것은 테스트 파일의
// 상수라 이 스크립트는 그 검사 대상이 아니다 — 그래서 일부러 멀리 띄운다.
const BASE_PORT = 36100;

function stats(list) {
  const sorted = [...list].sort((a, b) => a - b);
  return {
    min: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    max: sorted[sorted.length - 1],
  };
}

async function main() {
  const started = Date.now();

  const results = await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) => {
      const at = Date.now();
      return startTestServer({ port: BASE_PORT + i })
        .then((server) => ({ ms: Date.now() - at, server }))
        .catch((e) => ({ error: e.message.split('\n')[0] }));
    })
  );

  const wall = Date.now() - started;
  const ok = results.filter((r) => !r.error);
  const failed = results.filter((r) => r.error);

  // 띄운 것은 반드시 정리한다. 남기면 다음 단계의 포트를 물고, 그 실패는
  // 원인이 여기라는 것을 말해 주지 않는다.
  for (const r of ok) r.server.stop();

  console.log('[startup] 환경');
  console.log(`  플랫폼      ${process.platform} ${os.release()}`);
  console.log(`  CPU         ${CONCURRENCY}코어 (${os.cpus()[0]?.model || '알 수 없음'})`);
  console.log(`  메모리      ${(os.totalmem() / 1024 ** 3).toFixed(1)}GB`);
  console.log(`  node        ${process.version}`);
  console.log('');
  console.log('[startup] 결과');
  console.log(`  동시 기동   ${CONCURRENCY}개`);
  console.log(`  성공/실패   ${ok.length} / ${failed.length}`);

  if (ok.length) {
    const s = stats(ok.map((r) => r.ms));
    const pct = ((s.max / READY_TIMEOUT_MS) * 100).toFixed(1);
    console.log(`  기동 최소   ${s.min}ms`);
    console.log(`  기동 중앙   ${s.median}ms`);
    console.log(`  기동 최대   ${s.max}ms`);
    console.log(`  전체 벽시계 ${wall}ms`);
    console.log(`  상한 대비   ${pct}% (상한 ${READY_TIMEOUT_MS}ms)`);
  }

  for (const f of failed) console.log(`  실패        ${f.error}`);

  // 실패가 있어도 종료코드는 0 이다. 위의 «게이트가 아니다» 를 참고.
}

main().catch((e) => {
  // 스크립트 자체가 깨진 경우다. 이건 측정 실패가 아니라 버그라 시끄럽게 알린다.
  console.error('[startup] 측정 스크립트가 실패했다:', e.message);
  process.exit(1);
});
