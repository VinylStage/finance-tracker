'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

// #269 의 HTTP 경로 검증. 서비스 단위 테스트(derived-transactions.test.js)가
// 계산을 고정한다면 여기서는 "API 를 직접 호출해 프리뷰를 건너뛸 수 있는가" 를
// 본다 — ADR 0008 이 "지켜지지 않을 수 있는 지점" 으로 지목한 바로 그 경로다.

const PORT = 34605; // 다른 테스트와 겹치지 않는 포트 (현재 최대는 34604)
const BASE = `http://127.0.0.1:${PORT}`;
let server;

// Get current date for tests
const today = new Date();
const CUR_MONTH = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
const TODAY = `${CUR_MONTH}-${String(today.getDate()).padStart(2, '0')}`;

function api(pathname, options) {
  return fetch(`${BASE}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
}

async function json(pathname, options) {
  const r = await api(pathname, options);
  return { status: r.status, body: await r.json() };
}

before(async () => {
  server = await startTestServer({ port: PORT });
  
  // 기존 before 안에 있던 나머지 준비 작업
  const { body } = await json('/api/payment-methods');
  globalThis.paymentMethodId = (Array.isArray(body) ? body : body.data).find((p) => p.name === '신용카드').id;
});

after(() => {
  if (server) server.stop();
});

async function firstCardId() {
  return globalThis.paymentMethodId;
}

async function createInstallment(over = {}) {
  const payment_method_id = await firstCardId();
  const { status, body } = await json('/api/installments', {
    method: 'POST',
    body: JSON.stringify({
      purchase_date: '2026-01-15', merchant: '테스트구매', total_amount: 1200000,
      months: 12, monthly_amount: 100000, payment_method_id,
      start_billing_month: '2026-02', ...over,
    }),
  });
  assert.strictEqual(status, 201, JSON.stringify(body));
  return body;
}

describe('A. 등록 시 회차 자동 생성', () => {
  test('A-1. 할부를 등록하면 회차만큼 거래가 생기고 건수를 알려준다', async () => {
    const created = await createInstallment();
    assert.strictEqual(created.derived.created, 12);

    const { body } = await json(`/api/installments/${created.id}/derived`);
    assert.strictEqual(body.data.length, 12);
    assert.ok(body.data.every((r) => r.origin === 'installment'));
    assert.deepStrictEqual(body.data.map((r) => r.origin_seq), [1,2,3,4,5,6,7,8,9,10,11,12]);
  });
});

describe('B. 프리뷰 우회 차단 (ADR 0008)', () => {
  test('B-1. 프리뷰 없이 회차를 바꾸면 428 로 막힌다', async () => {
    const created = await createInstallment();
    const { status, body } = await json(`/api/installments/${created.id}`, {
      method: 'PUT',
      body: JSON.stringify({ months: 6, total_amount: 600000 }),
    });
    assert.strictEqual(status, 428);
    assert.strictEqual(body.preview_required, true);
    assert.ok(!/fingerprint|origin|preview_token/.test(body.error), `내부 용어 노출: ${body.error}`);

    // 막혔으면 데이터도 그대로여야 한다.
    const after = await json(`/api/installments/${created.id}/derived`);
    assert.strictEqual(after.body.data.length, 12);
  });

  test('B-2. 프리뷰는 DB 를 바꾸지 않는다', async () => {
    const created = await createInstallment();
    const before = await json(`/api/installments/${created.id}/derived`);

    const { status, body } = await json(`/api/installments/${created.id}/derived/preview`, {
      method: 'POST',
      body: JSON.stringify({ months: 6, total_amount: 600000 }),
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.data.delete_count, 12);
    assert.strictEqual(body.data.create_count, 6);
    assert.strictEqual(body.data.before_total, 1200000);
    assert.strictEqual(body.data.after_total, 600000);
    assert.ok(body.data.fingerprint);

    const after = await json(`/api/installments/${created.id}/derived`);
    assert.deepStrictEqual(after.body.data, before.body.data, '프리뷰가 데이터를 바꿨다');
  });

  test('B-3. 프리뷰 지문을 넘기면 저장된다', async () => {
    const created = await createInstallment();
    const preview = await json(`/api/installments/${created.id}/derived/preview`, {
      method: 'POST', body: JSON.stringify({ months: 6, total_amount: 600000 }),
    });
    const { status, body } = await json(`/api/installments/${created.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        months: 6, total_amount: 600000, preview_token: preview.body.data.fingerprint,
      }),
    });
    assert.strictEqual(status, 200, JSON.stringify(body));
    assert.deepStrictEqual(body.derived, { deleted: 12, created: 6 });

    const rows = await json(`/api/installments/${created.id}/derived`);
    assert.strictEqual(rows.body.data.length, 6);
  });

  test('B-4. 프리뷰 이후 원본이 바뀌면 409 로 막힌다', async () => {
    const created = await createInstallment();
    const preview = await json(`/api/installments/${created.id}/derived/preview`, {
      method: 'POST', body: JSON.stringify({ months: 6, total_amount: 600000 }),
    });
    // 다른 경로에서 같은 할부를 먼저 고친 상황.
    const other = await json(`/api/installments/${created.id}/derived/preview`, {
      method: 'POST', body: JSON.stringify({ months: 3, total_amount: 300000 }),
    });
    await json(`/api/installments/${created.id}`, {
      method: 'PUT',
      body: JSON.stringify({ months: 3, total_amount: 300000, preview_token: other.body.data.fingerprint }),
    });

    const { status, body } = await json(`/api/installments/${created.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        months: 6, total_amount: 600000, preview_token: preview.body.data.fingerprint,
      }),
    });
    assert.strictEqual(status, 409);
    assert.strictEqual(body.preview_stale, true);

    const rows = await json(`/api/installments/${created.id}/derived`);
    assert.strictEqual(rows.body.data.length, 3, '낡은 프리뷰가 실행됐다');
  });

  test('B-5. 회차와 무관한 수정은 프리뷰를 요구하지 않는다', async () => {
    const created = await createInstallment();
    const { status } = await json(`/api/installments/${created.id}`, {
      method: 'PUT', body: JSON.stringify({ status: '완료' }),
    });
    assert.strictEqual(status, 200);
    const rows = await json(`/api/installments/${created.id}/derived`);
    assert.strictEqual(rows.body.data.length, 12, '무관한 수정이 회차를 지웠다');
  });

  test('B-6. 재생성 전용 경로도 지문을 요구한다', async () => {
    const created = await createInstallment();
    const bare = await json(`/api/installments/${created.id}/derived/apply`, {
      method: 'POST', body: JSON.stringify({}),
    });
    assert.strictEqual(bare.status, 428);

    const preview = await json(`/api/installments/${created.id}/derived/preview`, {
      method: 'POST', body: JSON.stringify({}),
    });
    const ok = await json(`/api/installments/${created.id}/derived/apply`, {
      method: 'POST', body: JSON.stringify({ preview_token: preview.body.data.fingerprint }),
    });
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(ok.body.created, 12);
  });
});

describe('C. 파생 거래는 거래내역에서 잠긴다 (#268 연동)', () => {
  test('C-1. 수정·삭제가 거부되고 안내 문구가 나온다', async () => {
    const created = await createInstallment();
    const { body } = await json(`/api/installments/${created.id}/derived`);
    const txId = body.data[0].id;

    const put = await json(`/api/transactions/${txId}`, {
      method: 'PUT', body: JSON.stringify({ amount: 1 }),
    });
    assert.ok(put.status >= 400, '파생 거래가 수정됐다');

    const del = await api(`/api/transactions/${txId}`, { method: 'DELETE' });
    assert.ok(del.status >= 400, '파생 거래가 삭제됐다');
  });
});

describe('D. 고아 행', () => {
  test('D-1. 할부를 지우면 파생 거래도 사라진다', async () => {
    const created = await createInstallment();
    const del = await json(`/api/installments/${created.id}`, { method: 'DELETE' });
    assert.strictEqual(del.status, 200);
    assert.strictEqual(del.body.derived.deleted, 12);

    const rows = await json(`/api/installments/${created.id}/derived`);
    assert.strictEqual(rows.body.data.length, 0);
  });

  test('D-2. 리볼빙 이력을 지우면 수수료 거래도 사라진다', async () => {
    const payment_method_id = await firstCardId();
    const rev = await json('/api/revolving', {
      method: 'POST',
      body: JSON.stringify({
        month: '2026-05', payment_method_id, carried_balance: 100000,
        new_charge: 50000, paid_amount: 30000, interest: 4500,
      }),
    });
    assert.strictEqual(rev.status, 201);
    assert.strictEqual(rev.body.derived.created, 1);

    const del = await json(`/api/revolving/${rev.body.id}`, { method: 'DELETE' });
    assert.strictEqual(del.body.derived.deleted, 1);
    const rows = await json(`/api/revolving/${rev.body.id}/derived`);
    assert.strictEqual(rows.body.data.length, 0);
  });

  test('D-3. 부채를 지우면 이자 거래도 사라진다', async () => {
    const debt = await json('/api/debts', {
      method: 'POST', body: JSON.stringify({ name: '테스트대출', balance: 1000000, annual_rate: 12 }),
    });
    const interest = await json(`/api/debts/${debt.body.id}/interest`, {
      method: 'POST',
      body: JSON.stringify({ rate: 12, interest_amount: 10000, log_date: '2026-05-15' }),
    });
    assert.strictEqual(interest.status, 201);
    assert.strictEqual(interest.body.derived.created, 1);

    const list = await json(`/api/debts/${debt.body.id}/derived`);
    assert.strictEqual(list.body.data.length, 1);

    const del = await json(`/api/debts/${debt.body.id}`, { method: 'DELETE' });
    assert.strictEqual(del.body.derived.deleted, 1);
    const after = await json(`/api/debts/${debt.body.id}/derived`);
    assert.strictEqual(after.body.data.length, 0);
  });
});

describe('E. 리볼빙 수수료 0 원', () => {
  test('E-1. 수수료가 0 이면 거래를 만들지 않는다', async () => {
    const payment_method_id = await firstCardId();
    const rev = await json('/api/revolving', {
      method: 'POST',
      body: JSON.stringify({
        month: '2026-06', payment_method_id, carried_balance: 100000,
        new_charge: 50000, paid_amount: 30000, interest: 0,
      }),
    });
    assert.strictEqual(rev.body.derived.created, 0);
    const rows = await json(`/api/revolving/${rev.body.id}/derived`);
    assert.strictEqual(rows.body.data.length, 0);
  });
});

describe('F. 기존 집계가 움직이지 않는다', () => {
  test('F-1. 파생 거래를 만들어도 대시보드 수입·지출이 그대로다', async () => {
    const before = await json('/api/transactions/summary/dashboard');
    const payment_method_id = await firstCardId();

    // 이번 달에 걸리도록 만든다 — 다른 달에 만들면 이 테스트가 아무것도 증명하지 않는다.
    await createInstallment({ months: 3, total_amount: 300000, start_billing_month: CUR_MONTH });
    await json('/api/revolving', {
      method: 'POST',
      body: JSON.stringify({
        month: CUR_MONTH, payment_method_id, carried_balance: 100000,
        new_charge: 50000, paid_amount: 30000, interest: 7000,
      }),
    });
    const debt = await json('/api/debts', {
      method: 'POST', body: JSON.stringify({ name: '집계검증대출', balance: 1000000, annual_rate: 12 }),
    });
    await json(`/api/debts/${debt.body.id}/interest`, {
      method: 'POST', body: JSON.stringify({ rate: 12, interest_amount: 33000, log_date: TODAY }),
    });

    const after = await json('/api/transactions/summary/dashboard');
    assert.strictEqual(after.body.income, before.body.income, '파생 거래가 수입을 바꿨다');
    assert.strictEqual(after.body.expense, before.body.expense, '파생 거래가 지출을 바꿨다');
  });

  test('F-2. 월별 요약도 파생 거래를 지출에 넣지 않는다', async () => {
    // 대시보드만 맞추고 월별 요약이 어긋나면 같은 달을 두 화면에서 다르게 본다.
    const year = CUR_MONTH.slice(0, 4);
    const { body } = await json(`/api/transactions/summary/by-month?year=${year}`);
    const row = body.data.find((r) => r.month === CUR_MONTH);
    assert.ok(row, '이번 달 요약이 없다');
    assert.ok(row.count > 0, 'F-1 이 만든 파생 거래가 집계 대상에 없다 — 이 테스트가 무의미해진다');
    assert.strictEqual(row.expense, 0, `파생 거래가 월별 지출에 들어갔다 (${row.expense})`);
  });

  test('F-3. 지출 규칙이 라우트에 다시 인라인으로 적히지 않았다', () => {
    // FND-13 이 단일 상수로 뽑은 규칙이 세 곳에 다시 적혀 있었고, #269 가
    // 부채이자를 제외하면서 한쪽만 고쳐지는 문제가 실제로 났다.
    // 소스를 훑어 재발을 막는다 — 새 라우트가 규칙을 복사해 붙이면 여기서 걸린다.
    const routesDir = require('node:path').join(__dirname, '..', 'src', 'routes');
    const fs = require('node:fs');
    const offenders = [];
    for (const file of fs.readdirSync(routesDir).filter((f) => f.endsWith('.js'))) {
      const text = fs.readFileSync(require('node:path').join(routesDir, file), 'utf8');
      if (text.includes("payment_style NOT IN ('할부','리볼빙')")) offenders.push(file);
    }
    assert.deepStrictEqual(offenders, [],
      'utils/aggregation.js 의 EXPENSE_CASE / EXPENSE_ROW 를 쓸 것');
  });
});
