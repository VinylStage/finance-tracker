'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// #316 — 할부의 가맹점 카테고리로 정책을 고른다.
//
// #315 가 정책에 카테고리 차원을 넣었지만 할부 쪽에 카테고리가 없어서 그 인자를
// 채울 수가 없었다. 정책은 카테고리별로 등록되는데 조회는 항상 기본 정책으로만
// 떨어져, 만들어 둔 차원이 한 번도 쓰이지 않는 상태였다.
//
// 여기서 잠그는 것은 "카테고리 예외가 실제로 적용되는가" 와, 더 중요하게는
// **비어 있을 때 엉뚱한 정책이 걸리지 않는가** 다.

let pmId;
let onlineCatId;
let otherCatId;

const PORT = 34613;
const BASE = `http://127.0.0.1:${PORT}`;
let server;
let dbPath;

async function json(pathname, options) {
  const r = await fetch(`${BASE}${pathname}`, {
    headers: { 'Content-Type': 'application/json' }, ...options,
  });
  return { status: r.status, body: await r.json() };
}
const post = (p, body) => json(p, { method: 'POST', body: JSON.stringify(body) });

before(async () => {
  server = await startTestServer({ port: PORT });
  dbPath = server.dbPath;

  // 픽스처를 같은 훅 안에서 세운다. node:test 는 같은 레벨의 before 를 여러 개
  // 두면 뒤엣것이 앞엣것을 덮는다 — 서버 기동이 통째로 건너뛰어진다.
  const pm = await post('/api/payment-methods', { name: '카테고리테스트카드', type: '신용' });
  pmId = pm.body.id;

  const cats = (await json('/api/categories')).body;
  const list = cats.data || cats;
  const spend = list.filter((c) => c.major_type !== '수입');
  onlineCatId = spend[0].id;
  otherCatId = spend[1].id;

  // 기본 정책: 6개월 유이자 19.9%
  await post('/api/card-policies', {
    payment_method_id: pmId, months: 6, policy_type: '유이자',
    annual_rate: 19.9, effective_from: '2026-01-01',
  });
  // 카테고리 예외: 같은 카드·같은 개월수인데 무이자
  await post('/api/card-policies', {
    payment_method_id: pmId, months: 6, policy_type: '무이자',
    annual_rate: 0, effective_from: '2026-01-01', category_id: onlineCatId,
  });
});

after(() => {
  if (server) server.stop();
});

const REQ = {
  purchase_date: '2026-07-10', merchant: '카테고리검증', total_amount: 1200000,
  months: 6, monthly_amount: 200000, start_billing_month: '2026-08',
};

async function derivedTotals(id) {
  const d = await json(`/api/installments/${id}/derived`);
  const rows = d.body.data;
  return { count: rows.length, sum: rows.reduce((s, r) => s + r.amount, 0) };
}

describe('A. 카테고리 예외가 적용된다', () => {
  test('A-1. 예외 카테고리를 고르면 무이자로 계산된다', async () => {
    const r = await post('/api/installments', { ...REQ, payment_method_id: pmId, category_id: onlineCatId });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const t = await derivedTotals(r.body.id);
    assert.strictEqual(t.count, 6);
    assert.strictEqual(t.sum, 1200000, '무이자 예외인데 수수료가 붙었다');
  });

  test('A-2. 예외가 없는 카테고리는 기본 정책(유이자)으로 떨어진다', async () => {
    const r = await post('/api/installments', { ...REQ, payment_method_id: pmId, category_id: otherCatId });
    const t = await derivedTotals(r.body.id);
    assert.ok(t.sum > 1200000, `기본 정책이면 수수료가 붙어야 한다: ${t.sum}`);
  });

  test('A-3. 카테고리를 안 고르면 기본 정책만 본다', async () => {
    // 비어 있는 것을 아무 카테고리로 채우면 엉뚱한 예외가 걸린다.
    const r = await post('/api/installments', { ...REQ, payment_method_id: pmId });
    const t = await derivedTotals(r.body.id);
    assert.ok(t.sum > 1200000, `카테고리 없음은 기본 정책이어야 한다: ${t.sum}`);
  });

  test('A-4. 저장된 값이 되돌아온다', async () => {
    const r = await post('/api/installments', { ...REQ, payment_method_id: pmId, category_id: onlineCatId });
    const list = (await json('/api/installments')).body.data;
    const row = list.find((x) => x.id === r.body.id);
    assert.strictEqual(row.category_id, onlineCatId);
  });
});

describe('B. 카테고리를 바꾸면 회차가 다시 만들어진다', () => {
  // 카테고리가 바뀌면 정책이 바뀌고 수수료가 달라진다. 재생성하지 않으면
  // 화면에 남은 청구 내역이 조용히 낡은 값이 된다.
  let id;

  before(async () => {
    const r = await post('/api/installments', { ...REQ, payment_method_id: pmId, category_id: otherCatId });
    id = r.body.id;
  });

  test('B-1. 프리뷰 없이 카테고리를 바꾸면 428 로 막는다', async () => {
    const r = await json(`/api/installments/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...REQ, payment_method_id: pmId, category_id: onlineCatId }),
    });
    assert.strictEqual(r.status, 428, JSON.stringify(r.body));
    assert.strictEqual(r.body.preview_required, true);
  });

  test('B-2. 프리뷰를 거치면 무이자로 다시 만들어진다', async () => {
    const before = await derivedTotals(id);
    assert.ok(before.sum > 1200000, '전제: 기본 정책이라 수수료가 있어야 한다');

    const prev = await post(`/api/installments/${id}/derived/preview`, {
      ...REQ, payment_method_id: pmId, category_id: onlineCatId,
    });
    assert.strictEqual(prev.status, 200, JSON.stringify(prev.body));

    const r = await json(`/api/installments/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...REQ, payment_method_id: pmId, category_id: onlineCatId,
        preview_token: prev.body.data.fingerprint,
      }),
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));

    const after = await derivedTotals(id);
    assert.strictEqual(after.sum, 1200000, '카테고리를 바꿨는데 수수료가 그대로다');
  });
});

describe('C. 기존 할부', () => {
  test('C-1. 카테고리가 없어도 동작이 바뀌지 않는다', async () => {
    // 마이그레이션이 기존 행에 아무 카테고리도 넣지 않는다. 넣었다면 과거
    // 할부의 청구액이 소급해서 움직였을 것이다.
    const r = await post('/api/installments', { ...REQ, payment_method_id: pmId });
    const list = (await json('/api/installments')).body.data;
    const row = list.find((x) => x.id === r.body.id);
    assert.strictEqual(row.category_id, null);
  });
});
