'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// 잔액 라우트가 현금흐름 시점을 실제로 읽는지(#291).
//
// accountBalanceSettlement.test.js 는 **순수 함수**를 본다. 그 층은 `settlement`
// 이 담긴 객체가 들어온다고 가정하고 시작하므로, **쿼리가 그 컬럼을 실제로
// 읽는지는 검증되지 않는다.** SELECT 목록에서 빠뜨려도 그 파일은 통과한다.
//
// 여기서는 HTTP 를 타고 응답으로 확인한다. #300 에서 "테스트는 통과하는데
// 실제로는 아무것도 안 거치던" 일이 있었다.

const PORT = 34706;
const BASE = `http://127.0.0.1:${PORT}`;
let serverProcess;
let serverOutput = '';
let dbPath;
let catExpense, catIncome, pmCard, acctId;

async function json(pathname, options) {
  const r = await fetch(`${BASE}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const text = await r.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* JSON 이 아닐 수 있다 */ }
  return { status: r.status, body };
}

before(async () => {
  dbPath = path.join(os.tmpdir(), `finance-bal-settle-${process.pid}.db`);
  serverProcess = spawn('node', ['src/server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(PORT), DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.on('data', (d) => { serverOutput += d.toString(); });
  serverProcess.stderr.on('data', (d) => { serverOutput += d.toString(); });
  serverProcess.on('exit', (c, s) => { serverOutput += `\n[server exited] code=${c} signal=${s}\n`; });

  const deadline = Date.now() + 15000;
  let up = false;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) { up = true; break; }
    } catch { /* 아직 기동 전 */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!up) throw new Error(`서버가 15초 안에 기동하지 않음:\n${serverOutput}`);

  const cats = (await json('/api/categories')).body;
  const rows = Array.isArray(cats) ? cats : cats.data;
  catExpense = rows.find((c) => c.major_type !== '수입').id;
  catIncome = rows.find((c) => c.major_type === '수입').id;

  // 계좌 + 그 계좌에 딸린 신용카드 결제수단.
  acctId = (await json('/api/accounts', {
    method: 'POST',
    body: JSON.stringify({ name: '주거래통장', type: '입출금', opening_balance: 1000000, opening_date: '2026-01-01' }),
  })).body.id;

  const pms = (await json('/api/payment-methods')).body;
  const pmRows = Array.isArray(pms) ? pms : pms.data;
  pmCard = pmRows[0].id;

  // **결제수단을 계좌에 잇는 API 가 없다.** 018 이 payment_methods.account_id 를
  // 만들었지만 어떤 라우트도 그 값을 쓰지 않는다(2026-08-04 실측) — #288 의
  // 잠든 절반이다. 별도 이슈로 등록했다.
  //
  // 그래서 여기서는 거래에 계좌를 직접 적는 경로로 검증한다. 그게 #289 가 낸
  // transactions.account_id 이고, 이 PR 의 COALESCE 가 우선하는 쪽이다.
});

after(() => {
  if (serverProcess) serverProcess.kill();
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix); } catch { /* 이미 없을 수 있다 */ }
  }
});

const addTx = (over) => json('/api/transactions', {
  method: 'POST',
  body: JSON.stringify({
    date: '2026-03-01', amount: 10000, category_id: catExpense,
    payment_method_id: pmCard, account_id: acctId, ...over,
  }),
});

const balance = async () => (await json(`/api/accounts/${acctId}`)).body;

describe('A. 라우트가 settlement 를 읽는다', () => {
  test('A-1. deferred 는 통장 잔액을 줄이지 않는다', async () => {
    const before = await balance();
    assert.equal(before.balance, 1000000, '전제: 초기 잔액');

    const r = await addTx({ amount: 30000, settlement: 'deferred', billing_month: '2026-04' });
    assert.equal(r.status, 201, JSON.stringify(r.body));

    const after = await balance();
    assert.equal(after.balance, 1000000, 'deferred 가 잔액을 줄였다 — 쿼리가 settlement 를 안 읽는다');
    assert.equal(after.deferred, 1, 'deferred 건수가 안 잡힌다');
  });

  test('A-2. 카드 미결제액이 응답에 담긴다', async () => {
    const b = await balance();
    assert.ok(b.card_unpaid, 'card_unpaid 가 응답에 없다');
    assert.equal(b.card_unpaid.total, 30000);
    assert.equal(b.card_unpaid.byMonth['2026-04'].unpaid, 30000);
  });

  test('A-3. settlement 거래가 잔액과 미결제액을 함께 줄인다', async () => {
    const r = await addTx({ amount: 30000, settlement: 'settlement', billing_month: '2026-04' });
    assert.equal(r.status, 201, JSON.stringify(r.body));

    const b = await balance();
    assert.equal(b.balance, 970000, '카드대금 인출이 잔액을 안 줄였다');
    assert.equal(b.card_unpaid.total, 0, '정산됐는데 미결제액이 남았다');
  });

  test('A-4. immediate 는 기존대로 즉시 빠진다', async () => {
    await addTx({ amount: 5000, settlement: 'immediate' });
    const b = await balance();
    assert.equal(b.balance, 965000);
  });

  test('A-5. settlement 를 안 보낸 거래도 기존대로 동작한다', async () => {
    // 화면이 아직 이 필드를 안 보낸다. 그 경로가 안 바뀌는 것이 이 PR 의 제약이다.
    await addTx({ amount: 5000 });
    const b = await balance();
    assert.equal(b.balance, 960000);
  });

  test('A-6. 수입은 더해진다 — 방향과 시점은 다른 축이다', async () => {
    await addTx({ amount: 100000, category_id: catIncome, settlement: 'immediate' });
    const b = await balance();
    assert.equal(b.balance, 1060000);
  });
});

describe('B. 청구월을 모르는 건', () => {
  test('B-1. unassigned 로 빠지고 총액에는 잡힌다', async () => {
    // 카드 청구 주기를 아직 입력하지 않은 상태다(#290 폴백). 화면이
    // "청구월을 모르는 거래 N건" 을 안내할 수 있어야 한다.
    await addTx({ amount: 7000, settlement: 'deferred' }); // billing_month 없음

    const b = await balance();
    assert.equal(b.card_unpaid.unassigned.count, 1);
    assert.equal(b.card_unpaid.unassigned.deferred, 7000);
    assert.equal(b.card_unpaid.total, 7000);
    assert.equal(b.balance, 1060000, 'deferred 가 잔액을 건드렸다');
  });
});

describe('C. 목록 경로도 같다', () => {
  test('C-1. /balances 응답에도 card_unpaid 가 있다', async () => {
    const res = await json('/api/accounts/balances');
    assert.equal(res.status, 200);
    const mine = res.body.data.find((a) => a.id === acctId);
    assert.ok(mine, '계좌가 목록에 없다');
    assert.ok(mine.card_unpaid, '목록 응답에 card_unpaid 가 없다');
    assert.equal(mine.balance, 1060000);
  });
});
