'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// 결제수단을 계좌에 잇는 경로(#376).
//
// 018 이 payment_methods.account_id 를 만들었지만 **그 값을 쓰는 API 가
// 없었다.** 잔액 계산의 `WHERE p.account_id = ?` 가 한 번도 매칭된 적이 없어
// 모든 계좌 잔액이 opening_balance 그대로였다.
//
// 기존 accountsRoute.test.js 가 "거래를 넣으면 잔액이 따라 움직인다" 를
// 검증한다고 적혀 있는데, 연결을 만들 수단이 없어 그 상태를 못 잡았다.
// **그래서 이 파일은 연결을 만든 뒤 잔액이 실제로 움직이는지까지 본다.**

const PORT = 34707;
const BASE = `http://127.0.0.1:${PORT}`;
let server;
let dbPath;
let acctA, acctB, catExpense;

async function api(method, pathname, body) {
  const r = await fetch(`${BASE}${pathname}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* JSON 이 아닐 수 있다 */ }
  return { status: r.status, body: json };
}

before(async () => {
  server = await startTestServer({ port: PORT });
  dbPath = server.dbPath;

  acctA = (await api('POST', '/api/accounts', {
    name: '주거래통장', type: '입출금', opening_balance: 1000000, opening_date: '2026-01-01',
  })).body.id;
  acctB = (await api('POST', '/api/accounts', {
    name: '비상금통장', type: '입출금', opening_balance: 500000, opening_date: '2026-01-01',
  })).body.id;

  const cats = (await api('GET', '/api/categories')).body;
  const rows = Array.isArray(cats) ? cats : cats.data;
  catExpense = rows.find((c) => c.major_type !== '수입').id;
});

after(() => {
  if (server) server.stop();
});

const pmById = async (id) => {
  const rows = (await api('GET', '/api/payment-methods?include_inactive=1')).body;
  return (Array.isArray(rows) ? rows : rows.data).find((r) => r.id === id);
};

const balanceOf = async (id) => (await api('GET', `/api/accounts/${id}`)).body.balance;

describe('A. 등록·수정에서 계좌를 잇는다', () => {
  test('A-1. POST 로 계좌를 지정해 만든다', async () => {
    const res = await api('POST', '/api/payment-methods', {
      name: '연결카드', type: '신용', account_id: acctA,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal((await pmById(res.body.id)).account_id, acctA);
  });

  test('A-2. PUT 으로 나중에 잇는다', async () => {
    const id = (await api('POST', '/api/payment-methods', { name: '나중연결', type: '체크' })).body.id;
    assert.equal((await pmById(id)).account_id, null, '전제: 처음엔 안 이어져 있다');

    const res = await api('PUT', `/api/payment-methods/${id}`, {
      name: '나중연결', type: '체크', account_id: acctB,
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal((await pmById(id)).account_id, acctB);
  });

  test('A-3. 다른 계좌로 옮긴다', async () => {
    const id = (await api('POST', '/api/payment-methods', { name: '이사카드', type: '신용', account_id: acctA })).body.id;
    await api('PUT', `/api/payment-methods/${id}`, { name: '이사카드', type: '신용', account_id: acctB });
    assert.equal((await pmById(id)).account_id, acctB);
  });

  test('A-4. 빈 값으로 연결을 끊는다', async () => {
    const id = (await api('POST', '/api/payment-methods', { name: '끊을카드', type: '신용', account_id: acctA })).body.id;
    await api('PUT', `/api/payment-methods/${id}`, { name: '끊을카드', type: '신용', account_id: '' });
    assert.equal((await pmById(id)).account_id, null);
  });
});

describe('B. 안 보낸 것과 비운 것을 구분한다 — 이 PR 의 함정', () => {
  test('B-1. account_id 를 생략한 PUT 은 연결을 유지한다', async () => {
    // 이 PUT 은 전체 교체다. 생략된 필드를 NULL 로 덮으면 **이름만 고쳐도
    // 계좌 연결이 조용히 끊기고**, 그 결제수단의 거래가 잔액에서 통째로 빠진다.
    const id = (await api('POST', '/api/payment-methods', { name: '유지카드', type: '신용', account_id: acctA })).body.id;

    const res = await api('PUT', `/api/payment-methods/${id}`, { name: '이름만변경', type: '신용' });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const row = await pmById(id);
    assert.equal(row.account_id, acctA, 'PUT 이 계좌 연결을 끊었다');
    assert.equal(row.name, '이름만변경', '이름은 바뀌어야 한다');
  });
});

describe('C. 없는 계좌는 400 이다', () => {
  test('C-1. 존재하지 않는 계좌 id 는 거절한다', async () => {
    // FK 가 켜져 있어 그냥 넣으면 SQLite 가 던지고 500 이 된다. 사용자 입력
    // 오류이므로 400 이어야 한다.
    const res = await api('POST', '/api/payment-methods', { name: '유령', type: '신용', account_id: 99999 });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.ok(!/account_id|FOREIGN KEY|SQLITE/i.test(res.body.error), `내부 용어 노출: ${res.body.error}`);
  });

  test('C-2. 숫자가 아니거나 범위 밖도 거절한다', async () => {
    for (const bad of ['abc', -1, 0, 1.5]) {
      const res = await api('POST', '/api/payment-methods', { name: `불량${bad}`, type: '신용', account_id: bad });
      assert.equal(res.status, 400, `account_id=${bad} 가 통과됐다`);
    }
  });

  test('C-3. 거절돼도 결제수단이 만들어지지 않는다', async () => {
    const before = (await api('GET', '/api/payment-methods?include_inactive=1')).body.length;
    await api('POST', '/api/payment-methods', { name: '안만들어짐', type: '신용', account_id: 99999 });
    const after = (await api('GET', '/api/payment-methods?include_inactive=1')).body.length;
    assert.equal(after, before, '거절됐는데 만들어졌다');
  });

  test('C-4. 없는 결제수단 PUT 은 404', async () => {
    const res = await api('PUT', '/api/payment-methods/99999', { name: 'x', type: '신용' });
    assert.equal(res.status, 404);
  });
});

describe('D. 연결하면 잔액이 실제로 움직인다 — #376 의 이유', () => {
  test('D-1. 연결 전에는 거래가 잔액에 안 잡힌다', async () => {
    const id = (await api('POST', '/api/payment-methods', { name: '잔액테스트', type: '신용' })).body.id;
    const before = await balanceOf(acctA);

    await api('POST', '/api/transactions', {
      date: '2026-03-01', amount: 30000, category_id: catExpense, payment_method_id: id,
    });

    assert.equal(await balanceOf(acctA), before, '안 이어졌는데 잔액이 움직였다');
  });

  test('D-2. 연결하면 그 결제수단의 거래가 잔액에 잡힌다', async () => {
    const id = (await api('POST', '/api/payment-methods', { name: '연결후잔액', type: '체크' })).body.id;
    const before = await balanceOf(acctB);

    await api('POST', '/api/transactions', {
      date: '2026-03-02', amount: 40000, category_id: catExpense, payment_method_id: id,
    });
    assert.equal(await balanceOf(acctB), before, '전제: 아직 안 이어져 있다');

    await api('PUT', `/api/payment-methods/${id}`, { name: '연결후잔액', type: '체크', account_id: acctB });

    assert.equal(await balanceOf(acctB), before - 40000, '연결했는데 잔액이 안 움직였다');
  });
});

describe('E. 계좌를 지우면 연결이 풀린다', () => {
  test('E-1. 삭제 시 account_id 가 NULL 이 되고 결제수단은 남는다', async () => {
    const acctC = (await api('POST', '/api/accounts', {
      name: '지울통장', type: '입출금', opening_balance: 0, opening_date: '2026-01-01',
    })).body.id;
    const id = (await api('POST', '/api/payment-methods', { name: '고아카드', type: '신용', account_id: acctC })).body.id;

    const del = await api('DELETE', `/api/accounts/${acctC}`);
    assert.equal(del.status, 200);
    assert.equal(del.body.unlinked, 1, '푼 연결 수가 안 맞다');

    const row = await pmById(id);
    assert.ok(row, '계좌를 지웠는데 결제수단까지 사라졌다');
    assert.equal(row.account_id, null);
  });
});
