'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// `DELETE /api/transactions {all: true}` 의 확인 토큰(#363).
//
// 같은 일(거래 전체 삭제)을 하는 `POST /api/data/import?mode=overwrite` 는
// 이미 `confirm: 'DELETE_ALL'` 을 요구하는데 이쪽만 무방비였다. 화면의 확인
// 대화상자는 API 를 직접 부르면 우회된다 — #307 이 묻는 것이 정확히 그것이고,
// 점검에서 실제로 우회됐다.
//
// 이 저장소는 실거래 2,212건 유실 사고를 겪었다. **거절될 때 한 건도 지워지지
// 않는 것**이 이 파일의 핵심이다. 400 만 확인하고 데이터를 안 보면, 지우고 나서
// 400 을 주는 구현도 통과한다.

const PORT = 34702;
const BASE = `http://127.0.0.1:${PORT}`;
let serverProcess;
let serverOutput = '';
let dbPath;
let catId;

async function api(method, url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* JSON 이 아닐 수 있다 */ }
  return { status: res.status, body: json };
}

const txTotal = async () => (await api('GET', '/api/transactions')).body.total;

async function seed(n) {
  for (let i = 1; i <= n; i++) {
    const r = await api('POST', '/api/transactions', {
      date: `2026-03-${String(i).padStart(2, '0')}`,
      amount: 10000 + i,
      category_id: catId,
      merchant: `가맹점${i}`,
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  }
}

before(async () => {
  dbPath = path.join(os.tmpdir(), `finance-delall-${process.pid}.db`);
  serverProcess = spawn('node', ['src/server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(PORT), DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.on('data', (d) => { serverOutput += d.toString(); });
  serverProcess.stderr.on('data', (d) => { serverOutput += d.toString(); });
  serverProcess.on('exit', (code, signal) => { serverOutput += `\n[server exited] code=${code} signal=${signal}\n`; });

  const deadline = Date.now() + 15000;
  let up = false;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) { up = true; break; }
    } catch { /* 아직 기동 전 */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!up) throw new Error(`서버가 15초 안에 기동하지 않음. 서버 출력:\n${serverOutput || '(출력 없음)'}`);

  const cats = await api('GET', '/api/categories');
  const rows = Array.isArray(cats.body) ? cats.body : cats.body.data;
  catId = rows[0].id;
});

after(() => {
  if (serverProcess) serverProcess.kill();
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix); } catch { /* 이미 없을 수 있다 */ }
  }
});

describe('A. 확인 토큰이 없으면 거절하고 아무것도 지우지 않는다', () => {
  test('A-1. 토큰 없이 호출하면 400 이고 데이터가 그대로다', async () => {
    await seed(3);
    assert.equal(await txTotal(), 3);

    const res = await api('DELETE', '/api/transactions', { all: true });

    assert.equal(res.status, 400, JSON.stringify(res.body));
    // 400 만 보면 "지우고 나서 400 을 주는" 구현도 통과한다. 데이터를 본다.
    assert.equal(await txTotal(), 3, '거절됐는데 거래가 지워졌다');
  });

  test('A-2. 틀린 토큰도 거절한다', async () => {
    assert.equal(await txTotal(), 3);

    for (const bad of ['delete_all', 'DELETE ALL', 'OVERWRITE_SETTINGS', '', null, true, 1]) {
      const res = await api('DELETE', '/api/transactions', { all: true, confirm: bad });
      assert.equal(res.status, 400, `confirm=${JSON.stringify(bad)} 가 통과됐다`);
    }

    assert.equal(await txTotal(), 3, '거절됐는데 거래가 지워졌다');
  });

  test('A-3. 거절 메시지에 내부 용어가 없다', async () => {
    const res = await api('DELETE', '/api/transactions', { all: true });
    assert.match(res.body.error, /확인/);
    assert.ok(
      !/confirm|DELETE_ALL|token|payload/i.test(res.body.error),
      `내부 용어 노출: ${res.body.error}`
    );
  });
});

describe('B. 토큰이 맞으면 기존대로 동작한다', () => {
  test('B-1. DELETE_ALL 이면 전부 지워진다', async () => {
    assert.equal(await txTotal(), 3);

    const res = await api('DELETE', '/api/transactions', { all: true, confirm: 'DELETE_ALL' });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.ok, true);
    assert.equal(res.body.deleted, 3);
    assert.equal(await txTotal(), 0);
  });
});

describe('C. 선택 삭제는 토큰을 요구하지 않는다', () => {
  // 사용자가 고른 것이라 ADR 0008 의 "한 건씩 하는 CRUD" 에 가깝다. 여기에
  // 토큰을 요구하면 목록에서 지우는 기본 동작이 망가진다.
  test('C-1. ids 로 지우는 경로는 그대로다', async () => {
    await seed(2);
    const list = (await api('GET', '/api/transactions')).body;
    const ids = list.data.map((r) => r.id);
    assert.equal(ids.length, 2);

    const res = await api('DELETE', '/api/transactions', { ids: [ids[0]] });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(await txTotal(), 1);
  });
});
