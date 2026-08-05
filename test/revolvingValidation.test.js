'use strict';
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

// 리볼빙 라우트의 **거절 경로**.
//
// `revolvingRoute.test.js` 는 정상 왕복과 잔액 계산을 본다(FND-12). 거기서
// 안 보는 것이 여기 있다 — 필수값 누락(52-53)과 **PUT 의 중복 충돌(117-118)**.
// 커버리지 실측에서 PUT 의 catch 블록이 통째로 미커버였다.
//
// POST 의 409 는 이미 검사가 있는데 PUT 의 409 는 없었다. 같은 UNIQUE 제약을
// 두 라우트가 각자 처리하는데 한쪽만 잠겨 있으면, 나중에 한쪽 문구만 고쳐도
// 아무도 모른다.

const PORT = 34993;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

async function json(pathname, options) {
  const r = await fetch(`${BASE}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return { status: r.status, body: await r.json() };
}
const post = (p, b) => json(p, { method: 'POST', body: JSON.stringify(b) });
const put = (p, b) => json(p, { method: 'PUT', body: JSON.stringify(b) });

let methodId;

before(async () => {
  server = await startTestServer({ port: PORT });
  const pms = await json('/api/payment-methods');
  methodId = (pms.body.data || pms.body)[0].id;
});

after(() => { if (server) server.stop(); });

beforeEach(async () => {
  const list = await json('/api/revolving');
  for (const r of list.body.data) {
    await json(`/api/revolving/${r.id}`, { method: 'DELETE' });
  }
});

describe('POST /api/revolving — 필수값', () => {
  // 셋 다 400 이어야 한다. 하나라도 통과하면 undefined 가 산술에 들어가
  // `next_carried_balance` 가 NaN 으로 저장된다 — 그 뒤 모든 달의 이월액이 NaN 이다.
  const cases = [
    ['month 누락', { payment_method_id: null, paid_amount: 100000 }],
    ['payment_method_id 누락', { month: '2026-05', paid_amount: 100000 }],
    ['paid_amount 누락', { month: '2026-05', payment_method_id: null }],
  ];

  for (const [label, body] of cases) {
    test(`${label} → 400`, async () => {
      const payload = { ...body };
      if (payload.payment_method_id === null) payload.payment_method_id = methodId;
      if (label === 'payment_method_id 누락') delete payload.payment_method_id;
      if (label === 'paid_amount 누락') delete payload.paid_amount;
      if (label === 'month 누락') delete payload.month;

      const r = await post('/api/revolving', payload);

      assert.strictEqual(r.status, 400, JSON.stringify(r.body));
      assert.match(r.body.error, /필수/);
    });
  }

  test('paid_amount 가 0 이면 통과한다 — 누락과 다르다', async () => {
    // `paid_amount === undefined` 로 봐야 하는 이유. `!paid_amount` 로 바꾸면
    // 한 푼도 못 갚은 달을 기록할 수 없게 된다.
    const r = await post('/api/revolving', {
      month: '2026-05', payment_method_id: methodId, paid_amount: 0,
    });

    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  });
});

describe('PUT /api/revolving/:id — 중복 충돌', () => {
  test('다른 행의 월/카드로 바꾸면 409 이고 원본이 안 바뀐다', async () => {
    const a = await post('/api/revolving', {
      month: '2026-05', payment_method_id: methodId, paid_amount: 100000, new_charge: 500000,
    });
    const b = await post('/api/revolving', {
      month: '2026-06', payment_method_id: methodId, paid_amount: 200000, new_charge: 300000,
    });
    assert.strictEqual(a.status, 201);
    assert.strictEqual(b.status, 201);

    const r = await put(`/api/revolving/${b.body.id}`, { month: '2026-05' });

    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.match(r.body.error, /이미 등록/);

    // 409 를 반환하고 끝나면 안 된다. UPDATE 가 트랜잭션 안에 있으므로
    // 되돌아가야 하고, 6월 행은 그대로 6월이어야 한다.
    const after = await json('/api/revolving');
    const kept = after.body.data.find((x) => x.id === b.body.id);
    assert.strictEqual(kept.month, '2026-06', '충돌했는데 원본 월이 바뀌었다');
    assert.strictEqual(kept.paid_amount, 200000);
  });

  test('없는 id 는 404', async () => {
    const r = await put('/api/revolving/999999', { paid_amount: 1 });

    assert.strictEqual(r.status, 404);
    assert.match(r.body.error, /없습니다/);
  });

  test('GET /:id/derived — 수수료가 만든 거래를 되읽는다', async () => {
    // #270 이 만든 엔드포인트인데 읽는 검사가 없었다. 이 저장소에서 여덟 번
    // 나온 "만들었는데 쓰는 쪽이 없다" 유형이 여기서도 반복되지 않게 잠근다.
    const a = await post('/api/revolving', {
      month: '2026-08', payment_method_id: methodId, paid_amount: 100000,
      new_charge: 500000, interest: 12000,
    });
    assert.strictEqual(a.status, 201, JSON.stringify(a.body));
    assert.ok(a.body.derived.created > 0, '수수료 거래가 안 만들어졌다');

    const r = await json(`/api/revolving/${a.body.id}/derived`);

    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.data.length, a.body.derived.created);
    assert.strictEqual(r.body.data[0].amount, 12000);
  });

  test('숫자 아닌 값은 400 — 문자열 연결로 잔액이 오염되는 것을 막는다', async () => {
    // FND-06. `"100" + "200"` 이 `"100200"` 이 되어 그대로 잔액에 저장됐다.
    const a = await post('/api/revolving', {
      month: '2026-07', payment_method_id: methodId, paid_amount: 100000,
    });

    const r = await put(`/api/revolving/${a.body.id}`, { paid_amount: '십만원' });

    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.match(r.body.error, /integer/);
  });
});
