const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const PORT = 34596; // 다른 테스트와 충돌 안 나게 임의 포트 사용
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
  // 기존 before 안에 있던 나머지 준비 작업은 이 아래에 그대로 남긴다
});

after(() => {
  if (server) server.stop();
});

const SHINHAN_CSV = [
  '거래일자,가맹점,금액',
  '2026.02.10,교보문고,15000',
  '2026.02.11,이마트,32000',
].join('\n');

test('POST /api/csv-import?preview=true - 저장 없이 신규/중복 건수만 반환', async () => {
  const resp = await fetch(`${BASE}/api/csv-import?preview=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardCompany: 'shinhan', csvText: SHINHAN_CSV }),
  });
  assert.strictEqual(resp.status, 200);
  const body = await resp.json();
  assert.strictEqual(body.count, 2);
  assert.strictEqual(body.skipped, 0);

  const listResp = await fetch(`${BASE}/api/transactions`);
  const list = await listResp.json();
  assert.strictEqual(list.total, 0, 'preview 모드는 실제로 저장하면 안 됨');
});

test('POST /api/csv-import - 실제 저장 후 재실행하면 중복으로 스킵', async () => {
  const firstResp = await fetch(`${BASE}/api/csv-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardCompany: 'shinhan', csvText: SHINHAN_CSV }),
  });
  assert.strictEqual(firstResp.status, 200);
  const first = await firstResp.json();
  assert.strictEqual(first.imported, 2);
  assert.strictEqual(first.skipped, 0);

  const secondResp = await fetch(`${BASE}/api/csv-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardCompany: 'shinhan', csvText: SHINHAN_CSV }),
  });
  const second = await secondResp.json();
  assert.strictEqual(second.imported, 0, '동일 (date, merchant, amount) 조합은 중복으로 스킵돼야 함');
  assert.strictEqual(second.skipped, 2);

  const listResp = await fetch(`${BASE}/api/transactions`);
  const list = await listResp.json();
  assert.strictEqual(list.total, 2, '두 번 실행해도 실제로 저장된 건수는 2건이어야 함');
});

test('POST /api/csv-import - 형식 오류 행은 제외하고 나머지만 저장', async () => {
  const csvWithBadRow = [
    '거래일자,가맹점,금액',
    '2026.03.01,정상거래,5000',
    '2026-99-99,잘못된날짜,abc',
  ].join('\n');

  const resp = await fetch(`${BASE}/api/csv-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardCompany: 'shinhan', csvText: csvWithBadRow }),
  });
  const body = await resp.json();
  assert.strictEqual(body.imported, 1);
  assert.strictEqual(body.invalid, 1);
});

test('POST /api/csv-import - 하나/삼성/현대는 엑셀 경로로 통일되어 CSV로는 거부됨(#88)', async () => {
  const resp = await fetch(`${BASE}/api/csv-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardCompany: 'hana', csvText: SHINHAN_CSV }),
  });
  assert.strictEqual(resp.status, 400);
  const body = await resp.json();
  assert.match(body.error, /신한카드만 지원합니다/);
});
