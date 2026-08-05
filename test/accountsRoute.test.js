'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

// #288 의 저장·조회 경로. 잔액을 저장하지 않고 매번 계산하므로, 거래를 넣었을 때
// 잔액이 따라 움직이는지와 계좌를 지워도 거래가 남는지가 핵심이다.

const PORT = 34623; // 다른 테스트와 겹치지 않는 포트
let server;

async function json(pathname, options) {
  const r = await fetch(`${server.base}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return { status: r.status, body: await r.json() };
}

before(async () => {
  server = await startTestServer({ port: PORT });
});

after(() => {
  server.stop();
});

const acct = (over = {}) => JSON.stringify({
  name: '주거래통장', type: '입출금', opening_balance: 1000000,
  opening_date: '2026-01-01', ...over,
});

describe('A. 등록', () => {
  test('A-1. 계좌를 등록한다', async () => {
    const res = await json('/api/accounts', { method: 'POST', body: acct() });
    assert.equal(res.status, 201);
  });

  test('A-2. 같은 이름은 거부된다', async () => {
    const res = await json('/api/accounts', { method: 'POST', body: acct() });
    assert.equal(res.status, 409);
  });

  test('A-3. 종류가 정본 밖이면 400 이고 내부 값이 새지 않는다', async () => {
    const res = await json('/api/accounts', {
      method: 'POST', body: acct({ name: '엉뚱', type: 'checking' }),
    });
    assert.equal(res.status, 400);
    assert.ok(!/type|account/.test(res.body.error), `내부 키 노출: ${res.body.error}`);
  });

  test('A-4. 기준일 형식이 틀리면 400', async () => {
    const res = await json('/api/accounts', {
      method: 'POST', body: acct({ name: '날짜불량', opening_date: '2026/01/01' }),
    });
    assert.equal(res.status, 400);
  });
});

describe('B. 잔액은 계산된다', () => {
  test('B-1. 거래가 없으면 기준 잔액 그대로다', async () => {
    const list = await json('/api/accounts');
    const id = list.body.data[0].id;
    const res = await json(`/api/accounts/${id}`);
    assert.equal(res.body.balance, 1000000);
    assert.equal(res.body.counted, 0);
  });

  test('B-2. 마이너스통장은 한도만큼 더 쓸 수 있다', async () => {
    const created = await json('/api/accounts', {
      method: 'POST',
      body: acct({ name: '마이너스통장', type: '마이너스통장', opening_balance: -500000, credit_limit: 3000000 }),
    });
    assert.equal(created.status, 201);

    const res = await json(`/api/accounts/${created.body.id}`);
    assert.equal(res.body.balance, -500000);
    assert.equal(res.body.available, 2500000);
  });

  test('B-3. 한도가 없으면 가용 금액이 잔액과 같다', async () => {
    const list = await json('/api/accounts');
    const plain = list.body.data.find((a) => a.name === '주거래통장');
    const res = await json(`/api/accounts/${plain.id}`);
    assert.equal(res.body.available, res.body.balance);
  });

  test('B-4. 잔액 목록을 한 번에 조회한다', async () => {
    const res = await json('/api/accounts/balances');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 2);
    assert.ok(res.body.data.every((a) => typeof a.balance === 'number'));
  });

  test('B-5. balances 경로가 :id 에 가려지지 않는다', async () => {
    // 라우트를 뒤에 두면 'balances' 가 id 로 잡혀 404 가 된다.
    const res = await json('/api/accounts/balances');
    assert.ok(Array.isArray(res.body.data), '목록이 아니라 단건이 왔다');
  });
});

describe('C. 삭제', () => {
  test('C-1. 계좌를 지워도 결제수단은 남고 연결만 끊긴다', async () => {
    const list = await json('/api/accounts');
    const target = list.body.data.find((a) => a.name === '마이너스통장');
    const before = await json('/api/payment-methods');
    const beforeCount = (before.body.data || before.body).length;

    const res = await json(`/api/accounts/${target.id}`, { method: 'DELETE' });
    assert.equal(res.status, 200);

    const after = await json('/api/payment-methods');
    assert.equal((after.body.data || after.body).length, beforeCount);
  });

  test('C-2. 없는 계좌를 조회하면 404', async () => {
    const res = await json('/api/accounts/99999');
    assert.equal(res.status, 404);
  });
});

// 같은 이름으로 두 번 만들면 409 를 내는 자리가 비어 있었다. 계좌 이름은 UNIQUE
// 라 두 번째 INSERT 가 예외를 던지는데, 그 예외를 409 로 바꾸는 분기가
// 확인되지 않았다. 안 잡히면 사용자에게 500 이 나간다.
test('J-1. 같은 이름의 계좌를 또 만들면 409 다', async () => {
  const name = `중복검증-${Date.now()}`;
  const body = { name, type: '입출금', opening_balance: 0, opening_date: '2026-01-01' };

  const first = await json('/api/accounts', { method: 'POST', body: JSON.stringify(body) });
  assert.strictEqual(first.status, 201, JSON.stringify(first.body));

  const second = await json('/api/accounts', { method: 'POST', body: JSON.stringify(body) });
  assert.strictEqual(second.status, 409, JSON.stringify(second.body));
  assert.ok(second.body.error, '거부 사유가 없다');
  assert.ok(!/UNIQUE|constraint|SQLITE/i.test(second.body.error),
    `DB 오류가 그대로 노출됐다: ${second.body.error}`);
});

test('J-2. 필수 값이 빠지면 400 이다', async () => {
  const full = { name: `필수검증-${Date.now()}`, type: '입출금', opening_date: '2026-01-01' };
  for (const drop of ['name', 'type', 'opening_date']) {
    const b = { ...full };
    delete b[drop];
    const r = await json('/api/accounts', { method: 'POST', body: JSON.stringify(b) });
    assert.strictEqual(r.status, 400, `${drop} 를 빼도 통과했다: ${JSON.stringify(r.body)}`);
    for (const bad of ['opening_date', 'name', 'type']) {
      assert.ok(!r.body.error.includes(bad), `문구에 내부 필드명 노출: ${r.body.error}`);
    }
  }
});

// 생성뿐 아니라 **수정**에도 같은 UNIQUE 처리가 있는데 그쪽이 비어 있었다.
// 이미 있는 이름으로 바꾸면 사용자에게 500 이 나간다.
test('J-3. 다른 계좌와 같은 이름으로 바꾸면 409 다', async () => {
  const stamp = Date.now();
  const a = await json('/api/accounts', {
    method: 'POST',
    body: JSON.stringify({ name: `A-${stamp}`, type: '입출금', opening_date: '2026-01-01' }),
  });
  const b = await json('/api/accounts', {
    method: 'POST',
    body: JSON.stringify({ name: `B-${stamp}`, type: '입출금', opening_date: '2026-01-01' }),
  });
  assert.strictEqual(a.status, 201, JSON.stringify(a.body));
  assert.strictEqual(b.status, 201, JSON.stringify(b.body));

  const r = await json(`/api/accounts/${b.body.id}`, {
    method: 'PUT',
    body: JSON.stringify({ name: `A-${stamp}`, type: '입출금', opening_date: '2026-01-01' }),
  });
  assert.strictEqual(r.status, 409, JSON.stringify(r.body));
  assert.ok(r.body.error, '거부 사유가 없다');
  assert.ok(!/UNIQUE|constraint|SQLITE/i.test(r.body.error), `DB 오류 노출: ${r.body.error}`);
});
