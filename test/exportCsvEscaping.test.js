'use strict';
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

// CSV·JSON 내보내기.
//
// 기존 `exportHeaderInjection.test.js` 는 **빈 DB 로 응답 헤더만** 본다(FND-19).
// 그래서 값을 실제로 쓰는 `csvEscape` 와 `getFullBackup` 이 한 번도 안 돌았다
// (커버리지 실측에서 `src/routes/export.js` 19-24 · 48-69 가 통째로 미커버).
//
// 여기서 잠그는 것.
//   1. RFC 4180 대로 감싸는가 — 안 감싸면 내보낸 파일이 **조용히 짧아진다**
//   2. 전체 백업이 표를 빠뜨리지 않는가 — 빠진 표는 복원 때 사라진다

const PORT = 34992;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

async function json(pathname, options) {
  const r = await fetch(`${BASE}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return { status: r.status, body: await r.json() };
}
const post = (p, b) => json(p, { method: 'POST', body: JSON.stringify(b) });

async function csv(query = '') {
  const r = await fetch(`${BASE}/api/export/csv${query}`);
  return { status: r.status, text: await r.text() };
}

let categoryId;
let methodId;

async function addTx(over = {}) {
  const r = await post('/api/transactions', {
    date: '2026-05-15', category_id: categoryId, amount: 10000,
    payment_method_id: methodId, merchant: '스타벅스', ...over,
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  return r.body.id;
}

before(async () => {
  server = await startTestServer({ port: PORT });
  const cats = await json('/api/categories');
  categoryId = (cats.body.data || cats.body)[0].id;
  const pms = await json('/api/payment-methods');
  methodId = (pms.body.data || pms.body)[0].id;
});

after(() => { if (server) server.stop(); });

beforeEach(async () => {
  const list = await json('/api/transactions?limit=500');
  for (const t of list.body.data) {
    await json(`/api/transactions/${t.id}`, { method: 'DELETE' });
  }
});

describe('A. CSV 값 감싸기 (RFC 4180)', () => {
  test('A-1. 평범한 값은 안 감싼다', async () => {
    await addTx({ merchant: '스타벅스' });

    const r = await csv();

    assert.strictEqual(r.status, 200);
    assert.ok(r.text.includes('스타벅스'), r.text);
    assert.ok(!r.text.includes('"스타벅스"'), '감쌀 이유가 없는데 감쌌다');
  });

  test('A-2. 쉼표가 있으면 감싼다', async () => {
    await addTx({ merchant: '가나,다라' });

    const r = await csv();

    assert.strictEqual(r.status, 200);
    assert.ok(r.text.includes('"가나,다라"'), '쉼표가 있는 값은 감싸야 한다');
    // 안 감싸면 그 한 칸이 두 칸으로 갈라져 이후 열이 전부 한 칸씩 밀린다
  });

  test('A-3. 따옴표는 겹쳐서 감싼다', async () => {
    await addTx({ merchant: '그는 "안녕" 이라 했다' });

    const r = await csv();

    assert.strictEqual(r.status, 200);
    assert.ok(r.text.includes('"그는 ""안녕"" 이라 했다"'), '따옴표가 있는 값은 겹쳐서 감싸야 한다');
  });

  test('A-4. 줄바꿈(LF)이 있으면 감싼다', async () => {
    await addTx({ merchant: '스타벅스\n강남점' });

    const r = await csv();

    assert.strictEqual(r.status, 200);
    assert.ok(r.text.includes('"스타벅스\n강남점"'), '줄바꿈이 있는 값은 감싸야 한다');
  });

  test('A-5. CR 단독도 감싼다 — 카드사 엑셀이 실제로 개행을 들여온다', async () => {
    await addTx({ merchant: '스타벅스\r강남점' });

    const r = await csv();

    assert.strictEqual(r.status, 200);
    assert.ok(r.text.includes('"스타벅스\r강남점"'), 'CR 단독도 감싸야 한다');
    // CR 을 빼먹으면 감싸지 않은 채 나가고 리더에 따라 그 행이 거기서 잘려 **내보낸 파일이 조용히 짧아진다**
  });

  test('A-6. null 과 빈 값은 빈 칸으로 나간다', async () => {
    await addTx({ merchant: '단독가맹점' });

    const r = await csv();

    assert.strictEqual(r.status, 200);
    assert.ok(!r.text.includes('null'), 'null 은 빈 칸으로 나가야 한다');
    // String(null) 이 'null' 이 되어 메모 칸에 그 네 글자가 찍히면 사용자는 자기가 적은 줄 안다
  });
});

describe('B. 전체 백업(JSON)', () => {
  test('B-1. 백업에 표가 하나도 빠지지 않는다', async () => {
    const r = await json('/api/export/json');
    assert.strictEqual(r.status, 200);
    for (const key of [
      'transactions', 'categories', 'payment_methods', 'installments',
      'revolving_history', 'debts', 'debt_interest_log', 'savings_products', 'app_settings',
    ]) {
      assert.ok(Array.isArray(r.body[key]), `${key} 가 배열이 아니다`);
    }
    // 여기서 빠진 표는 복원할 때 통째로 사라진다. 복원 시점에는 이미 늦다
  });

  test('B-2. schema_version 과 범위가 들어간다', async () => {
    const r1 = await json('/api/export/json?from=2026-05-01&to=2026-05-31');
    assert.strictEqual(r1.status, 200);
    assert.ok(r1.body.schema_version !== undefined, 'schema_version 이 있어야 한다');
    assert.deepStrictEqual(r1.body.range, { from: '2026-05-01', to: '2026-05-31' });

    const r2 = await json('/api/export/json');
    assert.strictEqual(r2.status, 200);
    assert.deepStrictEqual(r2.body.range, { from: null, to: null });
    // schema_version 이 없으면 어느 스키마로 복원해야 하는지 알 수 없다
  });

  test('B-3. 범위 밖 거래는 백업에서 빠진다 — 앞뒤 양쪽', async () => {
    // **앞쪽 거래가 반드시 있어야 한다.** 뒤쪽만 두면 `to` 필터 하나로 통과해서,
    // `from` 필터를 통째로 지워도 이 테스트가 그대로 녹색이다(뮤테이션 M6 생존).
    await addTx({ date: '2026-01-10' }); // 범위 앞
    await addTx({ date: '2026-05-15' }); // 범위 안
    await addTx({ date: '2026-09-15' }); // 범위 뒤

    const r = await json('/api/export/json?from=2026-05-01&to=2026-05-31');

    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.transactions.length, 1);
    assert.strictEqual(r.body.transactions[0].date, '2026-05-15');
  });
});

describe('C. 날짜 인자 검증', () => {
  test('C-1. 형식이 틀리면 CSV 는 400', async () => {
    const r = await csv('?from=2026-5-1');
    assert.strictEqual(r.status, 400);
  });

  test('C-2. 형식이 틀리면 JSON 도 400', async () => {
    const r = await json('/api/export/json?to=아무거나');
    assert.strictEqual(r.status, 400);
  });
});
