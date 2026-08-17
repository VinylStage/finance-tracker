'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const PORT = 21046;
let server;
let pmId;
let cardId;

async function json(pathname, options) {
  const r = await fetch(`${server.base}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return { status: r.status, body: await r.json() };
}
const post = (p, body) => json(p, { method: 'POST', body: JSON.stringify(body) });
const put = (p, body) => json(p, { method: 'PUT', body: JSON.stringify(body) });

before(async () => {
  server = await startTestServer({ port: PORT });
  const pm = await post('/api/payment-methods', { name: '검증용카드사', type: '신용' });
  pmId = pm.body.id;
});

after(() => { server.stop(); });

// 정상 등록에 필요한 최소 몸통. 케이스마다 펼쳐서 필요한 값만 바꾼다.
const base = () => ({
  payment_method_id: pmId, issuer: '하나', product_name: `카드${Math.random()}`, card_type: '신용',
});

// ─────────────────────────────────────────────────────────────────────────
// 돌연변이로 못 잡은 것 2건 — 사유
//
// `validate()` 안의 `Number.isInteger` 검사와 `Number.isFinite` 검사를 각각 빼도
// 이 파일은 전부 통과한다. **방어가 두 겹이고 바깥쪽이 항상 먼저 걸리기 때문이다.**
//
// 라우트는 `numericBody([...])` 미들웨어를 먼저 태운다. 그 미들웨어가 `asInt` 로
// 걸러서 `1.5` 나 `'abc'` 같은 값은 `validate()` 에 **도달하지 못하고** 400 으로 끝난다.
// 즉 안쪽 검사는 HTTP 로는 닿을 수 없는 이중 방어다.
//
// "그 줄이 필요 없다" 는 뜻이 아니다 — `validate()` 를 다른 데서 부르게 되면 그때
// 유일한 방어가 된다. 잡으려면 `validate()` 를 export 해 단위로 불러야 하는데,
// 그건 이 파일의 범위(HTTP 계약)가 아니라 두지 않았다.
//
// 상한·하한 경계(31/32), 없는 카드사, 카드 종류, 빈 문자열 처리는 전부 잡힌다.
// ─────────────────────────────────────────────────────────────────────────
describe('A. 필수 항목 POST /api/card-products', () => {
  test('A-1. payment_method_id 빠짐', async () => {
    const response = await post('/api/card-products', {
      ...base(),
      payment_method_id: undefined
    });
    
    assert.strictEqual(response.status, 400);
  });

  test('A-2. issuer 빠짐', async () => {
    const response = await post('/api/card-products', {
      ...base(),
      issuer: undefined
    });
    
    assert.strictEqual(response.status, 400);
  });

  test('A-3. product_name 빠짐', async () => {
    const response = await post('/api/card-products', {
      ...base(),
      product_name: undefined
    });
    
    assert.strictEqual(response.status, 400);
  });

  test('A-4. card_type 빠짐', async () => {
    const response = await post('/api/card-products', {
      ...base(),
      card_type: undefined
    });
    
    assert.strictEqual(response.status, 400);
  });

  test('A-5. 몸통이 빈 객체 {}', async () => {
    const response = await post('/api/card-products', {});
    
    assert.strictEqual(response.status, 400);
  });
});

describe('B. 카드 종류', () => {
  test('B-1. card_type 이 \'법인\' — 허용 목록 밖', async () => {
    const response = await post('/api/card-products', {
      ...base(),
      card_type: '법인'
    });
    
    assert.strictEqual(response.status, 400);
  });

  test('B-2. card_type 이 빈 문자열', async () => {
    const response = await post('/api/card-products', {
      ...base(),
      card_type: ''
    });
    
    assert.strictEqual(response.status, 400);
  });
});

describe('C. 없는 카드사', () => {
  test('C-1. payment_method_id 가 999999', async () => {
    const response = await post('/api/card-products', {
      ...base(),
      payment_method_id: 999999
    });
    
    assert.strictEqual(response.status, 400);
  });
});

describe('D. 결제일·마감일', () => {
  test('D-1. billing_cycle_day: 0', async () => {
    const response = await post('/api/card-products', {
      ...base(),
      billing_cycle_day: 0
    });
    
    assert.strictEqual(response.status, 400);
  });

  test('D-2. billing_cycle_day: 32', async () => {
    const response = await post('/api/card-products', {
      ...base(),
      billing_cycle_day: 32
    });
    
    assert.strictEqual(response.status, 400);
  });

  test('D-3. billing_cycle_day: 1.5 — 정수가 아님', async () => {
    const response = await post('/api/card-products', {
      ...base(),
      billing_cycle_day: 1.5
    });
    
    assert.strictEqual(response.status, 400);
  });

  test('D-4. billing_cycle_day: \'abc\'', async () => {
    const response = await post('/api/card-products', {
      ...base(),
      billing_cycle_day: 'abc'
    });
    
    assert.strictEqual(response.status, 400);
  });

  test('D-5. statement_close_day: 0', async () => {
    const response = await post('/api/card-products', {
      ...base(),
      statement_close_day: 0
    });
    
    assert.strictEqual(response.status, 400);
  });

  test('D-6. statement_close_day: 32', async () => {
    const response = await post('/api/card-products', {
      ...base(),
      statement_close_day: 32
    });
    
    assert.strictEqual(response.status, 400);
  });

  test('D-7. billing_cycle_day: 1 — 하한 경계는 정상', async () => {
    const response = await post('/api/card-products', {
      ...base(),
      billing_cycle_day: 1
    });
    
    assert.strictEqual(response.status, 201);
  });

  test('D-8. billing_cycle_day: 31 — 상한 경계는 정상', async () => {
    const response = await post('/api/card-products', {
      ...base(),
      billing_cycle_day: 31
    });
    
    assert.strictEqual(response.status, 201);
  });

  test('D-9. billing_cycle_day: null — 비워 두는 것은 정상', async () => {
    const response = await post('/api/card-products', {
      ...base(),
      billing_cycle_day: null
    });
    
    assert.strictEqual(response.status, 201);
  });

  test('D-10. billing_cycle_day: \'\' — 빈 문자열도 정상(비운 것으로 본다)', async () => {
    const response = await post('/api/card-products', {
      ...base(),
      billing_cycle_day: ''
    });
    
    assert.strictEqual(response.status, 201);
  });
});

describe('E. 전월 실적 기준액', () => {
  test('E-1. prev_month_threshold: -1', async () => {
    const response = await post('/api/card-products', {
      ...base(),
      prev_month_threshold: -1
    });
    
    assert.strictEqual(response.status, 400);
  });

  test('E-2. prev_month_threshold: \'abc\'', async () => {
    const response = await post('/api/card-products', {
      ...base(),
      prev_month_threshold: 'abc'
    });
    
    assert.strictEqual(response.status, 400);
  });

  test('E-3. prev_month_threshold: 0 — 0 은 정상', async () => {
    const response = await post('/api/card-products', {
      ...base(),
      prev_month_threshold: 0
    });
    
    assert.strictEqual(response.status, 201);
  });

  test('E-4. prev_month_threshold: null — 비워 두는 것은 정상', async () => {
    const response = await post('/api/card-products', {
      ...base(),
      prev_month_threshold: null
    });
    
    assert.strictEqual(response.status, 201);
  });

  test('E-5. prev_month_threshold: \'\' — 빈 문자열도 정상', async () => {
    const response = await post('/api/card-products', {
      ...base(),
      prev_month_threshold: ''
    });
    
    assert.strictEqual(response.status, 201);
  });
});

describe('F. 수정도 같은 검증을 탄다 PUT /api/card-products/:id', () => {
  before(async () => {
    const card = await post('/api/card-products', base());
    cardId = card.body.id;
  });

  test('F-1. card_type 을 \'법인\' 으로 바꾸려 함', async () => {
    const response = await put(`/api/card-products/${cardId}`, {
      ...base(),
      card_type: '법인'
    });
    
    assert.strictEqual(response.status, 400);
  });

  test('F-2. billing_cycle_day 을 32 로 바꾸려 함', async () => {
    const response = await put(`/api/card-products/${cardId}`, {
      ...base(),
      billing_cycle_day: 32
    });
    
    assert.strictEqual(response.status, 400);
  });

  test('F-3. 없는 카드 id 999999 에 정상 몸통', async () => {
    const response = await put('/api/card-products/999999', base());
    
    assert.strictEqual(response.status, 404);
  });
});

