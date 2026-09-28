'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const PORT = 21657;
const BASE = `http://127.0.0.1:${PORT}`;
// 실적 기간은 **전월 달력월**이다. asOf 를 고정해 기간을 못박는다.
// asOf '2026-07-15' → 기간 2026-06-01 ~ 2026-06-30
const AS_OF = '2026-07-15';
const IN_PERIOD = '2026-06-10';    // 기간 안
const OUT_PERIOD = '2026-05-10';   // 기간 밖
let server;

async function api(method, url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* JSON 이 아닐 수 있다 */ }
  return { status: res.status, body: json, text };
}

let pmId;           // 숫자
let expenseCatId;   // 숫자. 지출 분류
let incomeCatId;    // 숫자. 수입 분류
let seq = 0;

// **테스트마다 자기 카드를 만든다.** 카드를 공유하면 앞 테스트가 넣은 거래가
// 뒤 테스트의 합계에 섞여, 기대값이 테스트 순서에 묶인다.
async function makeCard() {
  seq += 1;
  const res = await api('POST', '/api/card-products', {
    payment_method_id: pmId, issuer: '테스트카드사',
    product_name: `실적카드${seq}`, card_type: '신용',
  });
  assert.equal(res.status, 201, res.text);
  return res.body.id;   // 숫자
}

// 그 카드로 거래 하나. 돌려주는 값은 숫자 id.
async function spend(cardId, merchant, amount, over = {}) {
  const res = await api('POST', '/api/transactions', {
    date: IN_PERIOD,
    amount,
    merchant,
    payment_method_id: pmId,
    card_product_id: cardId,
    payment_style: '일시불',
    category_id: expenseCatId,
    ...over,
  });
  assert.equal(res.status, 201, res.text);
  return res.body.id;
}

// 그 카드의 실적 거래 묶음. 응답 전체와 그 카드 몫을 같이 돌려준다.
async function cardBlock(cardId) {
  const res = await api('GET', `/api/card-strategy/threshold-transactions?asOf=${AS_OF}`);
  assert.equal(res.status, 200, res.text);
  return {
    body: res.body,
    card: (res.body.data || []).find((c) => c.cardProductId === cardId),
  };
}

before(async () => {
  server = await startTestServer({ port: PORT });

  const pms = await api('GET', '/api/payment-methods');
  const pmRows = Array.isArray(pms.body) ? pms.body : pms.body.data;
  pmId = pmRows[0].id;

  const cats = await api('GET', '/api/categories');
  const catRows = Array.isArray(cats.body) ? cats.body : cats.body.data;
  // **번호를 찍어 쓰지 않는다.** 1번이 수입이면 테스트가 통과한 척한다.
  expenseCatId = catRows.find((c) => c.major_type !== '수입').id;
  incomeCatId = catRows.find((c) => c.major_type === '수입').id;
});

// 파생 거래(할부 이자 · 리볼빙 수수료 등)를 **DB 에 직접** 넣는다.
//
// `POST /api/transactions` 는 `origin` 을 안 받는다 — 전부 `'manual'` 로 들어간다.
// 그래서 「파생은 실적에서 뺀다」 는 축을 API 로는 가를 수가 없다. 돌연변이로
// 드러났다: 그 필터를 통째로 지워도 10건이 전부 통과했다.
//
// 입력을 막아 둔 경로의 판정을 시험하려면 그 입력을 우회해야 한다. 우회 자체가
// 목적이 아니라, **그 필터가 실제로 무언가를 거르는지** 보려는 것이다.
function insertDerived(cardId, merchant, amount) {
  const Database = require('better-sqlite3');
  const db = new Database(server.dbPath);
  const info = db.prepare(`
    INSERT INTO transactions
      (date, category_id, amount, payment_method_id, card_product_id, payment_style, merchant, origin)
    VALUES (?, ?, ?, ?, ?, '일시불', ?, 'installment')
  `).run(IN_PERIOD, expenseCatId, amount, pmId, cardId, merchant);
  db.close();
  return Number(info.lastInsertRowid);
}

after(() => {
  // 단언이 던져도 자식을 죽인다. 살아남으면 러너가 상한까지 붙잡힌다.
  if (server) server.stop();
});

test('기간은 전월 달력월이다.', async () => {
  const cardId = await makeCard();
  const { body } = await cardBlock(cardId);
  assert.equal(body.period.start, '2026-06-01');
  assert.equal(body.period.end, '2026-06-30');
  assert.equal(body.asOf, '2026-07-15');
});

test('기간 안의 지출이 그 카드 묶음에 잡힌다.', async () => {
  const cardId = await makeCard();
  const id = await spend(cardId, '편의점', 10000);
  const { card } = await cardBlock(cardId);
  const tx = card.transactions.find((t) => t.id === id);
  assert.ok(tx);
  assert.equal(tx.amount, 10000);
  assert.equal(tx.excluded, false);
  assert.equal(card.countedTotal, 10000);
});

test('기간 밖의 지출은 안 잡힌다.', async () => {
  const cardId = await makeCard();
  await spend(cardId, '편의점', 10000);
  await spend(cardId, '기간밖가게', 50000, { date: OUT_PERIOD });
  const { card } = await cardBlock(cardId);
  assert.ok(!card.transactions.some((t) => t.merchant === '기간밖가게'));
  assert.equal(card.countedTotal, 10000);
});

test('수입은 안 잡힌다.', async () => {
  const cardId = await makeCard();
  await spend(cardId, '편의점', 10000);
  await spend(cardId, '월급', 3000000, { category_id: incomeCatId });
  const { card } = await cardBlock(cardId);
  assert.ok(!card.transactions.some((t) => t.merchant === '월급'));
  assert.equal(card.countedTotal, 10000);
});

test('제외하면 excluded 가 서고 합계에서 빠진다. 목록에서 사라지지는 않는다.', async () => {
  const cardId = await makeCard();
  await spend(cardId, '편의점', 10000);
  const id = await spend(cardId, '제외할가게', 7000);
  const { card } = await cardBlock(cardId);
  assert.equal(card.countedTotal, 17000);
  const res = await api('POST', '/api/card-strategy/exclusions', { transaction_id: id, reason: '상품권' });
  assert.equal(res.status, 200);
  const { card: card2 } = await cardBlock(cardId);
  const tx2 = card2.transactions.find((t) => t.id === id);
  assert.ok(tx2);
  assert.equal(tx2.excluded, true);
  assert.equal(card2.countedTotal, 10000);
});

test('같은 거래를 두 번 제외해도 한 번만 먹는다.', async () => {
  const cardId = await makeCard();
  await spend(cardId, '편의점', 10000);
  const id = await spend(cardId, '제외할가게', 7000);
  const res1 = await api('POST', '/api/card-strategy/exclusions', { transaction_id: id, reason: '상품권' });
  assert.equal(res1.status, 200);
  const res2 = await api('POST', '/api/card-strategy/exclusions', { transaction_id: id, reason: '상품권' });
  assert.equal(res2.status, 200);
  const { card } = await cardBlock(cardId);
  assert.equal(card.countedTotal, 10000);
});

test('다시 넣으면 합계로 돌아온다.', async () => {
  const cardId = await makeCard();
  await spend(cardId, '편의점', 10000);
  const id = await spend(cardId, '제외할가게', 7000);
  const res1 = await api('POST', '/api/card-strategy/exclusions', { transaction_id: id, reason: '상품권' });
  assert.equal(res1.status, 200);
  const res2 = await api('DELETE', `/api/card-strategy/exclusions/${id}`);
  assert.equal(res2.status, 200);
  assert.equal(res2.body.restored, 1);
  const { card } = await cardBlock(cardId);
  const tx = card.transactions.find((t) => t.id === id);
  assert.ok(tx);
  assert.equal(tx.excluded, false);
  assert.equal(card.countedTotal, 17000);
});

test('제외 안 된 것을 빼도 오류가 아니다. 다만 0건이라고 알린다.', async () => {
  const cardId = await makeCard();
  const id = await spend(cardId, '편의점', 10000);
  const res = await api('DELETE', `/api/card-strategy/exclusions/${id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.restored, 0);
});

test('없는 거래를 제외하려 하면 404 다.', async () => {
  const res = await api('POST', '/api/card-strategy/exclusions', { transaction_id: 999999 });
  assert.equal(res.status, 404);
});

test('거래 번호가 숫자가 아니면 400 이다.', async () => {
  const res1 = await api('POST', '/api/card-strategy/exclusions', { transaction_id: 'abc' });
  assert.equal(res1.status, 400);
  const res2 = await api('DELETE', '/api/card-strategy/exclusions/abc');
  assert.equal(res2.status, 400);
});

test('파생 거래는 실적에 안 잡힌다. API 로는 만들 수 없어 DB 에 직접 넣는다.', async () => {
  const cardId = await makeCard();
  await spend(cardId, '편의점', 10000);
  insertDerived(cardId, '할부이자', 4000);

  const { card } = await cardBlock(cardId);
  assert.ok(!card.transactions.some((t) => t.merchant === '할부이자'),
    '할부 이자·리볼빙 수수료는 카드로 쓴 돈이 아니라 그 결과다. 실적에 넣으면 실적이 부풀려진다');
  assert.equal(card.countedTotal, 10000);
});
