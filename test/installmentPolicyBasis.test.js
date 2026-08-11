'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

// 할부 목록이 **적용된 정책**을 함께 낸다(#500).
//
// 정책이 없으면 수수료가 0 으로 계산된다. 그 자체는 의도된 폴백이지만, 목록이
// 그 사실을 말하지 않으면 사용자는 **무이자라서 0 인지 요율을 안 넣어서 0 인지
// 구분할 수 없다.** 실제 청구서에 수수료가 붙으면 그때 처음 안다.
//
// 미리보기(`/billing-estimate`)는 예전부터 `billingBasis` 로 이 사실을 말해 왔다.
// 목록만 빠져 있어서, **저장하고 나면 그 경고가 사라지는** 상태였다.

const PORT = 34999;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

async function json(p, o) {
  const r = await fetch(`${BASE}${p}`, { headers: { 'Content-Type': 'application/json' }, ...o });
  return { status: r.status, body: await r.json() };
}
const post = (p, b) => json(p, { method: 'POST', body: JSON.stringify(b) });

let pmId;

before(async () => {
  server = await startTestServer({ port: PORT });
  const pms = await json('/api/payment-methods');
  pmId = (Array.isArray(pms.body) ? pms.body : pms.body.data)[0].id;
});
after(() => { if (server) server.stop(); });

async function addInstallment(over = {}) {
  const r = await post('/api/installments', {
    purchase_date: '2026-05-10', merchant: '테스트가맹점', total_amount: 300000,
    months: 3, monthly_amount: 100000, payment_method_id: pmId,
    start_billing_month: '2026-06', ...over,
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  return r.body.id;
}

describe('정책이 없을 때', () => {
  test('목록이 source=none 과 이유를 함께 낸다', async () => {
    await addInstallment();

    const r = await json('/api/installments');

    assert.strictEqual(r.status, 200);
    const it = r.body.data.find((x) => x.merchant === '테스트가맹점');
    assert.ok(it, '할부가 목록에 없다');
    assert.ok(it.basis, 'basis 가 없다 — 목록이 정책 상태를 안 말한다');
    assert.strictEqual(it.basis.source, 'none');
    assert.strictEqual(it.basis.annual_rate, null);
    // 문구의 부재만 보면 다른 말로 같은 뜻을 적어도 통과한다. 실제 내용을 본다.
    assert.match(it.basis.reason, /정책이 없어/);
    assert.match(it.basis.reason, /실제 청구액과 다를 수 있어요/);
  });

  test('미리보기와 목록이 같은 사실을 말한다', async () => {
    // 저장 전후로 말이 달라지면 사용자는 저장하면 문제가 해결된 줄 안다.
    const est = await post('/api/installments/billing-estimate', {
      total_amount: 300000, months: 3, start_billing_month: '2026-06',
      payment_method_id: pmId, purchase_date: '2026-05-10',
    });
    assert.strictEqual(est.status, 200, JSON.stringify(est.body));

    const list = await json('/api/installments');
    const it = list.body.data.find((x) => x.merchant === '테스트가맹점');

    assert.strictEqual(it.basis.source, est.body.data.basis.source);
    assert.strictEqual(it.basis.reason, est.body.data.basis.reason);
  });
});

describe('정책이 있을 때', () => {
  test('요율과 종류가 목록에 실린다', async () => {
    const pol = await post('/api/card-policies', {
      payment_method_id: pmId, months: 3, policy_type: '유이자',
      annual_rate: 19.9, effective_from: '2026-01-01',
    });
    assert.ok([200, 201].includes(pol.status), JSON.stringify(pol.body));

    await addInstallment({ merchant: '정책있는가맹점' });

    const r = await json('/api/installments');
    const it = r.body.data.find((x) => x.merchant === '정책있는가맹점');

    assert.strictEqual(it.basis.source, 'base');
    assert.strictEqual(it.basis.annual_rate, 19.9);
    assert.match(it.basis.reason, /19\.9/);
    // 요율이 있으면 '미입력' 이 아니다 — 화면이 이 값으로 배지를 감춘다.
    assert.notStrictEqual(it.basis.source, 'none');
  });
});

describe('어느 정책을 고르는가', () => {
  test('카테고리 정책이 기본 정책을 이긴다', async () => {
    // #315 가 정책에 카테고리 차원을 넣은 이유가 "온라인쇼핑 6개월 무이자" 같은
    // 예외다. 카테고리를 안 보면 그 예외가 통째로 무시되고 기본 요율이 붙는다.
    const cats = await json('/api/categories');
    const catId = (cats.body.data || cats.body)[0].id;

    const pol = await post('/api/card-policies', {
      payment_method_id: pmId, months: 4, policy_type: '무이자',
      annual_rate: 0, effective_from: '2026-01-01', category_id: catId,
    });
    assert.ok([200, 201].includes(pol.status), JSON.stringify(pol.body));
    const base = await post('/api/card-policies', {
      payment_method_id: pmId, months: 4, policy_type: '유이자',
      annual_rate: 15.5, effective_from: '2026-01-01',
    });
    assert.ok([200, 201].includes(base.status), JSON.stringify(base.body));

    await addInstallment({ merchant: '카테고리정책', months: 4, category_id: catId });

    const r = await json('/api/installments');
    const it = r.body.data.find((x) => x.merchant === '카테고리정책');

    assert.strictEqual(it.basis.source, 'category', '기본 정책이 잡혔다 — 카테고리를 안 본다');
    assert.strictEqual(it.basis.policy_type, '무이자');
  });

  test('구매일 뒤에 생긴 정책은 지난 할부에 안 붙는다', async () => {
    // **소급 금지가 이 규칙의 요점이다.** 오늘 기준으로 정책을 찾으면, 정책을
    // 새로 등록하는 것만으로 이미 진행 중인 할부의 지난 회차 금액이 움직인다.
    // 사용자는 건드린 적 없는 과거 숫자가 바뀌는 것을 본다.
    await addInstallment({ merchant: '정책이전구매', months: 5, purchase_date: '2026-02-01' });

    const later = await post('/api/card-policies', {
      payment_method_id: pmId, months: 5, policy_type: '유이자',
      annual_rate: 22.0, effective_from: '2026-07-01',
    });
    assert.ok([200, 201].includes(later.status), JSON.stringify(later.body));

    const r = await json('/api/installments');
    const it = r.body.data.find((x) => x.merchant === '정책이전구매');

    // 구매일(2026-02-01)에는 그 정책이 없었다.
    assert.strictEqual(it.basis.source, 'none', '나중에 만든 정책이 소급 적용됐다');
    assert.strictEqual(it.basis.annual_rate, null);
  });
});
