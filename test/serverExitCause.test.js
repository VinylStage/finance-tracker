'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startTestServer } = require('./helpers/testServer');

const REPO = path.join(__dirname, '..');

// 서버를 직접 띄운다. 시그널을 우리가 보내고 그때 출력을 봐야 하므로
// 헬퍼의 stop() 이 아니라 이 자리에서 프로세스를 다룬다.
function spawnServer(port) {
  const dbPath = path.join(os.tmpdir(), `exit-cause-${port}-${process.pid}.db`);
  let output = '';
  const proc = spawn('node', ['src/server.js'], {
    cwd: REPO,
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.on('data', (d) => { output += d.toString(); });
  proc.stderr.on('data', (d) => { output += d.toString(); });
  return { proc, dbPath, out: () => output };
}

// 서버가 뜰 때까지 기다린다. 뜬 뒤에 시그널을 보내야 의미가 있다.
async function waitReady(port, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (r.ok) return true;
    } catch { /* 아직 */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

// 프로세스가 끝날 때까지 기다리고 { code, signal } 을 돌려준다.
function waitExit(proc) {
  return new Promise((resolve) => proc.on('exit', (code, signal) => resolve({ code, signal })));
}

function cleanup(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix); } catch { /* 이미 없을 수 있다 */ }
  }
}

// 띄운 서버는 **단언이 던져도** 반드시 정리한다.
//
// 안 그러면 살아남은 자식이 `node --test` 를 붙잡아 테스트가 영원히 안 끝난다
// (이 저장소는 `--test-timeout=0` 이라 상한도 없다). 실제로 그렇게 19분을 매달렸다.
// 각 시나리오는 이 도우미로 감싸 쓴다.
async function withServer(port, fn) {
  const s = spawnServer(port);
  try {
    return await fn(s);
  } finally {
    try { s.proc.kill(); } catch { /* 이미 죽었을 수 있다 */ }
    cleanup(s.dbPath);
  }
}

test('SIGTERM 을 받으면 원인을 stderr 로 남긴다', async () => {
  await withServer(35970, async (s) => {
    assert.ok(await waitReady(35970), '서버가 안 떴다');
    s.proc.kill('SIGTERM');
    await waitExit(s.proc);
    assert.match(s.out(), /SIGTERM/);
    assert.match(s.out(), /받아 종료합니다/);
  });
});

test('SIGINT 도 같은 방식으로 남는다', async () => {
  await withServer(35971, async (s) => {
    assert.ok(await waitReady(35971), '서버가 안 떴다');
    s.proc.kill('SIGINT');
    await waitExit(s.proc);
    assert.match(s.out(), /SIGINT/);
    assert.match(s.out(), /받아 종료합니다/);
  });
});

test('종료코드는 여전히 0 이다', async () => {
  await withServer(35972, async (s) => {
    assert.ok(await waitReady(35972), '서버가 안 떴다');
    s.proc.kill('SIGTERM');
    const r = await waitExit(s.proc);
    assert.equal(r.code, 0);
  });
});

test('그냥 뜨기만 하면 종료 메시지가 없다', async () => {
  await withServer(35973, async (s) => {
    assert.ok(await waitReady(35973), '서버가 안 떴다');
    assert.doesNotMatch(s.out(), /받아 종료합니다/);
    s.proc.kill();
  });
});

test('포트가 물려 있으면 헬퍼가 그 서버에 안 붙는다', async () => {
  await withServer(35974, async () => {
    assert.ok(await waitReady(35974), '앞선 서버가 안 떴다');
    await assert.rejects(
      () => startTestServer({ port: 35974 }),
      (e) => {
        assert.match(e.message, /이미 다른 서버가 있다/);
        return true;
      }
    );
  });
});

test('헬스 응답이 pid 를 준다', async () => {
  await withServer(35972, async (s) => {
    assert.ok(await waitReady(35972), '서버가 안 떴다');
    const r = await fetch('http://127.0.0.1:35972/api/health');
    const body = await r.json();
    assert.equal(body.pid, s.proc.pid);
  });
});

test('포트가 물리면 종료코드가 0 이 아니다', async () => {
  await withServer(35971, async () => {
    assert.ok(await waitReady(35971), '첫 서버가 안 떴다');
    await withServer(35971, async (second) => {
      const r = await waitExit(second.proc);
      assert.notEqual(r.code, 0, '포트가 물렸는데 0 으로 나가면 안 된다');
    });
  });
});

test('포트가 물리면 원인이 stderr 에 남는다', async () => {
  await withServer(35972, async () => {
    assert.ok(await waitReady(35972), '첫 서버가 안 떴다');
    await withServer(35972, async (second) => {
      // The error message format is "[server] 리스닝 실패: EADDRINUSE (127.0.0.1:35972)"
      // 출력을 읽기 전에 **종료를 기다린다.** 스폰 직후에는 아직 비어 있다.
      await waitExit(second.proc);
      assert.match(second.out(), /\[server\] 리스닝 실패/);
    });
  });
});

test('포트가 물리면 «기동 성공» 로그가 안 찍힌다', async () => {
  await withServer(35975, async () => {
    assert.ok(await waitReady(35975), '첫 서버가 안 떴다');
    await withServer(35975, async (second) => {
      // 출력을 읽기 전에 **종료를 기다린다.** 스폰 직후에는 아직 비어 있다.
      await waitExit(second.proc);
      assert.doesNotMatch(second.out(), /\[server\] http:\/\//);
    });
  });
});

test('정상 경로에서는 헬퍼가 서버를 돌려준다', async () => {
  const server = await startTestServer({ port: 35973 });
  assert.ok(server.base.includes('35973'));
  server.stop();
});
