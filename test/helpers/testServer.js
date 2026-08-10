'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// HTTP 테스트용 서버를 띄우고 준비될 때까지 기다린다(#379).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 공용으로 빼는가
//
// 47개 테스트 파일이 같은 boilerplate 를 복사해 갖고 있었고, 전부 같은 결함을
// 갖고 있었다 — **자식이 이미 죽었는데 대기 루프가 그걸 모르고 15초를 채운다.**
//
// 실제로 CI 에서 났다. 서버가 종료코드 0 으로 조용히 나갔는데(기동 로그도 안
// 찍힘) 테스트는 15,033ms 를 기다린 끝에 "안 떴다" 만 알려줬다. 원인이 담긴
// 정보(종료코드·시그널·출력)를 이미 갖고 있었는데 **읽히기까지 15초가 걸렸고**,
// 재실행하면 통과해서 조사가 안 됐다.
//
// 여기서는 `exit` 이벤트가 오면 **즉시** 실패시킨다. 15초 낭비가 사라지고
// 실패 메시지가 원인을 그대로 싣는다.
//
// ─────────────────────────────────────────────────────────────────────────
// 기동은 70ms 다
//
// 실측: better-sqlite3 3ms + 스키마·마이그레이션 21개·트리거 57개 31ms +
// express 36ms. 24개를 동시에 띄워도 최대 558ms 였다. 상한 15초는 넉넉하고,
// 그 상한을 올릴 이유가 없다 — 조기 종료를 못 잡는 게 문제였지 시간이
// 모자란 게 아니었다.

const READY_TIMEOUT_MS = 15000;
const POLL_MS = 100;

/**
 * 서버를 띄우고 /api/health 가 응답할 때까지 기다린다.
 *
 * @param {{port: number, env?: object}} opts
 * @returns {Promise<{proc, dbPath, base, output: () => string, stop: () => void}>}
 */
async function startTestServer({ port, env = {} }) {
  const dbPath = path.join(
    os.tmpdir(),
    `finance-test-${port}-${process.pid}-${Math.random().toString(36).slice(2)}.db`
  );

  let output = '';
  let exited = null; // { code, signal }

  const proc = spawn('node', ['src/server.js'], {
    cwd: path.join(__dirname, '..', '..'),
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DB_PATH: dbPath, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  proc.stdout.on('data', (d) => { output += d.toString(); });
  proc.stderr.on('data', (d) => { output += d.toString(); });
  proc.on('exit', (code, signal) => {
    exited = { code, signal };
    output += `\n[server exited] code=${code} signal=${signal}\n`;
  });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    // **먼저 종료를 본다.** 죽은 프로세스에 health 를 계속 찔러 봐야
    // 상한까지 기다릴 뿐이다.
    if (exited) {
      cleanup(dbPath);
      throw new Error(
        `서버가 준비 전에 종료됨 (code=${exited.code} signal=${exited.signal}). 포트 ${port}.\n` +
        `서버 출력:\n${output || '(출력 없음)'}`
      );
    }

    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) {
        return {
          proc,
          dbPath,
          base,
          output: () => output,
          stop: () => { try { proc.kill(); } catch { /* 이미 죽었을 수 있다 */ } cleanup(dbPath); },
        };
      }
    } catch { /* 아직 기동 전 */ }

    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  try { proc.kill(); } catch { /* 이미 죽었을 수 있다 */ }
  cleanup(dbPath);
  throw new Error(
    `서버가 ${READY_TIMEOUT_MS / 1000}초 안에 기동하지 않음. 포트 ${port}.\n` +
    `서버 출력:\n${output || '(출력 없음)'}`
  );
}

// DB 파일은 -wal·-shm 까지 셋이다. 하나만 지우면 다음 실행이 남은 WAL 을 읽는다.
function cleanup(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix); } catch { /* 이미 없을 수 있다 */ }
  }
}

module.exports = { startTestServer, READY_TIMEOUT_MS };
