'use strict';

// #781 — 여윳돈 계산이 과거·없는 target 에서 끝나지 않아 서버를 멈췄다(while cur !== target).
// 그리고 날짜 검증이 2026-02-30 을 받았다. 무한루프가 돌아오면 이 파일은 시간 초과로 실패한다.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const { startTestServer } = require('../helpers/testServer');
const { spawnSync } = require('node:child_process');

const PORT = 21781;
const BASE = `http://127.0.0.1:${PORT}/api/advisor`;
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
  const db = new Database(server.dbPath);
  try {
    const a = db.prepare("INSERT INTO payment_methods (name, type) VALUES ('카드A', '신용')").run().lastInsertRowid;
    db.prepare("INSERT INTO card_products (payment_method_id, issuer, product_name, card_type, billing_cycle_day, statement_close_day) VALUES (?, 'A', 'A상품', '신용', 14, 31)").run(a);
    db.prepare("INSERT INTO cash_anchors (as_of_date, amount) VALUES ('2026-10-13', 600000)").run();
  } finally {
    db.close();
  }
});

after(() => {
  if (!server) return;
  server.stop();
  // 무한루프에 갇힌 서버는 SIGTERM 핸들러를 못 돌려 살아남고, 그 자식 때문에 테스트
  // 프로세스도 안 끝난다. 2초 뒤에도 살아 있으면 SIGKILL 로 끊는다.
  setTimeout(() => { try { server.proc.kill('SIGKILL'); } catch { /* 이미 끝났다 */ } }, 2000).unref();
});

async function get(path) {
  // 무한루프가 돌아오면 서버가 영영 답하지 않는다 — 5초에 끊어 빨리 실패하게 한다.
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(5000) });
  return { status: res.status, body: await res.json() };
}

async function postAnchor(body) {
  const res = await fetch(`${BASE}/anchor`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

test('앵커 기준일이 없는 날짜면 400', async () => {
  const r = await postAnchor({ as_of_date: '2026-02-30', amount: 1 });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.body.error, '기준일은 YYYY-MM-DD 형식이어야 합니다.');
});

test('전망 asOf 가 없는 날짜면 400', async () => {
  const r = await get('/projection?asOf=2026-04-31');
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.body.error, 'asOf 는 YYYY-MM-DD 형식이어야 합니다.');
});

test('여윳돈 spendDate·target 이 없는 날짜면 400', async () => {
  let r = await get('/headroom?asOf=2026-10-14&spendDate=2026-11-31');
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.body.error, 'spendDate 는 YYYY-MM-DD 형식이어야 합니다.');

  r = await get('/headroom?asOf=2026-10-14&target=2026-02-30');
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.body.error, 'target 는 YYYY-MM-DD 형식이어야 합니다.');
});

test('target 이 asOf 보다 과거여도 응답한다', async () => {
  const r = await get('/headroom?asOf=2026-10-14&target=2026-10-01');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.target, '2026-10-01');
});

test('정상 요청은 그대로다', async () => {
  const r = await get('/headroom?asOf=2026-10-14');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.spendDate, '2026-11-14');
});

test('엔진은 과거 target 에서 바로 끝난다', async () => {
  // 같은 프로세스에서 부르면 무한루프가 테스트 러너까지 멈춰 시간 초과도 못 건다.
  // 자식 프로세스에서 5초 안에 끝나는지 본다.
  const src = require.resolve('../../src/services/advisor/headroom');
  const out = spawnSync(process.execPath, ['-e', `const { cycleHeadroom } = require(${JSON.stringify(src)}); process.stdout.write(String(cycleHeadroom({ asOf: '2026-10-14', anchorAmount: 1, target: '2026-10-01' }).endBalance));`], { timeout: 5000, encoding: 'utf8' });
  assert.strictEqual(out.signal, null);
  assert.strictEqual(out.stdout, '1');
});
