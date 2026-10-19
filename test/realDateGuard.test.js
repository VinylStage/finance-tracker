'use strict';

// #666 — 저축·할부의 날짜는 «실제로 있는 날짜» 여야 한다. new Date() 는 2026-02-30 을
// 3/2 로 넘겨 통과시켰다. 윤년(2024-02-29)은 받고 평년(2026-02-29)은 거절한다.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const PORT = 21666;
const BASE = `http://127.0.0.1:${PORT}`;
let server;
let pmid;

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

before(async () => {
  server = await startTestServer({ port: PORT });
  const pms = await req('GET', '/api/payment-methods');
  pmid = (Array.isArray(pms.body) ? pms.body : pms.body.data)[0].id;
});

after(() => { if (server) server.stop(); });

const sav = (o) => ({ name: 'p', monthly_contribution: 100000, start_date: '2026-10-01', ...o });
const ins = (o) => ({ purchase_date: '2026-01-05', merchant: 'm', total_amount: 120000, months: 12, monthly_amount: 10000, payment_method_id: pmid, start_billing_month: '2026-02', ...o });

test('저축 시작일: 2월 30일·평년 2월 29일·4월 31일은 400', async () => {
  for (const d of ['2026-02-30', '2026-02-29', '2026-04-31']) {
    const r = await req('POST', '/api/savings', sav({ start_date: d }));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, '시작일은 YYYY-MM-DD 형식의 실제 날짜여야 합니다.');
  }
});

test('저축 시작일: 윤년 2월 29일과 12월 31일은 201', async () => {
  for (const d of ['2024-02-29', '2026-12-31']) {
    const r = await req('POST', '/api/savings', sav({ start_date: d }));
    assert.strictEqual(r.status, 201);
  }
});

test('저축 만기일: 평년 2월 29일은 400', async () => {
  const r = await req('POST', '/api/savings', sav({ maturity_date: '2027-02-29' }));
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.body.error, '만기일은 YYYY-MM-DD 형식의 실제 날짜여야 합니다.');
});

test('할부 구입일: 2월 30일·4월 31일은 400', async () => {
  for (const d of ['2026-02-30', '2026-04-31']) {
    const r = await req('POST', '/api/installments', ins({ purchase_date: d }));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, '구입일은 YYYY-MM-DD 형식의 실제 날짜여야 합니다.');
  }
});

test('할부 구입일: 윤년 2월 29일은 201', async () => {
  const r = await req('POST', '/api/installments', ins({ purchase_date: '2024-02-29' }));
  assert.strictEqual(r.status, 201);
});

test('저축 수정도 없는 날짜를 거절한다', async () => {
  const ok = await req('POST', '/api/savings', sav({}));
  assert.strictEqual(ok.status, 201);
  
  const r = await req('PUT', '/api/savings/' + ok.body.id, { start_date: '2026-06-31' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.body.error, '시작일은 YYYY-MM-DD 형식의 실제 날짜여야 합니다.');
});
