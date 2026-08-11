// 할부 상태를 조회 시점에 계산한다(#205).
//
// 예전에는 `installments.status` 컬럼에 저장하고, `GET /api/installments` 가
// 돌 때마다 만료된 행을 '완료' 로 UPDATE 하는 스윕이 있었다. **조회가 데이터를
// 바꾸는 구조**라 감사 로그에 사용자가 하지 않은 쓰기가 쌓였고, 그것을
// actor='system' 으로 가려 두고 있었다(#297·#298).
//
// 이 파일이 지키는 것은 두 가지다.
//
//   1. 조회는 아무것도 바꾸지 않는다 — 이게 #205 의 본문이다.
//   2. 그런데도 상태는 사실과 맞는다 — 저장을 안 해도 답이 맞아야 의미가 있다.
//
// 1 만 검사하면 "status 를 아예 안 내려주는" 구현도 통과한다. 2 만 검사하면
// 스윕을 그대로 둔 구현도 통과한다. 둘이 같이 있어야 한다.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const { startTestServer } = require('./helpers/testServer');

const PORT = 34611;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
});

after(() => {
  if (server) server.stop();
});

// 오늘을 기준으로 개월 단위로 움직인 'YYYY-MM'.
function monthOffset(delta) {
  const n = new Date();
  const d = new Date(n.getFullYear(), n.getMonth() + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function createInstallment({ merchant, startMonth, months }) {
  const resp = await fetch(`${BASE}/api/installments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      purchase_date: `${startMonth}-01`,
      merchant,
      total_amount: 300000,
      months,
      monthly_amount: Math.round(300000 / months),
      start_billing_month: startMonth,
    }),
  });
  assert.strictEqual(resp.status, 201, `등록 실패: ${merchant}`);
  return (await resp.json()).id;
}

async function listByMerchant(merchant, query = '') {
  const resp = await fetch(`${BASE}/api/installments${query}`);
  assert.strictEqual(resp.status, 200);
  const body = await resp.json();
  return body.data.find((r) => r.merchant === merchant);
}

test('스키마에 status 컬럼이 없다', () => {
  const db = new Database(server.dbPath, { readonly: true });
  const cols = db.prepare('PRAGMA table_info(installments)').all().map((c) => c.name);
  db.close();
  assert.ok(!cols.includes('status'), `status 가 아직 있다: ${cols.join(', ')}`);
});

test('청구 기간이 끝났으면 완료로 계산된다', async () => {
  // 12개월 전에 시작한 3개월 할부 — 한참 전에 끝났다.
  await createInstallment({ merchant: '끝난할부', startMonth: monthOffset(-12), months: 3 });
  const row = await listByMerchant('끝난할부');
  assert.strictEqual(row.status, '완료');
});

test('청구 기간 중이면 진행중으로 계산된다', async () => {
  await createInstallment({ merchant: '도는할부', startMonth: monthOffset(-1), months: 12 });
  const row = await listByMerchant('도는할부');
  assert.strictEqual(row.status, '진행중');
});

// 경계는 "마지막 청구월의 다음 달 1일" 이다. 그 달에 들어선 순간 끝난 것으로 본다.
//
// 이 단언이 없으면 `>=` 를 `>` 로 바꿔도 아무 테스트가 안 깨진다 — 하루짜리
// 차이라 다른 픽스처는 전부 경계에서 멀리 떨어져 있다.
test('마지막 청구월의 다음 달에 들어서면 완료다', async () => {
  // 3개월 전에 시작한 3개월 할부: 마지막 청구월이 지난달, 경계는 이번 달 1일.
  await createInstallment({ merchant: '경계할부', startMonth: monthOffset(-3), months: 3 });
  const row = await listByMerchant('경계할부');
  assert.strictEqual(row.status, '완료');

  // 같은 조건에서 한 달만 늦게 시작하면 이번 달이 마지막 청구월이라 아직 진행중.
  await createInstallment({ merchant: '경계직전할부', startMonth: monthOffset(-2), months: 3 });
  const still = await listByMerchant('경계직전할부');
  assert.strictEqual(still.status, '진행중');
});

test('조기 완납일이 지났으면 개월수가 남아 있어도 완료다', async () => {
  const id = await createInstallment({
    merchant: '선납할부', startMonth: monthOffset(-1), months: 24,
  });

  // 기간만 보면 한참 진행중이다.
  assert.strictEqual((await listByMerchant('선납할부')).status, '진행중');

  // 조기 완납일을 어제로 박는다. `paid_off_on` 은 회차를 다시 만드는 값이라
  // 프리뷰 지문을 요구한다(ADR 0008).
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const preview = await fetch(`${BASE}/api/installments/${id}/derived/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paid_off_on: yesterday }),
  });
  assert.strictEqual(preview.status, 200);
  const previewBody = await preview.json();

  const put = await fetch(`${BASE}/api/installments/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paid_off_on: yesterday, preview_token: previewBody.data.fingerprint }),
  });
  assert.strictEqual(put.status, 200);

  assert.strictEqual((await listByMerchant('선납할부')).status, '완료');
});

test('status 질의는 계산값으로 거른다', async () => {
  const running = await listByMerchant('도는할부', '?status=진행중');
  assert.ok(running, '진행중 필터에 도는할부가 없다');

  const wrongBucket = await listByMerchant('도는할부', '?status=완료');
  assert.strictEqual(wrongBucket, undefined, '진행중 건이 완료 필터에 잡혔다');

  const done = await listByMerchant('끝난할부', '?status=완료');
  assert.ok(done, '완료 필터에 끝난할부가 없다');
});

// #205 의 본문. 조회가 쓰기를 하지 않는다.
//
// 감사 로그 행수로 잰다. 스윕이 남아 있으면 만료된 할부가 있는 상태에서 GET 을
// 부를 때마다 UPDATE 트리거가 돌아 행이 늘어난다. 위 테스트들이 이미 만료된
// 할부를 만들어 뒀으므로 스윕이 있다면 여기서 반드시 잡힌다.
test('조회는 DB 를 바꾸지 않는다', async () => {
  const db = new Database(server.dbPath, { readonly: true });
  const countAudit = () => db.prepare('SELECT count(*) AS c FROM audit_log').get().c;
  const snapshot = () => JSON.stringify(
    db.prepare('SELECT * FROM installments ORDER BY id').all()
  );

  const auditBefore = countAudit();
  const rowsBefore = snapshot();

  for (let i = 0; i < 3; i += 1) {
    const resp = await fetch(`${BASE}/api/installments`);
    assert.strictEqual(resp.status, 200);
  }

  const auditAfter = countAudit();
  const rowsAfter = snapshot();
  db.close();

  assert.strictEqual(auditAfter, auditBefore, '조회가 감사 로그를 남겼다');
  assert.strictEqual(rowsAfter, rowsBefore, '조회가 할부 행을 바꿨다');
});

// 없앤 경로가 되살아나면 여기서 걸린다(#205).
test('되돌리기 경로는 없다', async () => {
  const row = await listByMerchant('끝난할부');
  const resp = await fetch(`${BASE}/api/installments/${row.id}/reopen`, { method: 'POST' });
  assert.strictEqual(resp.status, 404);
});
