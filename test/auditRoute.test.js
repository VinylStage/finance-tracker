const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const PORT = 34625;
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
  try { json = text ? JSON.parse(text) : null; } catch { /* 본문이 JSON 이 아닐 수 있다 */ }
  return { status: res.status, body: json, text };
}

// 거래 하나를 만들려면 카테고리·결제수단 id 가 필요하다. 새 DB 는 기본값이 들어간다.
let catA; let catB; let pm;

before(async () => {
  server = await startTestServer({ port: PORT });
  // 기존 before 안에 있던 나머지 준비 작업은 이 아래에 그대로 남긴다

  const cats = await api('GET', '/api/categories');
  const rows = Array.isArray(cats.body) ? cats.body : cats.body.data;
  catA = rows[0].id;
  catB = rows[1].id;
  const pms = await api('GET', '/api/payment-methods');
  const pmRows = Array.isArray(pms.body) ? pms.body : pms.body.data;
  pm = pmRows[0].id;
});

after(() => {
  if (server) server.stop();
});

function tx(over = {}) {
  return {
    date: '2026-08-04', amount: 12345, merchant: '감사 테스트',
    category_id: catA, payment_method_id: pm, ...over,
  };
}

test('A-1. 거래를 추가하면 되돌릴 후보로 잡힌다', async () => {
  const created = await api('POST', '/api/transactions', tx({ merchant: 'A-1 추가' }));
  assert.equal(created.status, 201, `생성 실패: ${created.text}`);

  const res = await api('GET', '/api/audit/undoable');
  assert.equal(res.status, 200);
  assert.ok(res.body.undoable, '방금 한 추가가 후보에 없다');
  assert.equal(res.body.undoable.affected, 1);
  assert.deepEqual(res.body.undoable.tables, ['transactions']);
});

test('A-2. 후보에 무슨 조작이었는지가 함께 온다', async () => {
  // 라벨은 선택이라 대개 비어 있다. 화면이 이름을 지어내려면 op 가 필요하다.
  await api('POST', '/api/transactions', tx({ merchant: 'A-2 추가' }));
  const res = await api('GET', '/api/audit/undoable');
  assert.deepEqual(res.body.undoable.ops, ['INSERT']);
});

test('B-1. 추가를 되돌리면 그 거래가 사라진다', async () => {
  const created = await api('POST', '/api/transactions', tx({ merchant: 'B-1 되돌릴 추가' }));
  const id = created.body.id ?? created.body.data?.id;

  const before = await api('GET', `/api/transactions/${id}`);
  assert.equal(before.status, 200, '되돌리기 전에는 있어야 한다');

  const undone = await api('POST', '/api/audit/undo', {});
  assert.equal(undone.status, 200, `되돌리기 실패: ${undone.text}`);

  const after = await api('GET', `/api/transactions/${id}`);
  assert.equal(after.status, 404, '되돌렸는데 거래가 남아 있다');
});

test('B-2. 수정을 되돌리면 값이 이전으로 돌아간다', async () => {
  const created = await api('POST', '/api/transactions', tx({ merchant: 'B-2 원본', amount: 1000 }));
  const id = created.body.id ?? created.body.data?.id;

  await api('PUT', `/api/transactions/${id}`, tx({ merchant: 'B-2 고침', amount: 7777, category_id: catB }));
  const changed = await api('GET', `/api/transactions/${id}`);
  const changedRow = changed.body.data ?? changed.body;
  assert.equal(Number(changedRow.amount), 7777);

  const undone = await api('POST', '/api/audit/undo', {});
  assert.equal(undone.status, 200, `되돌리기 실패: ${undone.text}`);

  const back = await api('GET', `/api/transactions/${id}`);
  const backRow = back.body.data ?? back.body;
  assert.equal(Number(backRow.amount), 1000, '금액이 안 돌아왔다');
  assert.equal(backRow.merchant, 'B-2 원본', '가맹점이 안 돌아왔다');
  assert.equal(backRow.category_id, catA, '카테고리가 안 돌아왔다');
});

test('B-3. 삭제를 되돌리면 거래가 되살아난다', async () => {
  const created = await api('POST', '/api/transactions', tx({ merchant: 'B-3 지울 것', amount: 4242 }));
  const id = created.body.id ?? created.body.data?.id;

  await api('DELETE', `/api/transactions/${id}`);
  assert.equal((await api('GET', `/api/transactions/${id}`)).status, 404);

  const undone = await api('POST', '/api/audit/undo', {});
  assert.equal(undone.status, 200, `되돌리기 실패: ${undone.text}`);

  const back = await api('GET', `/api/transactions/${id}`);
  assert.equal(back.status, 200, '삭제를 되돌렸는데 안 살아났다');
  const row = back.body.data ?? back.body;
  // 같은 id 로 살아나야 한다. 새 id 로 살아나면 다른 곳의 참조가 끊긴다.
  assert.equal(Number(row.id), Number(id));
  assert.equal(Number(row.amount), 4242);
});

test('C-1. 같은 작업을 두 번 되돌릴 수 없다', async () => {
  await api('POST', '/api/transactions', tx({ merchant: 'C-1' }));
  const target = (await api('GET', '/api/audit/undoable')).body.undoable.action_id;

  assert.equal((await api('POST', '/api/audit/undo', { action_id: target })).status, 200);
  const twice = await api('POST', '/api/audit/undo', { action_id: target });
  assert.notEqual(twice.status, 200, '이미 되돌린 작업이 또 되돌아갔다');
});

test('C-2. 되돌린 작업은 다시 후보로 오르지 않는다', async () => {
  await api('POST', '/api/transactions', tx({ merchant: 'C-2' }));
  const target = (await api('GET', '/api/audit/undoable')).body.undoable.action_id;
  await api('POST', '/api/audit/undo', { action_id: target });

  const next = (await api('GET', '/api/audit/undoable')).body.undoable;
  if (next) assert.notEqual(next.action_id, target, '되돌린 작업이 또 후보로 떴다');
});

test('C-3. 그 사이 값이 바뀌었으면 되돌리기를 거부한다', async () => {
  // 조용히 덮어쓰는 것이 최악이라 거부한다.
  const created = await api('POST', '/api/transactions', tx({ merchant: 'C-3', amount: 100 }));
  const id = created.body.id ?? created.body.data?.id;
  const target = (await api('GET', '/api/audit/undoable')).body.undoable.action_id;

  // 뒤이어 다른 수정이 들어온다.
  await api('PUT', `/api/transactions/${id}`, tx({ merchant: 'C-3 나중 수정', amount: 555 }));

  const res = await api('POST', '/api/audit/undo', { action_id: target });
  assert.notEqual(res.status, 200, '뒤 변경을 덮어쓰며 되돌아갔다');

  const still = await api('GET', `/api/transactions/${id}`);
  const row = still.body.data ?? still.body;
  assert.equal(Number(row.amount), 555, '거부해 놓고 값은 바꿨다');
});

test('D-1. 이력 조회가 사용자 작업만 걸러 준다', async () => {
  await api('POST', '/api/transactions', tx({ merchant: 'D-1' }));
  const res = await api('GET', '/api/audit/log?actor=user&limit=50&offset=0');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data), '목록이 배열이 아니다');
  assert.ok(res.body.data.length > 0, '사용자 작업이 하나도 안 잡혔다');
  assert.ok(res.body.data.every((r) => r.actor === 'user'), 'user 로 걸렀는데 다른 actor 가 섞였다');
});

test('D-2. 이력에 전후 값이 함께 남는다', async () => {
  // 화면이 "무엇이 어떻게 바뀌었는지" 를 보여주려면 이 둘이 있어야 한다.
  const created = await api('POST', '/api/transactions', tx({ merchant: 'D-2 원본', amount: 300 }));
  const id = created.body.id ?? created.body.data?.id;
  await api('PUT', `/api/transactions/${id}`, tx({ merchant: 'D-2 고침', amount: 900 }));

  const res = await api('GET', '/api/audit/log?actor=user&limit=10&offset=0');
  const row = res.body.data.find((r) => r.op === 'UPDATE' && String(r.row_id) === String(id));
  assert.ok(row, '수정 기록이 없다');

  const before = JSON.parse(row.before_json);
  const after = JSON.parse(row.after_json);
  assert.equal(Number(before.amount), 300);
  assert.equal(Number(after.amount), 900);
});

test('D-3. 이력에 전체 건수가 함께 온다', async () => {
  // 화면이 페이지를 나누려면 필요하다.
  const res = await api('GET', '/api/audit/log?actor=all&limit=1&offset=0');
  assert.equal(res.body.data.length, 1);
  assert.ok(res.body.total > 1, `total 이 목록 길이만 반영한다: ${res.body.total}`);
});
