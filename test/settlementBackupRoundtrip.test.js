'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// 백업 → 복원이 settlement 를 흘리지 않는지(#289 설계안 ④).
//
// **이게 없으면 조용히 데이터가 틀어진다.** 백업 내보내기는 컬럼을 명시적으로
// 나열한다. 새 컬럼을 목록에 안 넣으면 복원 후 deferred 였던 거래가 전부
// immediate 로 돌아오고, **통장에서 아직 안 빠진 카드값이 빠진 것으로 계산된다.**
//
// 같은 사고가 #268 에서 이미 있었다 — origin 을 안 내보내 복원 시 파생 거래가
// 전부 manual 이 되어 잠금이 풀렸다. data.js:98 주석이 그 기록이다.
//
// 복원은 **잘못된 settlement 값이 DB 에 들어올 수 있는 유일한 경로**이기도 하다.
// CHECK 를 걸지 않기로 했으므로(#289) 여기서 걸러야 한다.

const PORT = 34703;
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

before(async () => {
  dbPath = path.join(os.tmpdir(), `finance-roundtrip-${process.pid}.db`);
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

const clearAll = () => api('DELETE', '/api/transactions', { all: true, confirm: 'DELETE_ALL' });

async function seedThree() {
  await clearAll();
  await api('POST', '/api/transactions', {
    date: '2026-03-01', amount: 10000, category_id: catId, merchant: '체크카드건',
    settlement: 'immediate',
  });
  await api('POST', '/api/transactions', {
    date: '2026-03-02', amount: 20000, category_id: catId, merchant: '신용카드건',
    settlement: 'deferred', billing_month: '2026-04',
  });
  await api('POST', '/api/transactions', {
    date: '2026-03-15', amount: 20000, category_id: catId, merchant: '카드대금인출',
    settlement: 'settlement', billing_month: '2026-04',
  });
}

const byMerchant = (rows) => Object.fromEntries(rows.map((r) => [r.merchant, r]));

describe('A. 내보내기가 새 필드를 담는다', () => {
  test('A-1. schema_version 이 4 이고 세 필드가 들어 있다', async () => {
    await seedThree();
    const exp = await api('GET', '/api/data/export');

    assert.equal(exp.status, 200);
    assert.equal(exp.body.schema_version, 4, 'schema_version 이 안 올라갔다');

    const m = byMerchant(exp.body.transactions);
    assert.equal(m['신용카드건'].settlement, 'deferred');
    assert.equal(m['신용카드건'].billing_month, '2026-04');
    assert.equal(m['체크카드건'].settlement, 'immediate');
    assert.ok('account_id' in m['체크카드건'], 'account_id 필드가 없다');
  });
});

describe('B. 왕복 — 이 파일의 핵심', () => {
  test('B-1. 내보내고 덮어쓰기 복원해도 settlement 가 보존된다', async () => {
    await seedThree();
    const exported = (await api('GET', '/api/data/export')).body;

    const imp = await api('POST', '/api/data/import', {
      mode: 'overwrite',
      confirm: 'DELETE_ALL',
      transactions: exported.transactions,
    });
    assert.equal(imp.status, 200, JSON.stringify(imp.body));
    assert.equal(imp.body.imported, 3);

    const after = byMerchant((await api('GET', '/api/data/export')).body.transactions);
    assert.equal(after['신용카드건'].settlement, 'deferred', '복원이 deferred 를 잃었다');
    assert.equal(after['신용카드건'].billing_month, '2026-04', '복원이 청구월을 잃었다');
    assert.equal(after['카드대금인출'].settlement, 'settlement');
    assert.equal(after['체크카드건'].settlement, 'immediate');
  });

  test('B-2. 구버전(v3) 백업은 immediate 로 들어온다', async () => {
    // settlement 필드가 아예 없는 백업이다. 구분이 없던 시절의 거래가 그렇게
    // 기록돼 있었으므로 immediate 가 맞다 — 복원이 잔액을 바꾸면 안 된다.
    const legacy = [{
      date: '2026-02-01', merchant: '구버전거래', amount: 5000,
      category_id: catId, memo: null, payment_style: '일시불',
    }];

    const imp = await api('POST', '/api/data/import', {
      mode: 'overwrite', confirm: 'DELETE_ALL', transactions: legacy,
    });
    assert.equal(imp.status, 200, JSON.stringify(imp.body));

    const rows = (await api('GET', '/api/data/export')).body.transactions;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].settlement, 'immediate');
    assert.equal(rows[0].billing_month, null);
  });
});

describe('C. 복원이 잘못된 값을 걸러낸다', () => {
  // CHECK 를 안 걸기로 했으므로(#289) 여기가 마지막 방어선이다. 잘못된 값이
  // 들어가면 잔액 계산의 어느 합계에도 안 잡혀 조용히 사라진다.
  test('C-1. 허용값 밖은 immediate 로 떨어진다', async () => {
    const bad = ['deferred ', 'DEFERRED', 'settled', '', 'immediate; DROP TABLE', 123, null];
    const rows = bad.map((s, i) => ({
      date: '2026-02-01', merchant: `불량${i}`, amount: 1000,
      category_id: catId, settlement: s,
    }));

    const imp = await api('POST', '/api/data/import', {
      mode: 'overwrite', confirm: 'DELETE_ALL', transactions: rows,
    });
    assert.equal(imp.status, 200, JSON.stringify(imp.body));

    const out = (await api('GET', '/api/data/export')).body.transactions;
    assert.equal(out.length, bad.length);
    for (const r of out) {
      assert.equal(r.settlement, 'immediate', `${r.merchant} 가 걸러지지 않았다`);
    }
  });

  test('C-2. 형식이 아닌 billing_month 는 버린다', async () => {
    const rows = [
      { date: '2026-02-01', merchant: '월형식1', amount: 1000, category_id: catId, settlement: 'deferred', billing_month: '2026-4' },
      { date: '2026-02-02', merchant: '월형식2', amount: 1000, category_id: catId, settlement: 'deferred', billing_month: '2026-04-01' },
      { date: '2026-02-03', merchant: '월형식3', amount: 1000, category_id: catId, settlement: 'deferred', billing_month: '2026-04' },
    ];
    const imp = await api('POST', '/api/data/import', {
      mode: 'overwrite', confirm: 'DELETE_ALL', transactions: rows,
    });
    assert.equal(imp.status, 200, JSON.stringify(imp.body));

    const m = byMerchant((await api('GET', '/api/data/export')).body.transactions);
    assert.equal(m['월형식1'].billing_month, null);
    assert.equal(m['월형식2'].billing_month, null);
    assert.equal(m['월형식3'].billing_month, '2026-04', '정상 형식까지 버렸다');
  });

  test('C-3. 없는 계좌를 가리키면 NULL 로 떨어뜨리고 전체를 롤백하지 않는다', async () => {
    const rows = [
      { date: '2026-02-01', merchant: '유령계좌', amount: 1000, category_id: catId, account_id: 99999 },
    ];
    const imp = await api('POST', '/api/data/import', {
      mode: 'overwrite', confirm: 'DELETE_ALL', transactions: rows,
    });

    assert.equal(imp.status, 200, JSON.stringify(imp.body));
    assert.equal(imp.body.imported, 1, '한 건 때문에 전체가 롤백됐다');
    assert.equal(imp.body.fk_fallback, true, 'fk_fallback 이 안 알려졌다');

    const out = (await api('GET', '/api/data/export')).body.transactions;
    assert.equal(out[0].account_id, null);
  });
});

describe('D. API 검증', () => {
  test('D-1. 허용값 밖 settlement 는 400 이고 저장되지 않는다', async () => {
    await clearAll();
    const res = await api('POST', '/api/transactions', {
      date: '2026-03-01', amount: 1000, category_id: catId, settlement: 'nope',
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /settlement/);
    assert.equal((await api('GET', '/api/transactions')).body.total, 0, '거절됐는데 저장됐다');
  });

  test('D-2. 형식이 아닌 billing_month 는 400', async () => {
    const res = await api('POST', '/api/transactions', {
      date: '2026-03-01', amount: 1000, category_id: catId, billing_month: '2026-4',
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /billing_month/);
  });

  test('D-3. 안 보내면 immediate 다 — 기존 클라이언트가 그대로 동작한다', async () => {
    await clearAll();
    const res = await api('POST', '/api/transactions', {
      date: '2026-03-01', amount: 1000, category_id: catId, merchant: '구클라이언트',
    });
    assert.equal(res.status, 201);

    const rows = (await api('GET', '/api/data/export')).body.transactions;
    assert.equal(rows[0].settlement, 'immediate');
  });

  test('D-4. PUT 이 settlement 를 생략해도 기존 값이 유지된다', async () => {
    await clearAll();
    await api('POST', '/api/transactions', {
      date: '2026-03-02', amount: 20000, category_id: catId, merchant: '유지확인',
      settlement: 'deferred', billing_month: '2026-04',
    });
    const id = (await api('GET', '/api/transactions')).body.data[0].id;

    // 메모만 고친다. PUT 이 전체 교체라 생략된 필드가 기본값으로 덮이면
    // deferred 였던 거래의 잔액 취급이 조용히 바뀐다.
    const res = await api('PUT', `/api/transactions/${id}`, {
      date: '2026-03-02', amount: 20000, category_id: catId, merchant: '유지확인', memo: '메모추가',
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const row = (await api('GET', '/api/data/export')).body.transactions[0];
    assert.equal(row.settlement, 'deferred', 'PUT 이 settlement 를 덮었다');
    assert.equal(row.billing_month, '2026-04', 'PUT 이 청구월을 덮었다');
    assert.equal(row.memo, '메모추가');
  });
});
