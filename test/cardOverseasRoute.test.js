'use strict';

// 해외 표시 백필 라우트(#710 · ADR 0008).
//
// 계산은 `cardOverseas.test.js` 가 못박는다. 여기서 보는 것은 **게이트**다 —
// 프리뷰 없이 쓸 수 있는가, 프리뷰 이후 원장이 움직였는데도 쓰는가.
//
// ADR 0008 이 «지켜지지 않을 수 있는 지점» 으로 적은 것이 정확히 이 자리다.
// 화면에서만 막고 엔드포인트가 열려 있으면 원칙이 반쪽이 된다.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const PORT = 21643;
const BASE = `http://127.0.0.1:${PORT}`;
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

let pmId;
let expenseCatId;

async function spend(merchant, amount = 10000) {
  const res = await api('POST', '/api/transactions', {
    date: '2026-01-11', amount, merchant,
    payment_method_id: pmId, payment_style: '일시불', category_id: expenseCatId,
  });
  assert.equal(res.status, 201, res.text);
  return res.body.id;
}

function markedCount() {
  const Database = require('better-sqlite3');
  const db = new Database(server.dbPath, { readonly: true });
  const c = db.prepare('SELECT COUNT(*) c FROM transactions WHERE is_overseas=1').get().c;
  db.close();
  return c;
}

before(async () => {
  server = await startTestServer({ port: PORT });
  const pms = await api('GET', '/api/payment-methods');
  pmId = (Array.isArray(pms.body) ? pms.body : pms.body.data)[0].id;
  const cats = await api('GET', '/api/categories');
  const rows = Array.isArray(cats.body) ? cats.body : cats.body.data;
  expenseCatId = rows.find((c) => c.major_type !== '수입').id;

  await spend('ANTHROPIC,USD:5.50', 8116);
  await spend('ANTHROPIC              SAN FRANCISCO USA', 12106);
  await spend('동네분식', 9000);
  await spend('Adobe', 14520);
});

after(() => {
  // 단언이 던져도 자식을 죽인다. 살아남으면 러너가 상한까지 붙잡힌다(#602).
  if (server) server.stop();
});

test('프리뷰는 건수·금액·근거·사례를 내고 DB 를 바꾸지 않는다', async () => {
  const res = await api('GET', '/api/card-overseas/backfill/preview');
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.count, 2, '표시가 있는 둘만 잡혀야 한다');
  assert.equal(res.body.amount, 20222);
  assert.deepEqual(res.body.byEvidence, { currency: 1, country: 1 });
  assert.equal(res.body.samples.length, 2);
  assert.ok(res.body.preview_token, '지문이 없으면 실행 쪽이 대조할 것이 없다');
  assert.equal(res.body.undoable, true);

  assert.equal(markedCount(), 0, '프리뷰가 DB 를 바꾸면 ADR 0008 의 첫 요건이 깨진다');
});

test('프리뷰 없이 실행하면 428 — 화면 밖에서도 막힌다', async () => {
  const res = await api('POST', '/api/card-overseas/backfill', {});
  assert.equal(res.status, 428, res.text);
  assert.equal(res.body.preview_required, true);
  assert.equal(markedCount(), 0);
});

test('프리뷰 이후 대상이 달라졌으면 409 — 사용자가 본 것과 다른 것을 쓰지 않는다', async () => {
  const pre = await api('GET', '/api/card-overseas/backfill/preview');
  assert.equal(pre.status, 200);

  // 그 사이 해외 결제가 하나 더 들어왔다. 옛 지문으로 쓰면 사용자가 «2건» 으로
  // 확인한 것이 3건 바뀐다.
  await spend('OPENAI *CHATGPT SUBSCR SAN FRANCISCO USA', 32494);

  const res = await api('POST', '/api/card-overseas/backfill', { preview_token: pre.body.preview_token });
  assert.equal(res.status, 409, res.text);
  assert.equal(res.body.preview_stale, true);
  assert.equal(markedCount(), 0);
});

test('맞는 지문이면 쓴다 — 표시 있는 것만, 남은 건수는 0', async () => {
  const pre = await api('GET', '/api/card-overseas/backfill/preview');
  assert.equal(pre.body.count, 3, '앞 테스트가 하나 더 넣었다');

  const res = await api('POST', '/api/card-overseas/backfill', { preview_token: pre.body.preview_token });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.updated, 3);
  assert.equal(res.body.remaining, 0, '남은 건수가 0 이어야 끝난 것이다');

  assert.equal(markedCount(), 3, '표시 없는 「동네분식」·「Adobe」 는 안 건드린다');
});

test('두 번째 프리뷰는 0건 — 다 채운 뒤에는 할 일이 없다', async () => {
  const res = await api('GET', '/api/card-overseas/backfill/preview');
  assert.equal(res.body.count, 0);
  assert.deepEqual(res.body.samples, []);
});

test('감사 이력에 라벨이 남는다 — 되돌릴지 판단할 근거다', async () => {
  const res = await api('GET', '/api/audit/log?limit=200');
  assert.equal(res.status, 200, res.text);
  const hit = (res.body.data || []).find(
    (r) => typeof r.action_label === 'string' && r.action_label.includes('해외결제 표시')
  );
  assert.ok(hit, '라벨 없이 묶인 대량 변경은 되돌릴지 판단할 수 없다 (#298)');
  assert.equal(hit.table_name, 'transactions');
});
