const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { startTestServer } = require('./helpers/testServer');

// 포트는 20000~21999 에서 고른다(#627). 21617 은 아직 아무 테스트도 쓰지 않는다.
const PORT = 21617;
const BASE = `http://127.0.0.1:${PORT}`;
let server;
let db;

before(async () => {
  server = await startTestServer({ port: PORT });
  db = require('better-sqlite3')(server.dbPath);
});

after(() => {
  if (db) db.close();
  if (server) server.stop();
});

async function fetchChecks() {
  const res = await fetch(`${BASE}/api/data-integrity`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  return data.checks;
}

function checkNamed(checks, name) {
  const found = checks.find((c) => c.name === name);
  assert.ok(found, `${name} 검사가 없다`);
  return found;
}

test('데이터 무결성 점검 — 날짜 관련 검사가 0 개', async () => {
  const checks = await fetchChecks();
  assert.strictEqual(checkNamed(checks, '비ISO 날짜 형식').count, 0);
  assert.strictEqual(checkNamed(checks, '다른 표의 날짜꼴 이상').count, 0);
});

test('데이터 무결성 점검 — NaN-NaN-01 인 거래가 걸린다', async () => {
  const catId = db.prepare("INSERT INTO categories (name, major_type) VALUES ('날짜테스트', '선택지출')").run().lastInsertRowid;
  db.prepare("INSERT INTO transactions (date, amount, payment_style, category_id) VALUES ('NaN-NaN-01', 1000, '일시불', ?)").run(catId);

  const checks = await fetchChecks();
  assert.strictEqual(checkNamed(checks, '비ISO 날짜 형식').count, 1);
});

test('데이터 무결성 점검 — 저축과 할부의 깨진 날짜가 걸린다', async () => {
  db.prepare("INSERT INTO savings_products (name, monthly_contribution, start_date, maturity_date, expected_payout) VALUES ('깨진저축', 100000, '언젠가', '2026-12-01', 1250000)").run();
  db.prepare("INSERT INTO installments (purchase_date, merchant, total_amount, months, monthly_amount, fee_per_month, start_billing_month) VALUES ('2026-01-05', '깨진할부', 120000, 12, 10000, 0, '언젠가')").run();

  const checks = await fetchChecks();
  assert.strictEqual(checkNamed(checks, '다른 표의 날짜꼴 이상').count, 2);

  const samples = checkNamed(checks, '다른 표의 날짜꼴 이상').samples;
  const savingsSample = samples.find(s => s.table_name === '저축' && s.column_name === 'start_date');
  const installmentSample = samples.find(s => s.table_name === '할부' && s.column_name === 'start_billing_month');
  assert.ok(savingsSample);
  assert.ok(installmentSample);
});

test('데이터 무결성 점검 — start_billing_month 는 YYYY-MM 이므로 정상값은 걸리지 않는다', async () => {
  db.prepare("INSERT INTO installments (purchase_date, merchant, total_amount, months, monthly_amount, fee_per_month, start_billing_month) VALUES ('2026-01-05', '정상할부', 120000, 12, 10000, 0, '2026-03')").run();

  const checks = await fetchChecks();
  assert.strictEqual(checkNamed(checks, '다른 표의 날짜꼴 이상').count, 2);
});

// 글자꼴만 보던 예전 검사가 놓치던 값들.
//
// `abcd-ef-gh` 는 길이 10 에 5·8번째가 하이픈이라 예전 검사를 그대로 통과했고,
// `2026-13-45`·`2026-02-30` 은 «없는 날짜» 라 글자꼴 검사로는 원리상 못 잡는다.
// 이 셋을 따로 넣지 않으면 검사를 예전 것으로 되돌려도 나머지 테스트가 전부
// 통과한다 — 즉 이 파일이 무엇을 지키는지 알 수 없게 된다.
test('데이터 무결성 점검 — 글자꼴은 맞는데 날짜가 아닌 값도 걸린다', async () => {
  const catId = db.prepare("INSERT INTO categories (name, major_type) VALUES ('글자꼴테스트', '선택지출')").run().lastInsertRowid;
  const before = checkNamed(await fetchChecks(), '비ISO 날짜 형식').count;

  for (const bad of ['abcd-ef-gh', '2026-13-45', '2026-02-30']) {
    db.prepare("INSERT INTO transactions (date, amount, payment_style, category_id) VALUES (?, 1000, '일시불', ?)").run(bad, catId);
  }

  const after = checkNamed(await fetchChecks(), '비ISO 날짜 형식').count;
  assert.strictEqual(after - before, 3, '세 값이 모두 걸려야 한다');
});

// GLOB 은 자리마다 숫자만 요구하므로 `2026-13` 을 통과시킨다. 달의 범위는
// 하루를 붙여 date() 로 봐야 걸린다. 이 테스트가 없으면 그 확인을 빼도
// 「2026-03 은 안 걸린다」 쪽만 남아 전부 통과한다.
test('데이터 무결성 점검 — 없는 달인 청구월도 걸린다', async () => {
  const before = checkNamed(await fetchChecks(), '다른 표의 날짜꼴 이상').count;

  db.prepare(`
    INSERT INTO installments (purchase_date, merchant, total_amount, months, monthly_amount, fee_per_month, start_billing_month)
    VALUES ('2026-01-05', '없는달할부', 120000, 12, 10000, 0, '2026-13')
  `).run();

  const after = checkNamed(await fetchChecks(), '다른 표의 날짜꼴 이상').count;
  assert.strictEqual(after - before, 1);
});
