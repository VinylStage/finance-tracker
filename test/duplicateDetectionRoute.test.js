'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// #269 잔여 — 중복 탐지의 HTTP 경로. 핵심은 "자동으로 지우지 않는다" 와
// "프리뷰를 건너뛸 수 없다" 두 가지다.

const PORT = 34608;
const BASE = `http://127.0.0.1:${PORT}`;
let serverProcess;
let dbPath;
let serverOutput = '';

async function json(pathname, options) {
  const r = await fetch(`${BASE}${pathname}`, {
    headers: { 'Content-Type': 'application/json' }, ...options,
  });
  return { status: r.status, body: await r.json() };
}

before(async () => {
  dbPath = path.join(os.tmpdir(), `finance-dup-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  serverProcess = spawn('node', ['src/server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(PORT), DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.on('data', (d) => { serverOutput += d.toString(); });
  serverProcess.stderr.on('data', (d) => { serverOutput += d.toString(); });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`서버가 15초 안에 기동하지 않음:\n${serverOutput}`);
});

after(() => {
  if (serverProcess) serverProcess.kill();
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix); } catch {}
  }
});

async function firstCategoryId() {
  const cats = await json('/api/categories');
  return (cats.body.data || cats.body)[0].id;
}

async function seedDuplicate() {
  const category_id = await firstCategoryId();
  // 사용자가 예전에 할부 구매를 직접 거래로 넣어 둔 상황
  const tx = await json('/api/transactions', {
    method: 'POST',
    body: JSON.stringify({
      date: '2026-07-06', category_id, amount: 232897,
      merchant: '예스이십사(주)', payment_style: '할부',
    }),
  });
  // 같은 구매를 할부로 등록
  const inst = await json('/api/installments', {
    method: 'POST',
    body: JSON.stringify({
      purchase_date: '2026-07-06', merchant: '예스이십사 주식회사',
      total_amount: 232897, months: 6, monthly_amount: 38817,
      start_billing_month: '2026-08',
    }),
  });
  return { txId: tx.body.id, instId: inst.body.id };
}

describe('A. 탐지 조회', () => {
  test('A-1. 표기가 달라도 같은 가게로 잡는다', async () => {
    const { txId } = await seedDuplicate();
    const res = await json('/api/installments/duplicates');
    assert.strictEqual(res.status, 200);
    const found = res.body.data.find((c) => c.transaction.id === txId);
    assert.ok(found, '"예스이십사(주)" 와 "예스이십사 주식회사" 가 안 엮였다');
    assert.strictEqual(found.confidence, 'exact');
    assert.strictEqual(res.body.total_amount >= 232897, true);
  });

  test('A-2. 파생 거래는 후보에 없다', async () => {
    const res = await json('/api/installments/duplicates');
    assert.ok(res.body.data.every((c) => c.transaction.payment_style !== undefined));
    // 할부 등록이 만든 회차는 origin='installment' 라 애초에 조회되지 않는다
    const derivedAmounts = res.body.data.map((c) => c.transaction.amount);
    assert.ok(!derivedAmounts.includes(38816), '파생 회차가 후보로 잡혔다');
  });

  test('A-3. 조회만으로는 아무것도 지워지지 않는다', async () => {
    const before = await json('/api/transactions?limit=500');
    await json('/api/installments/duplicates');
    const after = await json('/api/transactions?limit=500');
    assert.strictEqual(after.body.total, before.body.total);
  });

  test('A-4. 잘못된 기간을 막는다', async () => {
    for (const q of ['days=-1', 'days=400', 'days=abc']) {
      const res = await json(`/api/installments/duplicates?${q}`);
      assert.strictEqual(res.status, 400, q);
    }
  });
});

describe('B. 프리뷰 우회 차단', () => {
  let txId;

  test('B-1. 지문 없이 지우면 428', async () => {
    ({ txId } = await seedDuplicate());
    const res = await json('/api/installments/duplicates/resolve', {
      method: 'POST', body: JSON.stringify({ delete_ids: [txId] }),
    });
    assert.strictEqual(res.status, 428);
    assert.strictEqual(res.body.preview_required, true);

    const still = await json(`/api/transactions/${txId}`);
    assert.strictEqual(still.status, 200, '막혔는데 지워졌다');
  });

  test('B-2. 낡은 지문은 409', async () => {
    const preview = await json('/api/installments/duplicates/preview', {
      method: 'POST', body: JSON.stringify({ ids: [txId] }),
    });
    // 프리뷰 이후 대상이 바뀐 상황. PUT 은 전체 본문을 요구하므로 현재 값을
    // 읽어 금액만 바꿔 보낸다.
    const cur = await json(`/api/transactions/${txId}`);
    const put = await json(`/api/transactions/${txId}`, {
      method: 'PUT',
      body: JSON.stringify({
        date: cur.body.date, category_id: cur.body.category_id, amount: 1,
        payment_method_id: cur.body.payment_method_id, payment_style: cur.body.payment_style,
        merchant: cur.body.merchant, memo: cur.body.memo,
      }),
    });
    assert.strictEqual(put.status, 200, `수정이 안 됐으면 이 테스트가 무의미하다: ${JSON.stringify(put.body)}`);
    const res = await json('/api/installments/duplicates/resolve', {
      method: 'POST',
      body: JSON.stringify({ delete_ids: [txId], preview_token: preview.body.data.fingerprint }),
    });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.preview_stale, true);
  });

  test('B-3. 지문이 맞으면 지워진다', async () => {
    const preview = await json('/api/installments/duplicates/preview', {
      method: 'POST', body: JSON.stringify({ ids: [txId] }),
    });
    const res = await json('/api/installments/duplicates/resolve', {
      method: 'POST',
      body: JSON.stringify({ delete_ids: [txId], preview_token: preview.body.data.fingerprint }),
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.deleted, 1);

    const gone = await json(`/api/transactions/${txId}`);
    assert.strictEqual(gone.status, 404);
  });

  test('B-4. 파생 거래를 지우려 하면 막는다', async () => {
    const { instId } = await seedDuplicate();
    const derived = await json(`/api/installments/${instId}/derived`);
    const res = await json('/api/installments/duplicates/resolve', {
      method: 'POST', body: JSON.stringify({ delete_ids: [derived.body.data[0].id] }),
    });
    assert.strictEqual(res.status, 400);
    assert.ok(!/origin|derived/.test(res.body.error), `내부 용어 노출: ${res.body.error}`);
  });
});

describe('C. 중복이 아니라는 판단', () => {
  test('C-1. 남겨 두면 다음부터 목록에서 빠진다', async () => {
    const { txId } = await seedDuplicate();
    const before = await json('/api/installments/duplicates');
    assert.ok(before.body.data.some((c) => c.transaction.id === txId));

    const res = await json('/api/installments/duplicates/resolve', {
      method: 'POST', body: JSON.stringify({ keep_ids: [txId] }),
    });
    assert.strictEqual(res.body.kept, 1);
    assert.strictEqual(res.body.deleted, 0);

    const after = await json('/api/installments/duplicates');
    assert.ok(!after.body.data.some((c) => c.transaction.id === txId));

    // 거래는 그대로 있다
    assert.strictEqual((await json(`/api/transactions/${txId}`)).status, 200);
  });

  test('C-2. 판단을 되돌리면 다시 나온다', async () => {
    const list = await json('/api/installments/duplicates');
    const seed = await seedDuplicate();
    await json('/api/installments/duplicates/resolve', {
      method: 'POST', body: JSON.stringify({ keep_ids: [seed.txId] }),
    });
    const res = await json('/api/installments/duplicates/restore', {
      method: 'POST', body: JSON.stringify({ ids: [seed.txId] }),
    });
    assert.strictEqual(res.body.restored, 1);

    const after = await json('/api/installments/duplicates');
    assert.ok(after.body.data.some((c) => c.transaction.id === seed.txId));
    assert.ok(list.status === 200);
  });

  test('C-3. 아무것도 안 고르면 아무 일도 없다', async () => {
    const res = await json('/api/installments/duplicates/resolve', {
      method: 'POST', body: JSON.stringify({}),
    });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual([res.body.deleted, res.body.kept], [0, 0]);
  });
});
