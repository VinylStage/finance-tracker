const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// FND-20(감사): installments.js가 SQL의 strftime(...,'now')(UTC)로 현재 연/월을
// 구해 remaining_months/billed_months를 계산했다. 이제는 JS(localYearMonth,
// 로컬 타임존 기준)에서 계산한 값을 SQL에 바인딩한다. 그 경계 자체는
// test/date.test.js의 localYearMonth 유닛테스트가 확인하고, 여기서는 리팩터링
// 후에도 실제 HTTP+DB 경로에서 경과월 산술이 여전히 정확한지 확인한다.

const PORT = 34587; // 다른 테스트와 충돌 안 나게 임의 포트 사용
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

test('FND-20: remaining_months/billed_months가 bind 파라미터 방식으로 바뀐 뒤에도 정확함', async () => {
  const now = new Date();
  const ym = (y, m) => `${y}-${String(m).padStart(2, '0')}`;

  // 이번 달에 시작한 할부: 첫 청구월이므로 1개월 청구, 5개월 남음
  const thisMonthStart = ym(now.getFullYear(), now.getMonth() + 1);
  const r1 = await fetch(`${BASE}/api/installments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      purchase_date: `${thisMonthStart}-01`, merchant: '이번달시작',
      total_amount: 600000, months: 6, monthly_amount: 100000,
      start_billing_month: thisMonthStart,
    }),
  });
  assert.strictEqual(r1.status, 201);

  // 3개월 전에 시작한 할부: 이번 달까지 4개월째 청구, 2개월 남음
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const threeMonthsAgoStart = ym(threeMonthsAgo.getFullYear(), threeMonthsAgo.getMonth() + 1);
  const r2 = await fetch(`${BASE}/api/installments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      purchase_date: `${threeMonthsAgoStart}-01`, merchant: '3개월전시작',
      total_amount: 600000, months: 6, monthly_amount: 100000,
      start_billing_month: threeMonthsAgoStart,
    }),
  });
  assert.strictEqual(r2.status, 201);

  const listResp = await fetch(`${BASE}/api/installments`);
  assert.strictEqual(listResp.status, 200);
  const { data } = await listResp.json();

  const thisMonthRow = data.find(i => i.merchant === '이번달시작');
  assert.strictEqual(thisMonthRow.billed_months, 1);
  assert.strictEqual(thisMonthRow.remaining_months, 5);

  const threeMonthsAgoRow = data.find(i => i.merchant === '3개월전시작');
  assert.strictEqual(threeMonthsAgoRow.billed_months, 4);
  assert.strictEqual(threeMonthsAgoRow.remaining_months, 2);
});

test('#121: 청구 기간이 끝난 진행중 할부는 GET 시점에 자동으로 완료 처리됨', async () => {
  // 2년 전에 시작해서 3개월짜리라 이미 한참 끝났어야 하는 할부
  const createResp = await fetch(`${BASE}/api/installments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      purchase_date: '2024-01-01', merchant: '오래전종료된할부',
      total_amount: 300000, months: 3, monthly_amount: 100000,
      start_billing_month: '2024-01',
    }),
  });
  assert.strictEqual(createResp.status, 201);
  const { id } = await createResp.json();

  // GET 핸들러가 응답을 만들기 전에 매번 자가교정하므로, 최초 GET 호출만으로도
  // 이미 완료 처리돼 있어야 한다.
  const afterList = await (await fetch(`${BASE}/api/installments`)).json();
  const updated = afterList.data.find(i => i.id === id);
  assert.strictEqual(updated.status, '완료', '청구 기간이 끝난 진행중 할부는 자동으로 완료 처리돼야 함');

  // status=진행중 필터에는 더 이상 나타나지 않아야 함
  const stillActiveList = await (await fetch(`${BASE}/api/installments?status=진행중`)).json();
  assert.ok(!stillActiveList.data.some(i => i.id === id), '완료 처리된 할부는 진행중 필터에서 빠져야 함');
});

// 할부 등록의 필수값 검증과 세 라우트의 404 가 비어 있었다(분기 71.4%).
// 할부는 등록 즉시 회차가 생성되므로, 잘못된 입력이 통과하면 회차까지 어긋난다.
test('I-1. 필수 값이 빠지면 400 이고 등록되지 않는다', async () => {
  const before = await (await fetch(`${BASE}/api/installments`)).json();

  const full = {
    purchase_date: '2026-01-10', merchant: '노트북', total_amount: 1200000,
    months: 12, monthly_amount: 100000, start_billing_month: '2026-02',
  };
  for (const drop of ['purchase_date', 'merchant', 'total_amount', 'months', 'monthly_amount', 'start_billing_month']) {
    const body = { ...full };
    delete body[drop];
    const r = await fetch(`${BASE}/api/installments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const parsed = await r.json();
    assert.strictEqual(r.status, 400, `${drop} 를 빼도 통과했다: ${JSON.stringify(parsed)}`);
    assert.ok(parsed.error, `${drop}: 거부 사유가 없다`);
  }

  const after = await (await fetch(`${BASE}/api/installments`)).json();
  assert.strictEqual(after.data.length, before.data.length, '거부됐는데 등록됐다');
});

test('I-2. 2개월 미만은 거부한다', async () => {
  const r = await fetch(`${BASE}/api/installments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      purchase_date: '2026-01-10', merchant: '한달할부', total_amount: 100000,
      months: 1, monthly_amount: 100000, start_billing_month: '2026-02',
    }),
  });
  const body = await r.json();
  assert.strictEqual(r.status, 400, JSON.stringify(body));
  assert.ok(body.error, '거부 사유가 없다');
});

test('I-3. 없는 할부를 건드리면 세 경로 모두 404 다', async () => {
  const gone = 999999;
  const cases = [
    ['PUT', `/api/installments/${gone}`, { memo: '수정' }],
    ['POST', `/api/installments/${gone}/derived/preview`, {}],
    ['POST', `/api/installments/${gone}/derived/apply`, { preview_token: 'x' }],
  ];
  for (const [method, path, body] of cases) {
    const r = await fetch(`${BASE}${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const parsed = await r.json();
    assert.strictEqual(r.status, 404, `${method} ${path}: ${JSON.stringify(parsed)}`);
    assert.ok(parsed.error, `${method} ${path}: 거부 사유가 없다`);
  }
});

// /billing-estimate 는 저장 전에 청구 계획을 보여 주는 별도 라우트다. 등록과 같은
// 검증을 따로 갖고 있는데 어느 쪽도 확인되지 않았다. 여기가 통과시키면 화면에는
// 계획이 뜨고 저장에서 거부돼, 사용자는 왜 안 되는지 모른다.
test('I-4. 청구 견적도 같은 입력 검증을 한다', async () => {
  const full = { total_amount: 1200000, months: 12, start_billing_month: '2026-02' };

  for (const drop of ['total_amount', 'months', 'start_billing_month']) {
    const body = { ...full };
    delete body[drop];
    const r = await fetch(`${BASE}/api/installments/billing-estimate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const parsed = await r.json();
    assert.strictEqual(r.status, 400, `${drop} 를 빼도 통과했다: ${JSON.stringify(parsed)}`);
  }

  const short = await fetch(`${BASE}/api/installments/billing-estimate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...full, months: 1 }),
  });
  const shortBody = await short.json();
  assert.strictEqual(short.status, 400, `1개월인데 통과했다: ${JSON.stringify(shortBody)}`);

  const ok = await fetch(`${BASE}/api/installments/billing-estimate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(full),
  });
  assert.strictEqual(ok.status, 200, await ok.text());
});
