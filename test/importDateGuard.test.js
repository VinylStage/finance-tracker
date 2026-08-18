const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { startTestServer } = require('./helpers/testServer');

// 포트는 20000~21999 에서 고른다(#627). 21627 은 아직 아무 테스트도 쓰지 않는다.
const PORT = 21627;
const BASE = `http://127.0.0.1:${PORT}`;
let server;
let categoryName;

before(async () => {
  server = await startTestServer({ port: PORT });
  // 분류 이름은 초기 데이터에서 읽는다. **문자열로 적어 넣지 않는다.**
  const listed = await req('GET', '/api/categories');
  const rows = Array.isArray(listed.body) ? listed.body : listed.body.data;
  categoryName = rows[0].name;
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

// 「글자꼴은 맞는데 날짜가 아닌」 값들. 예전 정규식은 이 셋을 전부 통과시켰다.
const BAD_DATES = ['2026-13-45', '0000-00-00', '2026-02-30'];

function row(date, merchant) {
  return { date, merchant, amount: -1000, category_name: categoryName, memo: null };
}

// 항상 append 다. overwrite 는 기존 거래를 전부 지우므로 쓰지 않는다.
function importRows(rows) {
  return req('POST', '/api/data/import', { mode: 'append', transactions: rows });
}

async function allDates() {
  const all = await req('GET', '/api/transactions?limit=500');
  const rows = Array.isArray(all.body) ? all.body : all.body.data;
  return rows.map((t) => String(t.date));
}

test('나쁜 날짜 셋은 스킵되고 정상 하나만 들어간다', async () => {
  const rows = [
    ...BAD_DATES.map(d => row(d, `bad-${d}`)),
    row('2026-03-01', '정상복원')
  ];
  const res = await importRows(rows);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.imported, 1);
  assert.strictEqual(res.body.skipped, 3);
});

test('스킵된 값이 실제로 저장되지 않았다', async () => {
  const rows = [
    ...BAD_DATES.map(d => row(d, `bad-${d}`)),
    row('2026-03-01', '정상복원')
  ];
  await importRows(rows);
  const dates = await allDates();
  for (const bad of BAD_DATES) {
    assert(!dates.includes(bad), `날짜 ${bad}가 저장되어서는 안 됩니다`);
  }
  assert(dates.includes('2026-03-01'), '정상 날짜가 저장되어야 합니다');
});

test('정상 날짜만 보내면 전부 들어간다', async () => {
  const rows = [
    row('2026-04-01', '정상A'),
    row('2024-02-29', '윤년B')
  ];
  const res = await importRows(rows);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.imported, 2);
  assert.strictEqual(res.body.skipped, 0);
});

test('없는 4월 31일도 스킵된다', async () => {
  const res = await importRows([row('2026-04-31', '없는날')]);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.imported, 0);
  assert.strictEqual(res.body.skipped, 1);
});

test('mode 를 안 주면 400 이고 아무것도 안 들어간다', async () => {
  const res = await req('POST', '/api/data/import', { transactions: [row('2026-05-01', '모드없음')] });
  assert.strictEqual(res.status, 400);
  const dates = await allDates();
  assert(!dates.includes('2026-05-01'), '날짜가 저장되어서는 안 됩니다');
});
