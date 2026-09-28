'use strict';

// 해외결제 조건이 **라우트까지 닿는가**(#710).
//
// 순수 계산은 `benefitOverseasCondition.test.js` 가 못박는다. 여기서 보는 것은
// 배선이다 — 마이그레이션 034 가 칸을 만들고, 사후 분석이 그 칸을 읽고, 사전
// 추천이 쿼리스트링을 읽는가.
//
// 이 배선은 **조용히 끊긴다.** 칸을 SQL 에서 빠뜨리면 `tx.is_overseas` 가
// `undefined` 가 되고, 그건 「국내」 로 읽혀 해외 전용 혜택이 0원으로 잡힌다.
// 오류가 아니라 그럴듯한 값이 나와서 안 드러난다.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const PORT = 21641;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

async function api(method, url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* JSON 이 아닐 수 있다 */ }
  return { status: res.status, body: json, text };
}

let pmId;
let expenseCatId;
let seq = 0;

async function makeCardId() {
  seq += 1;
  const res = await api('POST', '/api/card-products', {
    payment_method_id: pmId, issuer: '테스트카드사',
    product_name: `상품${seq}`, card_type: '신용',
  });
  assert.equal(res.status, 201, res.text);
  return res.body.id;
}

before(async () => {
  server = await startTestServer({ port: PORT });
  const pms = await api('GET', '/api/payment-methods');
  pmId = (Array.isArray(pms.body) ? pms.body : pms.body.data)[0].id;
  const cats = await api('GET', '/api/categories');
  const rows = Array.isArray(cats.body) ? cats.body : cats.body.data;
  expenseCatId = rows.find((c) => c.major_type !== '수입').id;
});

after(() => {
  // 단언이 던져도 자식을 죽인다. 살아남으면 러너가 상한까지 붙잡힌다(#602).
  if (server) server.stop();
});

test('마이그레이션 034 — transactions 에 is_overseas 가 있고 기본값이 국내다', async () => {
  const cardId = await makeCardId();
  const res = await api('POST', '/api/transactions', {
    date: '2026-01-11', amount: 10000, merchant: '동네분식',
    payment_method_id: pmId, card_product_id: cardId,
    payment_style: '일시불', category_id: expenseCatId,
  });
  assert.equal(res.status, 201, res.text);

  // 칸이 없으면 위 INSERT 자체는 통과하고 아래에서만 드러난다.
  const Database = require('better-sqlite3');
  const db = new Database(server.dbPath, { readonly: true });
  const cols = db.prepare('PRAGMA table_info(transactions)').all().map((c) => c.name);
  assert.ok(cols.includes('is_overseas'), 'is_overseas 칸이 없다');
  const row = db.prepare('SELECT is_overseas FROM transactions WHERE id=?').get(res.body.id);
  assert.equal(row.is_overseas, 0, '백필하지 않으므로 기본값은 국내(0)여야 한다');
  db.close();
});

test('사전 추천 — is_overseas=1 을 줘야 해외 전용 혜택이 후보가 된다', async () => {
  const cardId = await makeCardId();
  const b = await api('POST', '/api/card-benefits', {
    card_product_id: cardId, benefit_type: '적립', rate: 2,
    rule_json: JSON.stringify({ kind: 'rate', rate: 2, when: { overseas: true } }),
  });
  assert.equal(b.status, 201, b.text);

  const pick = async (qs) => {
    const res = await api('GET', `/api/card-strategy/estimate?amount=100000${qs}`);
    assert.equal(res.status, 200, res.text);
    return (res.body.data || []).find((c) => c.cardProductId === cardId || c.cardId === cardId
      || c.card_product_id === cardId);
  };

  const overseas = await pick('&is_overseas=1');
  assert.equal(overseas.benefit, 2000, '해외로 알리면 2% 가 붙어야 한다');

  const domestic = await pick('');
  assert.equal(domestic.benefit, 0, '안 주면 국내로 봐서 안 붙어야 한다');
  assert.ok((domestic.skipped || []).some((s) => s.reason === 'overseas-only'),
    '왜 안 붙었는지가 응답에 실려야 화면이 «혜택이 없다» 로 잘못 말하지 않는다');
});

test('사후 분석 — 원장의 칸을 읽는다. SQL 에서 빠지면 여기서 드러난다', async () => {
  const cardId = await makeCardId();
  await api('POST', '/api/card-benefits', {
    card_product_id: cardId, benefit_type: '적립', rate: 2,
    rule_json: JSON.stringify({ kind: 'rate', rate: 2, when: { overseas: true } }),
    threshold_exempt: 1,
  });

  const made = await api('POST', '/api/transactions', {
    date: '2026-01-11', amount: 100000, merchant: 'ANTHROPIC',
    payment_method_id: pmId, card_product_id: cardId,
    payment_style: '일시불', category_id: expenseCatId,
  });
  assert.equal(made.status, 201, made.text);

  // 입력 화면에 토글이 붙기 전까지는 칸을 직접 세운다. 이 테스트가 보는 것은
  // 「칸이 계산까지 닿는가」 이지 「화면이 어떻게 세우는가」 가 아니다.
  const Database = require('better-sqlite3');
  const db = new Database(server.dbPath);
  db.prepare('UPDATE transactions SET is_overseas=1 WHERE id=?').run(made.body.id);
  db.close();

  const detailOf = async () => {
    const res = await api('GET', '/api/card-strategy/comparison?from=2026-01-01&to=2026-01-31');
    assert.equal(res.status, 200, res.text);
    const d = (res.body.details || []).find((x) => x.transactionId === made.body.id);
    assert.ok(d, '그 거래가 비교 결과에 없다');
    return d;
  };

  const marked = await detailOf();
  assert.equal(marked.actual.benefit, 2000,
    '원장의 is_overseas 를 안 읽으면 여기가 0 이 된다 — 오류가 아니라 그럴듯한 값이라 안 드러난다');
  assert.equal(marked.gap, 0, '실제로 받은 것이 최선이면 차액이 없다');

  // 칸을 되돌리면 값도 되돌아가야 한다. 안 그러면 위 2000 이 이 칸 때문이
  // 아니라 다른 이유로 나온 것이다.
  const db2 = new Database(server.dbPath);
  db2.prepare('UPDATE transactions SET is_overseas=0 WHERE id=?').run(made.body.id);
  db2.close();

  assert.equal((await detailOf()).actual.benefit, 0, '국내로 되돌리면 해외 전용 혜택은 빠져야 한다');
});

test('선언 검증이 라우트에서도 막는다 — 불리언이 아니면 저장되지 않는다', async () => {
  const cardId = await makeCardId();
  const res = await api('POST', '/api/card-benefits', {
    card_product_id: cardId, benefit_type: '적립', rate: 2,
    rule_json: JSON.stringify({ kind: 'rate', rate: 2, when: { overseas: 'true' } }),
  });
  assert.equal(res.status, 400, '문자열 «true» 가 저장되면 조건이 조용히 사라진다');
});
