const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { startTestServer } = require('./helpers/testServer');

// 포트는 20000~21999 에서 고른다(#627). 21637 은 아직 아무 테스트도 쓰지 않는다.
const PORT = 21637;
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

// 반복규칙을 만들고 따라잡기를 돌려 거래를 만든다. 만들어진 거래의 id 목록을 준다.
async function makeRecurringTransactions(merchant) {
  const made = await req('POST', '/api/recurring-rules', {
    merchant,
    category_id: categoryId,
    amount: -30000,
    day_of_month: 15,
    payment_style: '해당없음',
    freq: 'monthly',
    interval: 1,
    starts_on: '2026-01-01',
  });
  assert.strictEqual(made.status, 201, JSON.stringify(made.body));

  const run = await req('POST', '/api/recurring-rules/catchup/run', {});
  assert.strictEqual(run.status, 200, JSON.stringify(run.body));

  const listed = await req('GET', '/api/transactions?limit=500');
  const rows = Array.isArray(listed.body) ? listed.body : listed.body.data;
  const ids = rows.filter((t) => t.merchant === merchant).map((t) => t.id);
  assert.ok(ids.length >= 2, `거래가 ${ids.length}건뿐이다`);
  return ids;
}

async function totalCount() {
  const listed = await req('GET', '/api/transactions?limit=1');
  return listed.body.total;
}

test('반복거래를 일괄로 지울 수 있다', async () => {
  const ids = await makeRecurringTransactions('일괄대상');
  const res = await req('DELETE', '/api/transactions', { ids });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.deleted, ids.length);
});

test('지운 거래가 목록에서 사라진다', async () => {
  const ids = await makeRecurringTransactions('일괄대상2');
  const res = await req('DELETE', '/api/transactions', { ids });
  assert.strictEqual(res.status, 200);

  const listed = await req('GET', '/api/transactions?limit=500');
  const rows = Array.isArray(listed.body) ? listed.body : listed.body.data;
  const found = rows.filter((t) => t.merchant === '일괄대상2');
  assert.strictEqual(found.length, 0);
});

test('지운 거래는 따라잡기로 되살아나지 않는다', async () => {
  const ids = await makeRecurringTransactions('일괄대상3');
  const res = await req('DELETE', '/api/transactions', { ids });
  assert.strictEqual(res.status, 200);

  const run = await req('POST', '/api/recurring-rules/catchup/run', {});
  assert.strictEqual(run.status, 200);
  assert.strictEqual(run.body.created, 0);

  const listed = await req('GET', '/api/transactions?limit=500');
  const rows = Array.isArray(listed.body) ? listed.body : listed.body.data;
  const found = rows.filter((t) => t.merchant === '일괄대상3');
  assert.strictEqual(found.length, 0);
});

// 지운 거래가 «되살아나지 않는다» 는 것은 따라잡기만으로는 안 갈린다 —
// 규칙의 last_run_on 이 이미 오늘이라 어차피 과거를 다시 안 만든다.
//
// 재활성화(mode: 'all')는 그 지점을 되돌려 처음부터 다시 훑는다. 그때 막아 주는
// 것이 recurring_occurrences 의 발생 기록이다. 연결만 끊지 않고 기록까지 지우면
// **사용자가 지운 거래가 여기서 되살아난다.**
test('일괄 삭제 뒤 재활성화해도 지운 거래가 되살아나지 않는다', async () => {
  const merchant = '재활성화대상';
  const made = await req('POST', '/api/recurring-rules', {
    merchant,
    category_id: categoryId,
    amount: -30000,
    day_of_month: 15,
    payment_style: '해당없음',
    freq: 'monthly',
    interval: 1,
    starts_on: '2026-01-01',
  });
  assert.strictEqual(made.status, 201, JSON.stringify(made.body));
  const ruleId = made.body.id;

  await req('POST', '/api/recurring-rules/catchup/run', {});
  const listed = await req('GET', '/api/transactions?limit=500');
  const rows = Array.isArray(listed.body) ? listed.body : listed.body.data;
  const ids = rows.filter((t) => t.merchant === merchant).map((t) => t.id);
  assert.ok(ids.length >= 2, `거래가 ${ids.length}건뿐이다`);

  const removed = await req('DELETE', '/api/transactions', { ids });
  assert.strictEqual(removed.status, 200, JSON.stringify(removed.body));

  // **`mode: 'all'` 로는 안 갈린다** — 그 모드는 is_active 만 켜고 last_run_on 을
  // 안 건드려서 어차피 과거를 다시 안 본다. 시작 지점을 과거로 옮기는
  // `from-date` 라야 처음부터 다시 훑는다(소스를 읽어 확인했다).
  const revived = await req('POST', `/api/recurring-rules/${ruleId}/reactivate`, {
    mode: 'from-date',
    // **`startsOn` 이다** — 이 라우트만 카멜이다. `starts_on` 으로 보내면
    // 「재개할 날짜를 YYYY-MM-DD 로 보내 주세요」 400 이 난다(실측).
    startsOn: '2026-01-01',
  });
  assert.strictEqual(revived.status, 200, JSON.stringify(revived.body));

  // 재활성화는 시작 지점만 되돌린다. 실제로 다시 만드는 것은 따라잡기다.
  await req('POST', '/api/recurring-rules/catchup/run', {});

  const after = await req('GET', '/api/transactions?limit=500');
  const afterRows = Array.isArray(after.body) ? after.body : after.body.data;
  assert.strictEqual(
    afterRows.filter((t) => t.merchant === merchant).length,
    0,
    '지운 거래가 재활성화로 되살아났다'
  );
});

test('전체 삭제도 된다', async () => {
  const ids = await makeRecurringTransactions('전체대상');
  const res = await req('DELETE', '/api/transactions', { all: true, confirm: 'DELETE_ALL' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(await totalCount(), 0);
});

test('확인 토큰 없이 전체 삭제하면 400 이고 아무것도 안 지워진다', async () => {
  const ids = await makeRecurringTransactions('토큰없음');
  const res = await req('DELETE', '/api/transactions', { all: true });
  assert.strictEqual(res.status, 400);
  assert.notStrictEqual(await totalCount(), 0);
});
