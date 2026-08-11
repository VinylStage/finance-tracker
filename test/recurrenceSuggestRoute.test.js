'use strict';
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

// 반복 제안 라우트(#499).
//
// 감지 규칙 자체는 `recurrenceDetect.test.js` 가 순수 함수로 본다.
// **여기서 잠그는 것은 배선이다** — 이 저장소에서 여덟 번 나온 "만들었는데 쓰는
// 쪽이 없다" 를 또 만들지 않으려면, 감지 결과가 실제로 API 를 타고 나오는지와
// 거절이 실제로 기억되는지를 봐야 한다.

const PORT = 35002;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

async function json(p, o) {
  const r = await fetch(`${BASE}${p}`, { headers: { 'Content-Type': 'application/json' }, ...o });
  return { status: r.status, body: await r.json() };
}
const post = (p, b) => json(p, { method: 'POST', body: JSON.stringify(b) });

let catId, pmId, seq = 0;
const uniq = () => `가맹점${++seq}`;

before(async () => {
  server = await startTestServer({ port: PORT });
  const cats = await json('/api/categories');
  catId = (cats.body.data || cats.body).find((c) => c.major_type === '선택지출').id;
  const pms = await json('/api/payment-methods');
  pmId = (Array.isArray(pms.body) ? pms.body : pms.body.data)[0].id;
});
after(() => { if (server) server.stop(); });

beforeEach(async () => {
  const list = await json('/api/transactions?limit=500');
  for (const t of list.body.data) await json(`/api/transactions/${t.id}`, { method: 'DELETE' });
  const rules = (await json('/api/recurring-rules')).body;
  for (const r of (Array.isArray(rules) ? rules : rules.data || [])) {
    await json(`/api/recurring-rules/${r.id}`, { method: 'DELETE' });
  }
});

// 최근 3개월에 같은 날짜로 거래를 만든다. 오늘 기준이라 스캔 범위 안에 들어온다.
async function seedMonthly(merchant, amount = 17000) {
  const now = new Date();
  for (let back = 1; back <= 3; back++) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 15);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`;
    const r = await post('/api/transactions', {
      date, category_id: catId, amount, payment_method_id: pmId, merchant,
    });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  }
}

describe('제안이 나온다', () => {
  test('세 달 반복하면 후보로 올라온다', async () => {
    const m = uniq();
    await seedMonthly(m);

    const r = await json('/api/recurring-rules/suggestions');

    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const c = r.body.data.find((x) => x.merchant === m);
    assert.ok(c, '후보에 없다 — 감지가 API 를 안 탄다');
    assert.strictEqual(c.months, 3);
    assert.strictEqual(c.amount, 17000);
    assert.strictEqual(c.day_of_month, 15);
    // 규칙 폼이 그대로 쓸 수 있어야 한다.
    assert.strictEqual(c.category_id, catId);
    assert.strictEqual(c.payment_method_id, pmId);
  });

  test('조회 기간이 범위를 벗어나면 400', async () => {
    for (const months of [0, 61, -1]) {
      const r = await json(`/api/recurring-rules/suggestions?months=${months}`);
      assert.strictEqual(r.status, 400, `months=${months} 가 통과했다`);
    }
  });
});

describe('이미 규칙이 있으면 안 올린다', () => {
  test('규칙을 만들면 그 가맹점은 제안에서 빠진다', async () => {
    const m = uniq();
    await seedMonthly(m);
    const before = await json('/api/recurring-rules/suggestions');
    assert.ok(before.body.data.some((x) => x.merchant === m), '전제: 후보였다');

    const rule = await post('/api/recurring-rules', {
      name: m, category_id: catId, merchant: m, amount: 17000, day_of_month: 15,
      payment_method_id: pmId, payment_style: '일시불', freq: 'monthly', interval: 1,
      starts_on: '2026-01-01',
    });
    assert.strictEqual(rule.status, 201, JSON.stringify(rule.body));

    const after = await json('/api/recurring-rules/suggestions');

    assert.ok(!after.body.data.some((x) => x.merchant === m), '규칙을 만든 직후 또 물어본다');
  });
});

describe('거절을 기억한다', () => {
  test('거절하면 다시 안 올라온다', async () => {
    // **이게 이 기능의 생사를 가른다.** 또 물으면 사용자가 제안을 무시하게 된다.
    const m = uniq();
    await seedMonthly(m);
    assert.ok((await json('/api/recurring-rules/suggestions')).body.data.some((x) => x.merchant === m));

    const d = await post('/api/recurring-rules/suggestions/dismiss', { merchant: m });
    assert.strictEqual(d.status, 200, JSON.stringify(d.body));

    const after = await json('/api/recurring-rules/suggestions');
    assert.ok(!after.body.data.some((x) => x.merchant === m), '거절했는데 또 나온다');
  });

  test('거절은 서버에 남는다 — 세션이 아니다', async () => {
    // 브라우저를 바꿔도 유지돼야 한다. 새 요청으로 다시 조회해 확인한다.
    const m = uniq();
    await seedMonthly(m);
    await post('/api/recurring-rules/suggestions/dismiss', { merchant: m });

    const again = await json('/api/recurring-rules/suggestions');

    assert.ok(!again.body.data.some((x) => x.merchant === m));
  });

  test('같은 가맹점을 두 번 거절해도 안 터진다', async () => {
    const m = uniq();
    await seedMonthly(m);
    await post('/api/recurring-rules/suggestions/dismiss', { merchant: m });

    const second = await post('/api/recurring-rules/suggestions/dismiss', { merchant: m });

    assert.strictEqual(second.status, 200, JSON.stringify(second.body));
  });

  test('되돌리면 다시 올라온다', async () => {
    // 되돌릴 길이 없으면 실수로 누른 제안이 영영 안 보인다.
    const m = uniq();
    await seedMonthly(m);
    await post('/api/recurring-rules/suggestions/dismiss', { merchant: m });

    const r = await post('/api/recurring-rules/suggestions/restore', { merchant: m });

    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.restored, 1);
    const after = await json('/api/recurring-rules/suggestions');
    assert.ok(after.body.data.some((x) => x.merchant === m));
  });

  test('가맹점명이 비면 400 이고 아무것도 기록하지 않는다', async () => {
    for (const body of [{}, { merchant: '' }, { merchant: '   ' }]) {
      const r = await post('/api/recurring-rules/suggestions/dismiss', body);
      assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    }
  });
});
