'use strict';
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

// `DELETE /api/transactions` 의 **잠금 가드**.
//
// `deleteAllConfirm.test.js` 는 확인 토큰(#363)만 본다. 잠긴 거래가 있는 상태를
// 한 번도 안 만들어서, 그 뒤의 403 가드(`countLockedAll` · `findLocked`)가
// **한 줄도 안 돌았다**.
//
// 여기가 이 앱에서 제일 파괴적인 경로다. 코드 주석이 실거래 2,212건 유실
// 사고와 감사 FND-01 을 근거로 이 가드를 세웠다고 적어 두었는데, 정작 그
// 가드가 실제로 막는지 확인하는 검사는 없었다.
//
// 그래서 상태 코드만 보지 않는다. **403 뒤에 행 수가 그대로인지**까지 본다 —
// 403 을 돌려주면서 이미 지운 뒤라면 가드가 아니라 알림일 뿐이다.

const PORT = 34996;
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
const del = (b) => json('/api/transactions', { method: 'DELETE', body: JSON.stringify(b) });

let expenseCat;
let methodId;

async function addPlainTx(date = '2026-05-15') {
  const r = await post('/api/transactions', {
    date, category_id: expenseCat, amount: 10000,
    payment_method_id: methodId, merchant: '손으로 적은 거래',
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  return r.body.id;
}

// 잠긴 거래는 직접 만들 수 없다 — 원본(리볼빙)이 파생으로 만들어 준다.
// 그게 이 가드가 지키려는 관계 그 자체다.
async function addLockedTx(month = '2026-05') {
  const r = await post('/api/revolving', {
    month, payment_method_id: methodId, paid_amount: 100000,
    new_charge: 500000, interest: 12000,
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  assert.ok(r.body.derived.created > 0, '파생 수수료 거래가 안 만들어졌다');
  return r.body.id;
}

const countTx = async () => (await json('/api/transactions?limit=500')).body.data.length;

before(async () => {
  server = await startTestServer({ port: PORT });
  const cats = await json('/api/categories');
  const list = cats.body.data || cats.body;
  expenseCat = list.find((c) => c.major_type === '선택지출').id;
  const pms = await json('/api/payment-methods');
  methodId = (pms.body.data || pms.body)[0].id;
});

after(() => { if (server) server.stop(); });

beforeEach(async () => {
  for (const r of (await json('/api/revolving')).body.data) {
    await json(`/api/revolving/${r.id}`, { method: 'DELETE' });
  }
  for (const t of (await json('/api/transactions?limit=500')).body.data) {
    await json(`/api/transactions/${t.id}`, { method: 'DELETE' });
  }
});

describe('전체 삭제 — 잠긴 거래가 있으면 막는다', () => {
  test('토큰이 맞아도 403 이고 한 건도 안 지워진다', async () => {
    await addPlainTx();
    await addLockedTx();
    const before = await countTx();
    assert.ok(before >= 2, '픽스처가 안 만들어졌다');

    const r = await del({ all: true, confirm: 'DELETE_ALL' });

    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    // **여기가 핵심.** 403 을 주면서 이미 지운 뒤면 가드가 아니라 알림이다.
    assert.strictEqual(await countTx(), before, '403 인데 거래가 지워졌다');
  });

  test('거절 문구가 무엇을 어디서 정리해야 하는지 말한다', async () => {
    await addLockedTx();

    const r = await del({ all: true, confirm: 'DELETE_ALL' });

    assert.strictEqual(r.status, 403);
    // 건수를 말해야 사용자가 규모를 안다. "할 수 없어요" 만 있으면 다음 행동이 없다.
    assert.match(r.body.error, /\d+건/);
    assert.match(r.body.error, /할부|리볼빙|부채/);
  });

  test('잠긴 거래가 없으면 전체 삭제가 정상 동작한다 — 대조군', async () => {
    // 가드가 늘 403 을 주는 것과 구분한다. 대조군이 없으면 "항상 막힘" 도 통과한다.
    await addPlainTx();
    await addPlainTx('2026-05-16');

    const r = await del({ all: true, confirm: 'DELETE_ALL' });

    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.deleted, 2);
    assert.strictEqual(await countTx(), 0);
  });
});

describe('선택 삭제 — 잠긴 거래가 섞이면 전부 거부', () => {
  test('한 건이라도 잠겨 있으면 나머지도 안 지운다', async () => {
    // 일부만 지우면 사용자가 무엇이 남았는지 알 수 없다. 부분 성공이 제일 나쁘다.
    const plain = await addPlainTx();
    await addLockedTx();
    const all = (await json('/api/transactions?limit=500')).body.data;
    const locked = all.find((t) => t.id !== plain);
    const before = all.length;

    const r = await del({ ids: [plain, locked.id] });

    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.match(r.body.error, /\d+건/);
    assert.strictEqual(await countTx(), before, '거부했는데 일부가 지워졌다');
  });

  test('잠긴 것만 빼면 나머지는 지워진다 — 대조군', async () => {
    const plain = await addPlainTx();
    await addLockedTx();
    const before = await countTx();

    const r = await del({ ids: [plain] });

    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.deleted, 1);
    assert.strictEqual(await countTx(), before - 1);
  });
});

describe('인자가 없거나 쓸 수 없을 때', () => {
  test('ids 도 all 도 없으면 400 이고 아무것도 안 지운다', async () => {
    await addPlainTx();

    const r = await del({});

    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(await countTx(), 1, '빈 요청에 전부 지워지면 최악이다');
  });

  test('ids 가 전부 숫자가 아니면 400', async () => {
    await addPlainTx();

    const r = await del({ ids: ['어제 산 것', null] });

    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(await countTx(), 1);
  });

  // `Number(true)` 는 `1`, `Number([2])` 는 `2`, `Number(null)` 은 `0` 이라
  // 전부 `Number.isInteger` 를 통과한다. 예전 구현이 `ids.map(Number)` 였고,
  // 그래서 `{ ids: [true] }` 로 부르면 **1번 거래가 지워지고 200 이 돌아왔다**
  // (2026-08-06 실측). 사용자가 고른 적 없는 행이다.
  for (const [label, bad] of [
    ['true → 1', true],
    ['false → 0', false],
    ['null → 0', null],
    ['빈 문자열 → 0', ''],
    ['[2] → 2', [2]],
  ]) {
    test(`강제변환으로 id 가 만들어지지 않는다 (${label})`, async () => {
      const id = await addPlainTx();
      assert.strictEqual(id, 1, '이 검사는 1번 거래가 있어야 의미가 있다');

      const r = await del({ ids: [bad] });

      assert.strictEqual(r.status, 400, JSON.stringify(r.body));
      assert.strictEqual(await countTx(), 1, `${label} 이 거래를 지웠다`);
    });
  }

  test('숫자 문자열은 그대로 받는다 — 막느라 정상 경로를 깨지 않는다', async () => {
    const id = await addPlainTx();

    const r = await del({ ids: [String(id)] });

    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.deleted, 1);
  });
});
