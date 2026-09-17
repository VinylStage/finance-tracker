'use strict';

// 해외 표시 백필을 **되돌릴 수 있는가**(#710 · ADR 0008).
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 따로 보는가
//
// 백필 프리뷰가 `undoable: true` 를 낸다. 그런데 그 값은 **손으로 적은 상수**다 —
// 「감사 트리거가 UPDATE 를 행마다 잡고 한 action_id 로 묶으니 되돌아갈 것이다」
// 라는 **추론**이지, 실제로 되돌려 본 것이 아니었다.
//
// 그 추론이 틀릴 수 있는 자리가 둘이다.
//
//   1. `setAuditLabel` 만 부르고 `runAs` 로 감싸지 않으면 action_id 가 행마다
//      갈려 한 번에 안 돌아간다
//   2. `is_overseas` 가 감사 트리거의 JSON 목록에 없으면 before 값이 안 남아,
//      되돌려도 그 칸만 제자리로 안 온다 (034 로 새로 생긴 칸이다)
//
// 화면은 「되돌리기로 되돌릴 수 있어요」 라고 **약속한다.** 지키는지 여기서 본다.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const PORT = 21655;
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

async function spend(merchant, amount) {
  const res = await api('POST', '/api/transactions', {
    date: '2026-01-11', amount, merchant,
    payment_method_id: pmId, payment_style: '일시불', category_id: expenseCatId,
  });
  assert.equal(res.status, 201, res.text);
  return res.body.id;
}

function overseasIds() {
  const Database = require('better-sqlite3');
  const db = new Database(server.dbPath, { readonly: true });
  const rows = db.prepare('SELECT id FROM transactions WHERE is_overseas=1 ORDER BY id').all();
  db.close();
  return rows.map((r) => r.id);
}

before(async () => {
  server = await startTestServer({ port: PORT });
  const pms = await api('GET', '/api/payment-methods');
  pmId = (Array.isArray(pms.body) ? pms.body : pms.body.data)[0].id;
  const cats = await api('GET', '/api/categories');
  const rows = Array.isArray(cats.body) ? cats.body : cats.body.data;
  expenseCatId = rows.find((c) => c.major_type !== '수입').id;

  await spend('ANTHROPIC,USD:5.50', 8116);
  await spend('OPENAI *CHATGPT SUBSCR SAN FRANCISCO USA', 32494);
  await spend('동네분식', 9000);
});

after(() => {
  // 단언이 던져도 자식을 죽인다. 살아남으면 러너가 상한까지 붙잡힌다(#602).
  if (server) server.stop();
});

test('백필한 뒤 되돌리면 표시가 전부 제자리로 온다', async () => {
  const pre = await api('GET', '/api/card-overseas/backfill/preview');
  assert.equal(pre.body.count, 2, '표시가 있는 둘만 대상이어야 한다');

  const done = await api('POST', '/api/card-overseas/backfill', {
    preview_token: pre.body.preview_token,
  });
  assert.equal(done.status, 200, done.text);
  assert.equal(overseasIds().length, 2);

  // 되돌릴 것으로 잡히는가. 여기서 안 잡히면 화면의 「되돌리기」 에 안 뜬다.
  const cand = await api('GET', '/api/audit/undoable');
  assert.equal(cand.status, 200, cand.text);
  assert.ok(cand.body.undoable, '되돌릴 작업으로 안 잡힌다');
  assert.match(cand.body.undoable.label, /해외결제 표시/,
    '라벨이 없으면 사용자가 무엇을 되돌리는지 모른 채 누르게 된다');
  assert.equal(cand.body.undoable.affected, 2,
    '2건을 한 action_id 로 묶어야 한 번에 되돌아간다');

  const undone = await api('POST', '/api/audit/undo', { action_id: cand.body.undoable.action_id });
  assert.equal(undone.status, 200, undone.text);

  assert.deepEqual(overseasIds(), [],
    '034 로 새로 생긴 칸이라 감사 트리거의 JSON 목록에 빠져 있으면 여기만 안 돌아온다');
});

test('되돌린 뒤 프리뷰가 다시 그 둘을 잡는다 — 되돌리기가 실제로 원상태를 만들었다', async () => {
  const pre = await api('GET', '/api/card-overseas/backfill/preview');
  assert.equal(pre.body.count, 2);
  assert.deepEqual(pre.body.byEvidence, { currency: 1, country: 1 });
});
