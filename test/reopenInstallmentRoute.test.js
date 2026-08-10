'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// #295 — 실수로 완료 처리한 할부 되돌리기.
//
// 핵심은 GET 마다 도는 completeExpiredInstallments() 스윕이다. 청구 기간이 끝난
// 할부를 되돌리면 다음 조회에서 즉시 다시 완료가 되어 "되돌리기가 안 먹는다" 로
// 보인다. 그 경우를 되는 것처럼 응답하면 안 된다.

const PORT = 34609;
const BASE = `http://127.0.0.1:${PORT}`;
let server;
let dbPath;

async function json(pathname, options) {
  const r = await fetch(`${BASE}${pathname}`, {
    headers: { 'Content-Type': 'application/json' }, ...options,
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

// 오늘 기준으로 청구 기간이 남은/끝난 할부를 만든다.
function monthsFromNow(n) {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function makeInstallment({ startBillingMonth, months, merchant }) {
  const res = await json('/api/installments', {
    method: 'POST',
    body: JSON.stringify({
      purchase_date: '2026-01-15', merchant, total_amount: 600000,
      months, monthly_amount: 100000, start_billing_month: startBillingMonth,
    }),
  });
  assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  return res.body.id;
}

// 전체 목록은 status 파라미터 없이 부른다. '전체' 는 화면 쪽 표기라 서버에
// 그대로 넘기면 그런 상태가 없어서 0건이 온다.
async function findById(id) {
  const list = await json('/api/installments');
  return list.body.data.find((x) => x.id === id);
}

describe('A. 진행중인 할부 — 되돌릴 수 있다', () => {
  let id;

  test('A-1. 완료 처리하면 목록에서 상태가 바뀐다', async () => {
    // 청구 기간이 아직 남은 할부 (스윕 대상 아님)
    id = await makeInstallment({ startBillingMonth: monthsFromNow(0), months: 12, merchant: '기간남음' });
    await json(`/api/installments/${id}`, { method: 'PUT', body: JSON.stringify({ status: '완료' }) });
    assert.strictEqual((await findById(id)).status, '완료');
  });

  test('A-2. 되돌리면 진행중이 된다', async () => {
    const res = await json(`/api/installments/${id}/reopen`, { method: 'POST', body: '{}' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, '진행중');
    assert.strictEqual((await findById(id)).status, '진행중');
  });

  test('A-3. 되돌린 뒤 다시 조회해도 완료로 뒤집히지 않는다', async () => {
    // 스윕이 GET 마다 돈다. 기간이 남았으면 건드리면 안 된다.
    await json('/api/installments');
    await json('/api/installments');
    assert.strictEqual((await findById(id)).status, '진행중');
  });

  test('A-4. status 외 다른 값이 바뀌지 않는다', async () => {
    // #295 실측: 완료 처리는 순수 플래그 변경이고 되돌리기도 플래그만 되돌린다.
    const row = await findById(id);
    assert.strictEqual(row.total_amount, 600000);
    assert.strictEqual(row.months, 12);
    assert.strictEqual(row.monthly_amount, 100000);
  });

  test('A-5. 파생 거래가 그대로 남는다', async () => {
    const derived = await json(`/api/installments/${id}/derived`);
    assert.strictEqual(derived.body.data.length, 12, '되돌리기가 회차를 건드렸다');
  });
});

describe('B. 청구 기간이 끝난 할부 — 되돌릴 수 없다', () => {
  let id;

  test('B-1. 스윕이 완료로 바꿔 둔다', async () => {
    // 12개월 전에 시작한 6개월 할부 — 이미 끝났다
    id = await makeInstallment({ startBillingMonth: monthsFromNow(-12), months: 6, merchant: '기간끝남' });
    await json('/api/installments');
    assert.strictEqual((await findById(id)).status, '완료');
  });

  test('B-2. can_reopen 이 false 이고 사유가 온다', async () => {
    const row = await findById(id);
    assert.strictEqual(row.can_reopen, false);
    assert.ok(row.reopen_blocked_reason, '사유가 없으면 화면이 왜 막혔는지 설명할 수 없다');
    assert.ok(row.reopen_blocked_reason.includes('청구 기간'));
    assert.ok(row.billing_ends_on);
  });

  test('B-3. 되돌리기를 부르면 409 로 막고 사유를 준다', async () => {
    // 되는 것처럼 응답하고 조용히 되뒤집히면 사용자는 앱을 못 믿게 된다.
    const res = await json(`/api/installments/${id}/reopen`, { method: 'POST', body: '{}' });
    assert.strictEqual(res.status, 409);
    assert.ok(res.body.error.includes('되돌려도'));
    assert.strictEqual((await findById(id)).status, '완료');
  });

  test('B-4. 사유 문구에 내부 용어가 없다', async () => {
    const row = await findById(id);
    for (const bad of ['status', 'can_reopen', 'sweep', 'completeExpired', 'start_billing_month']) {
      assert.ok(!row.reopen_blocked_reason.includes(bad), `내부 용어 노출: ${row.reopen_blocked_reason}`);
    }
  });
});

describe('C. 되돌리기 판정', () => {
  test('C-1. 진행중인 항목은 되돌릴 대상이 아니다', async () => {
    const id = await makeInstallment({ startBillingMonth: monthsFromNow(0), months: 12, merchant: '진행중' });
    const row = await findById(id);
    assert.strictEqual(row.status, '진행중');
    assert.strictEqual(row.can_reopen, false);
    assert.strictEqual(row.reopen_blocked_reason, null, '진행중인데 막힌 사유가 붙었다');

    const res = await json(`/api/installments/${id}/reopen`, { method: 'POST', body: '{}' });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error.includes('이미 진행중'));
  });

  test('C-2. 없는 할부면 404', async () => {
    const res = await json('/api/installments/999999/reopen', { method: 'POST', body: '{}' });
    assert.strictEqual(res.status, 404);
  });

  test('C-3. 청구 종료일을 함께 내려준다', async () => {
    // 화면이 같은 날짜 계산을 다시 하면 스윕 조건과 어긋난다.
    const id = await makeInstallment({ startBillingMonth: '2026-01', months: 6, merchant: '종료일확인' });
    const row = await findById(id);
    assert.strictEqual(row.billing_ends_on, '2026-07-01');
  });
});
