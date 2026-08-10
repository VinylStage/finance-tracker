'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');

const { startTestServer, READY_TIMEOUT_MS } = require('./helpers/testServer');

// 공용 테스트 서버 헬퍼(#379).
//
// **이 파일의 핵심은 A-2 다** — 서버가 준비 전에 죽으면 상한을 기다리지 않고
// 즉시 실패해야 한다. CI 에서 실제로 15,033ms 를 기다린 끝에 "안 떴다" 만
// 알려준 일이 있었고, 그때 원인(종료코드 0, 기동 로그 없음)은 이미 수집돼
// 있었는데 읽히기까지 15초가 걸렸다.

describe('A. 기동과 조기 종료', () => {
  test('A-1. 정상 기동하면 base 와 stop 을 준다', async () => {
    const s = await startTestServer({ port: 35201 });
    try {
      assert.equal(s.base, 'http://127.0.0.1:35201');
      const r = await fetch(`${s.base}/api/health`);
      assert.equal(r.status, 200);
      assert.match(s.dbPath, /finance-test-35201-/);
    } finally {
      s.stop();
    }
  });

  test('A-2. 준비 전에 죽으면 상한을 기다리지 않고 즉시 실패한다', async () => {
    // 없는 디렉터리를 DB_PATH 로 주면 better-sqlite3 가 열지 못해 프로세스가
    // 곧장 죽는다. 예전 구조라면 여기서 15초를 채웠다.
    const t0 = Date.now();
    await assert.rejects(
      () => startTestServer({
        port: 35202,
        env: { DB_PATH: '/nonexistent-dir-379/x.db' },
      }),
      (err) => {
        assert.match(err.message, /준비 전에 종료됨/);
        // 실패 메시지가 원인을 싣고 있어야 한다. 종료코드만 있고 출력이 없으면
        // 다음에 같은 일이 나도 조사할 수 없다.
        assert.match(err.message, /code=/);
        assert.match(err.message, /서버 출력:/);
        return true;
      }
    );
    const elapsed = Date.now() - t0;

    assert.ok(
      elapsed < READY_TIMEOUT_MS / 3,
      `상한(${READY_TIMEOUT_MS}ms)을 기다렸다: ${elapsed}ms`
    );
  });

  test('A-3. stop 은 프로세스와 DB 파일을 정리한다', async () => {
    const fs = require('node:fs');
    const s = await startTestServer({ port: 35203 });
    const dbPath = s.dbPath;
    assert.ok(fs.existsSync(dbPath), '전제: DB 파일이 만들어져 있다');

    s.stop();

    assert.ok(!fs.existsSync(dbPath), 'DB 파일이 남았다');
    for (const suffix of ['-wal', '-shm']) {
      assert.ok(!fs.existsSync(dbPath + suffix), `${suffix} 가 남았다`);
    }
  });

  test('A-4. 두 번 stop 해도 던지지 않는다', async () => {
    const s = await startTestServer({ port: 35204 });
    s.stop();
    s.stop(); // after() 훅이 중복 호출돼도 테스트가 깨지면 안 된다
  });
});

describe('B. 격리', () => {
  test('B-1. 서버마다 다른 DB 파일을 쓴다', async () => {
    const a = await startTestServer({ port: 35205 });
    const b = await startTestServer({ port: 35206 });
    try {
      assert.notEqual(a.dbPath, b.dbPath);
      // 한쪽에 넣은 데이터가 다른 쪽에 보이면 안 된다.
      const cats = await (await fetch(`${a.base}/api/categories`)).json();
      const rows = Array.isArray(cats) ? cats : cats.data;
      const cat = rows.find((c) => c.major_type !== '수입').id;

      await fetch(`${a.base}/api/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: '2026-03-01', amount: 1000, category_id: cat }),
      });

      const aTotal = (await (await fetch(`${a.base}/api/transactions`)).json()).total;
      const bTotal = (await (await fetch(`${b.base}/api/transactions`)).json()).total;
      assert.equal(aTotal, 1);
      assert.equal(bTotal, 0, 'DB 가 섞였다');
    } finally {
      a.stop();
      b.stop();
    }
  });
});
