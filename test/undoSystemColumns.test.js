const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { startTestServer } = require('./helpers/testServer');

// 포트는 20000~21999 에서 고른다(#627). 21629 는 아직 아무 테스트도 쓰지 않는다.
const PORT = 21629;
const BASE = `http://127.0.0.1:${PORT}`;
let server;
let categoryId;

before(async () => {
  server = await startTestServer({ port: PORT });
  const listed = await req('GET', '/api/categories');
  const rows = Array.isArray(listed.body) ? listed.body : listed.body.data;
  categoryId = rows[0].id;
});

after(() => {
  if (server) server.stop();
});

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let parsed = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed };
}

// 반복규칙 하나를 만들고 id 를 돌려준다. **id 는 응답에서 읽는다.**
async function makeRule(merchant, over = {}) {
  const r = await req('POST', '/api/recurring-rules', {
    merchant,
    category_id: categoryId,
    amount: -30000,
    day_of_month: 15,
    payment_style: '해당없음',
    freq: 'monthly',
    interval: 1,
    starts_on: '2026-01-01',
    ...over,
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  return r.body.id;
}

test('따라잡기가 돈 뒤에도 규칙 생성을 되돌릴 수 있다', async () => {
  const id = await makeRule('되돌릴규칙');
  await req('POST', '/api/recurring-rules/catchup/run', {});
  const res = await req('POST', '/api/audit/undo', {});
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.ok, true);
  assert.ok(res.body.reverted >= 1);
});

test('되돌린 규칙은 목록에서 사라진다', async () => {
  const id = await makeRule('되돌릴규칙2');
  await req('POST', '/api/recurring-rules/catchup/run', {});
  await req('POST', '/api/audit/undo', {});
  const listed = await req('GET', '/api/recurring-rules');
  const rows = Array.isArray(listed.body) ? listed.body : listed.body.data;
  assert.ok(!rows.some((r) => r.id === id), '되돌린 규칙이 남아 있다');
});

// 시스템 갱신 컬럼을 비교에서 빼도 **다른 컬럼은 그대로 봐야 한다.**
// SYSTEM_COLUMNS 를 넓히면 사용자가 고친 값을 조용히 덮어쓰게 되는데, 그 경계를
// 지키는지 여기서 본다 — 수정을 되돌리면 merchant 가 원래 값으로 돌아와야 한다.
//
// PUT /api/recurring-rules/:id 는 **부분 수정을 지원하지 않는다.** merchant 만
// 보내면 400 「category_id, amount required」 다(2026-08-18 실측). 전체 본문을 준다.
test('수정을 되돌리면 사용자가 고친 값이 원래대로 돌아온다', async () => {
  const id = await makeRule('충돌규칙');
  const res = await req('PUT', `/api/recurring-rules/${id}`, {
    merchant: '고친이름',
    category_id: categoryId,
    amount: -30000,
    day_of_month: 15,
    payment_style: '해당없음',
    freq: 'monthly',
    interval: 1,
    starts_on: '2026-01-01',
  });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));

  const firstUndo = await req('POST', '/api/audit/undo', {});
  assert.strictEqual(firstUndo.status, 200, JSON.stringify(firstUndo.body));

  const listed = await req('GET', '/api/recurring-rules');
  const rows = Array.isArray(listed.body) ? listed.body : listed.body.data;
  const found = rows.find((r) => r.id === id);
  assert.ok(found, '규칙이 사라졌다 — 수정이 아니라 생성이 되돌아갔다');
  assert.strictEqual(found.merchant, '충돌규칙');
});

test('따라잡기가 만든 거래는 되돌리기 후보가 아니다', async () => {
  const id = await makeRule('시스템규칙');
  await req('POST', '/api/recurring-rules/catchup/run', {});
  const res = await req('GET', '/api/audit/undoable');
  assert.ok(res.body.undoable, 'undoable이 null이 아님');
  assert.ok(!res.body.undoable.tables.includes('transactions'), 'transactions가 tables에 포함되지 않음');
});

// 시스템 갱신 컬럼을 빼는 것과 «충돌 감지를 없애는 것» 은 다르다.
//
// action_id 를 찍어서 「생성」 을 되돌리려 하면, 그 사이에 수정이 있었으므로
// 409 여야 한다. 이 테스트가 없으면 비교를 통째로 없애도 나머지가 다 통과한다
// — 실제로 돌연변이(모든 컬럼을 비교에서 빼기)가 안 죽었다.
test('그 사이에 값이 바뀐 작업은 action_id 를 찍어도 409 다', async () => {
  const id = await makeRule('충돌감지규칙');
  const created = await req('GET', '/api/audit/undoable');
  const createActionId = created.body.undoable.action_id;

  const put = await req('PUT', `/api/recurring-rules/${id}`, {
    merchant: '값이바뀜',
    category_id: categoryId,
    amount: -50000,
    day_of_month: 15,
    payment_style: '해당없음',
    freq: 'monthly',
    interval: 1,
    starts_on: '2026-01-01',
  });
  assert.strictEqual(put.status, 200, JSON.stringify(put.body));

  const res = await req('POST', '/api/audit/undo', { action_id: createActionId });
  assert.strictEqual(res.status, 409, JSON.stringify(res.body));
  assert.ok(res.body.error, '이유가 비어 있다');
});

// 따라잡기가 만든 거래는 후보 목록에서 빠지는 것으로 끝나지 않는다 —
// action_id 를 직접 찍어도 거부되어야 한다. 후보 필터만 있고 거부가 없으면
// 화면이 id 를 들고 부르는 순간 시스템 작업이 되돌아간다.
test('시스템이 한 작업은 action_id 를 찍어도 되돌릴 수 없다', async () => {
  await makeRule('시스템거부규칙');
  await req('POST', '/api/recurring-rules/catchup/run', {});

  const db = require('better-sqlite3')(server.dbPath);
  const row = db.prepare(
    "SELECT action_id FROM audit_log WHERE actor='system' AND table_name='transactions' LIMIT 1"
  ).get();
  db.close();
  assert.ok(row, '따라잡기가 만든 거래의 감사 기록이 없다');

  const res = await req('POST', '/api/audit/undo', { action_id: row.action_id });
  assert.notStrictEqual(res.status, 200, '시스템 작업이 되돌아갔다');
  // **거부된 이유까지 본다.** 거부 자체는 다른 검사(값이 바뀌었다 등)로도 일어날 수
  // 있어서, 상태 코드만 보면 «시스템 작업이라 막았다» 가 사라져도 통과한다.
  assert.match(res.body.error, /자동/, `다른 이유로 막혔다: ${res.body.error}`);
});

test('되돌릴 것이 없으면 400 이다', async () => {
  for (let i = 0; i < 20; i += 1) {
    const probe = await req('GET', '/api/audit/undoable');
    if (!probe.body.undoable) break;
    await req('POST', '/api/audit/undo', {});
  }
  const last = await req('POST', '/api/audit/undo', {});
  assert.strictEqual(last.status, 400);
});
