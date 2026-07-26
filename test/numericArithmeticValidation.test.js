const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// FND-06(감사): revolving.js/debts.js/data.js가 금액 필드를 검증 없이 산술에
// 썼다. 문자열이 오면 `+`가 문자열 연결로 동작해(예: "100"+"200"→"100200")
// 그 결과가 그대로 DB에 저장됐다. 이 파일은 asInt() 적용 후 문자열 숫자가
// 정상적으로 강제변환되고, 숫자가 아닌 값은 400으로 거부되는지 확인한다.

const PORT = 34588; // 다른 테스트와 충돌 안 나게 임의 포트 사용
const BASE = `http://127.0.0.1:${PORT}`;
let serverProcess;
let dbPath;

let serverOutput = '';

before(async () => {
  dbPath = path.join(os.tmpdir(), `finance-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  serverProcess = spawn('node', ['src/server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(PORT), DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.on('data', (d) => { serverOutput += d.toString(); });
  serverProcess.stderr.on('data', (d) => { serverOutput += d.toString(); });
  serverProcess.on('exit', (code, signal) => { serverOutput += `\n[server exited] code=${code} signal=${signal}\n`; });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`서버가 15초 안에 기동하지 않음. 서버 출력:\n${serverOutput || '(출력 없음)'}`);
});

after(() => {
  if (serverProcess) serverProcess.kill();
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix); } catch {}
  }
});

test('FND-06: revolving POST — 문자열 숫자는 정상 강제변환됨', async () => {
  const pmResp = await fetch(`${BASE}/api/payment-methods`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '리볼빙테스트카드', type: '신용카드' }),
  });
  const pm = await pmResp.json();

  const resp = await fetch(`${BASE}/api/revolving`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      month: '2026-01', payment_method_id: pm.id,
      carried_balance: '100', new_charge: '200', paid_amount: '50', interest: '10',
    }),
  });
  assert.strictEqual(resp.status, 201);

  const listResp = await fetch(`${BASE}/api/revolving?payment_method_id=${pm.id}`);
  const list = await listResp.json();
  // 감사 재현: 검증 없이 "+"를 쓰면 "100"+"200"-"50"+"10" 이 문자열 연결/NaN으로
  // 샜다. 지금은 100+200-50+10 = 260 이 되어야 한다.
  assert.strictEqual(list.data[0].next_carried_balance, 260);
});

test('FND-06: revolving POST — 숫자가 아닌 값은 400', async () => {
  const pmResp = await fetch(`${BASE}/api/payment-methods`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '리볼빙테스트카드2', type: '신용카드' }),
  });
  const pm = await pmResp.json();

  const resp = await fetch(`${BASE}/api/revolving`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month: '2026-02', payment_method_id: pm.id, paid_amount: 'abc' }),
  });
  assert.strictEqual(resp.status, 400);
});

test('FND-06: revolving PUT — 부분 갱신 시에도 숫자가 아닌 값은 400', async () => {
  const pmResp = await fetch(`${BASE}/api/payment-methods`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '리볼빙테스트카드3', type: '신용카드' }),
  });
  const pm = await pmResp.json();
  const createResp = await fetch(`${BASE}/api/revolving`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month: '2026-03', payment_method_id: pm.id, paid_amount: 100 }),
  });
  const created = await createResp.json();

  const putResp = await fetch(`${BASE}/api/revolving/${created.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paid_amount: 'not-a-number' }),
  });
  assert.strictEqual(putResp.status, 400);
});

test('FND-06: 감사 PoC — debts 이자 추가에 문자열 interest_amount를 보내면 400', async () => {
  const debtResp = await fetch(`${BASE}/api/debts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '테스트부채', balance: 1000000, annual_rate: 15 }),
  });
  const debt = await debtResp.json();

  const badResp = await fetch(`${BASE}/api/debts/${debt.id}/interest`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rate: 15, interest_amount: '12500', log_date: '2026-01-15' }),
  });
  // 문자열이지만 숫자로 강제변환 가능하므로 201로 정상 처리되고 값은 정확해야 한다
  assert.strictEqual(badResp.status, 201);
  const badBody = await badResp.json();
  assert.strictEqual(badBody.balance_after, 1012500);

  const rejectResp = await fetch(`${BASE}/api/debts/${debt.id}/interest`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rate: 15, interest_amount: 'not-a-number', log_date: '2026-02-15' }),
  });
  assert.strictEqual(rejectResp.status, 400);
});

test('FND-06: data.js import — amount가 숫자가 아닌 행은 skip, date 형식이 틀린 행도 skip', async () => {
  const categoriesResp = await fetch(`${BASE}/api/categories`);
  const categories = await categoriesResp.json();
  const category = categories[0];

  const importResp = await fetch(`${BASE}/api/data/import`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'append',
      transactions: [
        { date: '2026-01-15', amount: '5000', category_name: category.name, merchant: '정상(문자열금액)' },
        { date: '2026-01-16', amount: 'NaN원', category_name: category.name, merchant: '숫자아님' },
        { date: '2026/01/17', amount: 3000, category_name: category.name, merchant: '날짜형식오류' },
      ],
    }),
  });
  assert.strictEqual(importResp.status, 200);
  const result = await importResp.json();
  assert.strictEqual(result.imported, 1);
  assert.strictEqual(result.skipped, 2);

  const listResp = await fetch(`${BASE}/api/transactions?limit=10`);
  const list = await listResp.json();
  const imported = list.data.find(t => t.merchant === '정상(문자열금액)');
  assert.strictEqual(imported.amount, 5000);
});
