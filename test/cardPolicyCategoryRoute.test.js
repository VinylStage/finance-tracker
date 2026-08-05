'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// #315 의 저장 경로. 카테고리 예외가 기본 정책과 같은 조합으로 들어갈 수 있고,
// 같은 범위 안에서는 중복이 거부되는지가 핵심이다. 부분 유니크 인덱스가
// 실제 서버 경로에서도 작동하는지 확인한다.

const PORT = 34611; // 다른 테스트와 겹치지 않는 포트
const BASE = `http://127.0.0.1:${PORT}`;
let server;
let dbPath;

async function json(pathname, options) {
  const r = await fetch(`${BASE}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return { status: r.status, body: await r.json() };
}

before(async () => {
  server = await startTestServer({ port: PORT });
  dbPath = server.dbPath;
});

after(() => {
  if (server) server.stop();
});

async function ids() {
  const pm = await json('/api/payment-methods');
  const cats = await json('/api/categories');
  const pmList = pm.body.data || pm.body;
  const catList = cats.body.data || cats.body;
  return { cardId: pmList[0].id, catA: catList[0].id, catB: catList[1].id };
}

function policyBody(over = {}) {
  return JSON.stringify({
    months: 6, policy_type: '무이자', annual_rate: 0,
    effective_from: '2026-01-01', ...over,
  });
}

describe('A. 카테고리 없는 기존 동작', () => {
  test('A-1. category_id 를 안 보내면 기본 정책으로 저장된다', async () => {
    const { cardId } = await ids();
    const res = await json('/api/card-policies', {
      method: 'POST',
      body: policyBody({ payment_method_id: cardId }),
    });
    assert.equal(res.status, 201);

    const list = await json('/api/card-policies');
    const rows = list.body.data || list.body;
    const saved = rows.find((r) => r.months === 6);
    assert.ok(saved, '저장된 정책이 조회되지 않는다');
    assert.equal(saved.category_id, null);
  });

  test('A-2. 같은 조합의 기본 정책 중복은 거부된다', async () => {
    const { cardId } = await ids();
    const res = await json('/api/card-policies', {
      method: 'POST',
      body: policyBody({ payment_method_id: cardId }),
    });
    // NULL 유니크 함정을 막았다면 여기서 성공하면 안 된다.
    assert.notEqual(res.status, 201);
  });
});

describe('B. 카테고리 예외', () => {
  test('B-1. 기본 정책과 같은 조합으로 카테고리 예외가 들어간다', async () => {
    const { cardId, catA } = await ids();
    const res = await json('/api/card-policies', {
      method: 'POST',
      body: policyBody({
        payment_method_id: cardId, category_id: catA,
        policy_type: '부분무이자', free_from_sequence: 3,
      }),
    });
    assert.equal(res.status, 201);

    const list = await json('/api/card-policies');
    const rows = (list.body.data || list.body).filter((r) => r.months === 6);
    assert.equal(rows.length, 2);
    assert.equal(rows.filter((r) => r.category_id === catA).length, 1);
    assert.equal(rows.filter((r) => r.category_id === null).length, 1);
  });

  test('B-2. 같은 카테고리 예외 중복은 거부된다', async () => {
    const { cardId, catA } = await ids();
    const res = await json('/api/card-policies', {
      method: 'POST',
      body: policyBody({ payment_method_id: cardId, category_id: catA }),
    });
    assert.notEqual(res.status, 201);
  });

  test('B-3. 다른 카테고리는 같은 조합으로 들어간다', async () => {
    const { cardId, catB } = await ids();
    const res = await json('/api/card-policies', {
      method: 'POST',
      body: policyBody({
        payment_method_id: cardId, category_id: catB,
        policy_type: '유이자', annual_rate: 15.9,
      }),
    });
    assert.equal(res.status, 201);
  });
});

describe('C. 응답에 category_id 가 실린다', () => {
  test('C-1. 목록 조회가 category_id 를 담는다', async () => {
    const list = await json('/api/card-policies');
    const rows = list.body.data || list.body;
    assert.ok(rows.every((r) => 'category_id' in r), 'category_id 가 응답에 없다');
  });
});
