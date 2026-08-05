'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

// #316 — POST /api/installments/billing-estimate
//
// 입력 폼이 저장 전에 부르는 계산 자리다. 두 가지가 핵심이다.
//   1. DB 를 바꾸지 않는다 (저장 전이라 대상 할부가 아직 없다)
//   2. 여기서 보여준 값과 나중에 실제로 생성되는 거래가 어긋나지 않는다
//      — 같은 정책 조회 기준(구매 시점)과 같은 계산 엔진을 써야 성립한다

const PORT = 34612;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

async function json(pathname, options) {
  const r = await fetch(`${BASE}${pathname}`, {
    headers: { 'Content-Type': 'application/json' }, ...options,
  });
  return { status: r.status, body: await r.json() };
}

const post = (p, body) => json(p, { method: 'POST', body: JSON.stringify(body) });

before(async () => {
  server = await startTestServer({ port: PORT });
  // 기존 before 안에 있던 나머지 준비 작업은 이 아래에 그대로 남긴다
});

after(() => {
  if (server) server.stop();
});

const REQ = {
  total_amount: 1200000, months: 6,
  purchase_date: '2026-07-10', start_billing_month: '2026-08',
};

describe('A. 정책 없이', () => {
  test('A-1. 계산 결과를 준다', async () => {
    const r = await post('/api/installments/billing-estimate', REQ);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const d = r.body.data;
    assert.strictEqual(d.rows.length, 6);
    assert.strictEqual(d.monthly_amount, 200000);
    assert.strictEqual(d.fee_per_month, 0);
    assert.strictEqual(d.totals.principal, 1200000);
  });

  test('A-2. 정책이 없다는 근거를 함께 준다', async () => {
    const r = await post('/api/installments/billing-estimate', REQ);
    assert.strictEqual(r.body.data.basis.source, 'none');
    assert.match(r.body.data.basis.reason, /정책이 없어/);
  });

  test('A-3. 할부를 만들지 않는다 — 계산일 뿐이다', async () => {
    const before = (await json('/api/installments')).body.data.length;
    await post('/api/installments/billing-estimate', REQ);
    await post('/api/installments/billing-estimate', REQ);
    const after = (await json('/api/installments')).body.data.length;
    assert.strictEqual(after, before, '계산이 할부를 만들었다');
  });

  test('A-4. 거래도 만들지 않는다', async () => {
    const count = async () => (await json('/api/transactions?limit=1')).body.total;
    const before = await count();
    await post('/api/installments/billing-estimate', REQ);
    assert.strictEqual(await count(), before, '계산이 거래를 만들었다');
  });
});

describe('B. 필수값 검증', () => {
  test('B-1. 총액이 없으면 400', async () => {
    const r = await post('/api/installments/billing-estimate', { ...REQ, total_amount: undefined });
    assert.strictEqual(r.status, 400);
    assert.match(r.body.error, /총액/);
  });

  test('B-2. 첫 청구월이 없으면 400', async () => {
    const r = await post('/api/installments/billing-estimate', { ...REQ, start_billing_month: undefined });
    assert.strictEqual(r.status, 400);
  });

  test('B-3. 1개월은 거절한다 — 일시불이다', async () => {
    const r = await post('/api/installments/billing-estimate', { ...REQ, months: 1 });
    assert.strictEqual(r.status, 400);
    assert.match(r.body.error, /2/);
  });

  test('B-4. 숫자가 아닌 총액은 거절한다', async () => {
    const r = await post('/api/installments/billing-estimate', { ...REQ, total_amount: '많이' });
    assert.strictEqual(r.status, 400);
  });
});

describe('C. 정책이 있을 때', () => {
  let pmId;

  before(async () => {
    const pm = await post('/api/payment-methods', { name: '테스트카드', type: '신용카드' });
    pmId = pm.body.id;
    // 6개월 무이자
    await post('/api/card-policies', {
      payment_method_id: pmId, months: 6, policy_type: '무이자',
      annual_rate: 0, effective_from: '2026-01-01',
    });
    // 12개월 부분무이자 — 4회차부터 면제
    await post('/api/card-policies', {
      payment_method_id: pmId, months: 12, policy_type: '부분무이자',
      annual_rate: 19.9, free_from_sequence: 4, effective_from: '2026-01-01',
    });
  });

  test('C-1. 무이자 정책이 적용된다', async () => {
    const r = await post('/api/installments/billing-estimate', { ...REQ, payment_method_id: pmId });
    const d = r.body.data;
    assert.strictEqual(d.basis.policy_type, '무이자');
    assert.strictEqual(d.basis.source, 'base');
    assert.strictEqual(d.totals.interest, 0);
  });

  test('C-2. 부분무이자는 뒤쪽 회차가 면제된다', async () => {
    const r = await post('/api/installments/billing-estimate', {
      ...REQ, months: 12, payment_method_id: pmId,
    });
    const fees = r.body.data.rows.map((x) => x.interest);
    assert.ok(fees[0] > 0, `1회차는 수수료가 붙어야 한다: ${fees.join(', ')}`);
    assert.ok(fees.slice(3).every((f) => f === 0), `4회차부터 면제여야 한다: ${fees.join(', ')}`);
    assert.match(r.body.data.basis.reason, /4회차부터/);
  });

  test('C-3. 정책이 없는 개월수는 정책 없음으로 떨어진다', async () => {
    // 7개월 정책은 등록하지 않았다. 조용히 다른 개월수 정책을 갖다 쓰면 안 된다.
    const r = await post('/api/installments/billing-estimate', {
      ...REQ, months: 7, payment_method_id: pmId,
    });
    assert.strictEqual(r.body.data.basis.source, 'none');
    assert.strictEqual(r.body.data.totals.interest, 0);
  });
});

describe('C2. 카테고리 예외 정책', () => {
  let catPmId;
  let exceptCatId;
  let plainCatId;

  before(async () => {
    const pm = await post('/api/payment-methods', { name: '카테고리예외카드', type: '신용' });
    catPmId = pm.body.id;
    const cats = (await json('/api/categories')).body;
    const spend = (cats.data || cats).filter((c) => c.major_type !== '수입');
    exceptCatId = spend[0].id;
    plainCatId = spend[1].id;

    // 기본: 6개월 유이자 / 예외: 같은 카드·같은 개월수인데 무이자
    await post('/api/card-policies', {
      payment_method_id: catPmId, months: 6, policy_type: '유이자',
      annual_rate: 19.9, effective_from: '2026-01-01',
    });
    await post('/api/card-policies', {
      payment_method_id: catPmId, months: 6, policy_type: '무이자',
      annual_rate: 0, effective_from: '2026-01-01', category_id: exceptCatId,
    });
  });

  test('C2-1. 예외 카테고리를 넘기면 무이자로 계산된다', async () => {
    const r = await post('/api/installments/billing-estimate', {
      ...REQ, payment_method_id: catPmId, category_id: exceptCatId,
    });
    assert.strictEqual(r.body.data.basis.policy_type, '무이자');
    assert.strictEqual(r.body.data.basis.source, 'category');
    assert.strictEqual(r.body.data.totals.interest, 0);
  });

  test('C2-2. 예외 없는 카테고리는 기본 정책으로 떨어진다', async () => {
    const r = await post('/api/installments/billing-estimate', {
      ...REQ, payment_method_id: catPmId, category_id: plainCatId,
    });
    assert.strictEqual(r.body.data.basis.source, 'base');
    assert.ok(r.body.data.totals.interest > 0);
  });

  test('C2-3. 카테고리를 안 넘기면 기본 정책만 본다', async () => {
    // 빈 값을 아무 카테고리로 채우면 엉뚱한 예외가 걸린다.
    const r = await post('/api/installments/billing-estimate', {
      ...REQ, payment_method_id: catPmId,
    });
    assert.strictEqual(r.body.data.basis.source, 'base');
    assert.ok(r.body.data.totals.interest > 0);
  });

  test('C2-4. 미리보기와 저장 후 생성값이 카테고리 예외에서도 일치한다', async () => {
    // 이 배선의 존재 이유다. 계산 기준이 갈라지면 화면에서 무이자를 봤는데
    // 저장하니 수수료가 붙는 상황이 된다.
    const est = await post('/api/installments/billing-estimate', {
      ...REQ, payment_method_id: catPmId, category_id: exceptCatId,
    });
    const rows = est.body.data.rows;

    const created = await post('/api/installments', {
      ...REQ, merchant: '카테고리일치확인', payment_method_id: catPmId,
      category_id: exceptCatId, monthly_amount: est.body.data.monthly_amount,
    });
    assert.strictEqual(created.status, 201, JSON.stringify(created.body));

    const derived = await json(`/api/installments/${created.body.id}/derived`);
    const actual = derived.body.data.sort((a, b) => a.origin_seq - b.origin_seq);
    assert.strictEqual(actual.length, rows.length);
    for (let i = 0; i < rows.length; i += 1) {
      assert.strictEqual(
        actual[i].amount, rows[i].total,
        `${i + 1}회차 — 미리보기 ${rows[i].total} vs 생성 ${actual[i].amount}`
      );
    }
  });
});

describe('D. 저장된 할부와 값이 어긋나지 않는다', () => {
  // 화면에서 본 값과 실제로 생성된 청구 내역이 다르면 계산을 보여준 의미가 없다.
  test('D-1. 계산한 회차별 금액이 생성된 파생 거래와 같다', async () => {
    const est = await post('/api/installments/billing-estimate', {
      total_amount: 1000000, months: 7,
      purchase_date: '2026-07-10', start_billing_month: '2026-08',
    });
    const rows = est.body.data.rows;

    const created = await post('/api/installments', {
      purchase_date: '2026-07-10', merchant: '일치확인', total_amount: 1000000,
      months: 7, monthly_amount: est.body.data.monthly_amount,
      start_billing_month: '2026-08',
    });
    assert.strictEqual(created.status, 201, JSON.stringify(created.body));

    const derived = await json(`/api/installments/${created.body.id}/derived`);
    const actual = derived.body.data.sort((a, b) => a.origin_seq - b.origin_seq);

    assert.strictEqual(actual.length, rows.length, '회차 수가 다르다');
    for (let i = 0; i < rows.length; i += 1) {
      assert.strictEqual(
        actual[i].amount, rows[i].total,
        `${i + 1}회차 금액이 다르다 — 계산 ${rows[i].total} vs 생성 ${actual[i].amount}`
      );
      assert.strictEqual(actual[i].date.slice(0, 7), rows[i].billing_month);
    }
  });
});
