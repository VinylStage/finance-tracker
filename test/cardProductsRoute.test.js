'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// #306 의 저장 경로. 한 카드사에 상품 여러 개가 들어가는지(1:1 제약 없음),
// 카드를 지워도 거래가 남고 미상(NULL)으로 돌아가는지가 핵심이다.

const PORT = 34617; // 다른 테스트와 겹치지 않는 포트
const BASE = `http://127.0.0.1:${PORT}`;
let serverProcess;
let dbPath;
let serverOutput = '';

async function json(pathname, options) {
  const r = await fetch(`${BASE}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return { status: r.status, body: await r.json() };
}

before(async () => {
  dbPath = path.join(os.tmpdir(), `finance-cprod-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  serverProcess = spawn('node', ['src/server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(PORT), DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.on('data', (d) => { serverOutput += d.toString(); });
  serverProcess.stderr.on('data', (d) => { serverOutput += d.toString(); });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {}
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

async function cardIssuerId() {
  const { body } = await json('/api/payment-methods');
  const list = body.data || body;
  return list[0].id;
}

function productBody(over = {}) {
  return JSON.stringify({
    issuer: '하나카드', product_name: '하나 A카드', card_type: '신용', annual_fee: 0, ...over,
  });
}

describe('A. 등록', () => {
  test('A-1. 카드 상품을 등록한다', async () => {
    const pm = await cardIssuerId();
    const res = await json('/api/card-products', {
      method: 'POST', body: productBody({ payment_method_id: pm }),
    });
    assert.equal(res.status, 201);
  });

  test('A-2. 같은 카드사에 두 번째 상품이 들어간다 — 1:1 제약이 없다', async () => {
    const pm = await cardIssuerId();
    const res = await json('/api/card-products', {
      method: 'POST',
      body: productBody({ payment_method_id: pm, product_name: '하나 B카드', card_type: '체크' }),
    });
    assert.equal(res.status, 201);

    const list = await json('/api/card-products');
    assert.equal(list.body.data.length, 2);
  });

  test('A-3. 같은 카드사에 같은 이름은 거부된다', async () => {
    const pm = await cardIssuerId();
    const res = await json('/api/card-products', {
      method: 'POST', body: productBody({ payment_method_id: pm }),
    });
    assert.equal(res.status, 409);
  });

  test('A-4. card_type 이 정본 밖이면 400 이고 내부 값이 새지 않는다', async () => {
    const pm = await cardIssuerId();
    const res = await json('/api/card-products', {
      method: 'POST',
      body: productBody({ payment_method_id: pm, product_name: '엉뚱', card_type: 'credit' }),
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /신용|체크/);
    assert.ok(!/card_type/.test(res.body.error), '내부 컬럼명이 노출됐다');
  });

  test('A-5. 없는 카드사를 지정하면 400', async () => {
    const res = await json('/api/card-products', {
      method: 'POST', body: productBody({ payment_method_id: 99999, product_name: '유령' }),
    });
    assert.equal(res.status, 400);
  });
});

describe('B. 신용/체크 구분', () => {
  test('B-1. 두 종류가 각각 저장된다', async () => {
    const list = await json('/api/card-products');
    const types = list.body.data.map((r) => r.card_type).sort();
    assert.deepEqual(types, ['신용', '체크']);
  });
});

describe('C. 미상 — NULL', () => {
  test('C-1. 카드를 지워도 거래는 남고 미상으로 돌아간다', async () => {
    const list = await json('/api/card-products');
    const target = list.body.data[0];
    const res = await json(`/api/card-products/${target.id}`, { method: 'DELETE' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(typeof res.body.unassigned, 'number');

    const after = await json('/api/card-products');
    assert.equal(after.body.data.length, 1);
  });

  test('C-2. 미지정 신용카드 거래 수를 셀 수 있다', async () => {
    const res = await json('/api/card-products/unassigned-count');
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.unassigned, 'number');
  });
});
