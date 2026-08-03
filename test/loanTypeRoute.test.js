'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// #285 의 HTTP 경로. 서비스 단위 테스트(loan-type.test.js)가 계산과 규칙을 고정하면
// 여기서는 "저장이 실제로 되는가" 와 "잘못된 조합이 막히는가" 를 본다.

const PORT = 34607; // 다른 테스트와 겹치지 않는 포트
const BASE = `http://127.0.0.1:${PORT}`;
let serverProcess;
let dbPath;
let serverOutput = '';

async function json(pathname, options) {
  const r = await fetch(`${BASE}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return { status: r.status, body: await r.json() };
}

before(async () => {
  dbPath = path.join(os.tmpdir(), `finance-loan-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  serverProcess = spawn('node', ['src/server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(PORT), DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.on('data', (d) => { serverOutput += d.toString(); });
  serverProcess.stderr.on('data', (d) => { serverOutput += d.toString(); });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`서버가 15초 안에 기동하지 않음:\n${serverOutput}`);
});

after(() => {
  if (serverProcess) serverProcess.kill();
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix); } catch {}
  }
});

// 실제 사용 중인 마이너스통장 조건
const REAL = { credit_limit: 4800000, balance: 3566196, annual_rate: 4.17 };

describe('A. 등록', () => {
  test('A-1. 마이너스통장을 유형과 한도까지 저장한다', async () => {
    const res = await json('/api/debts', {
      method: 'POST',
      body: JSON.stringify({
        name: '마이너스통장', type: '마이너스통장', loan_type: 'credit_line',
        balance: REAL.balance, annual_rate: REAL.annual_rate, credit_limit: REAL.credit_limit,
        interest_day: 25, rate_effective_from: '2026-01-01',
      }),
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));

    const list = await json('/api/debts');
    const d = list.body.data.find((x) => x.id === res.body.id);
    assert.strictEqual(d.loan_type, 'credit_line');
    assert.strictEqual(d.credit_limit, 4800000);
    // 유형만 골라도 계산 설정이 정해진다
    assert.strictEqual(d.interest_settings.interest_basis, 'daily');
    assert.strictEqual(d.interest_settings.compounds, 1);
    // 한도 상태를 서버가 내려준다 — 화면이 규칙을 다시 만들면 어긋난다
    assert.strictEqual(d.credit_line.available, 1233804);
    assert.strictEqual(d.credit_line.over_limit, false);
  });

  test('A-2. 한도 없는 마이너스통장은 거부한다', async () => {
    const res = await json('/api/debts', {
      method: 'POST',
      body: JSON.stringify({ name: '한도없음', loan_type: 'credit_line', balance: 100000 }),
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error.includes('한도'));
    assert.ok(!/credit_limit|loan_type/.test(res.body.error), `내부 필드명 노출: ${res.body.error}`);
  });

  test('A-3. 등록과 동시에 금리 이력 첫 행이 생긴다', async () => {
    const res = await json('/api/debts', {
      method: 'POST',
      body: JSON.stringify({
        name: '이력확인', balance: 1000000, annual_rate: 5,
        rate_effective_from: '2026-02-01',
      }),
    });
    const rates = await json(`/api/debts/${res.body.id}/rates`);
    assert.strictEqual(rates.body.data.length, 1);
    assert.strictEqual(rates.body.data[0].annual_rate, 5);
    assert.strictEqual(rates.body.data[0].effective_from, '2026-02-01');
  });

  test('A-4. 기존 방식 등록도 그대로 된다 — general 로 남는다', async () => {
    const res = await json('/api/debts', {
      method: 'POST',
      body: JSON.stringify({ name: '학자금', type: '학자금', balance: 2000000, annual_rate: 3 }),
    });
    assert.strictEqual(res.status, 201);
    const list = await json('/api/debts');
    const d = list.body.data.find((x) => x.id === res.body.id);
    assert.strictEqual(d.loan_type, 'general');
    assert.strictEqual(d.type, '학자금');
    assert.strictEqual(d.credit_line, null);
    // M10 이전과 같은 월이자 어림값 — 2,000,000 × 3% ÷ 12 = 5,000
    assert.strictEqual(d.monthly_interest, 5000);
  });
});

describe('B. 금리 이력', () => {
  let debtId;

  test('B-1. 금리를 바꾸면 이전 구간이 닫힌다', async () => {
    const created = await json('/api/debts', {
      method: 'POST',
      body: JSON.stringify({
        name: '변동금리', loan_type: 'credit_line', balance: REAL.balance,
        annual_rate: 4.17, credit_limit: REAL.credit_limit, rate_effective_from: '2026-01-01',
      }),
    });
    debtId = created.body.id;

    const res = await json(`/api/debts/${debtId}/rates`, {
      method: 'POST',
      body: JSON.stringify({ annual_rate: 4.55, effective_from: '2026-04-01', memo: '3개월 재산정' }),
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.closed, 1);

    const rates = await json(`/api/debts/${debtId}/rates`);
    const older = rates.body.data.find((r) => r.annual_rate === 4.17);
    assert.strictEqual(older.effective_to, '2026-03-31');
  });

  test('B-2. 과거 시점의 금리를 되찾을 수 있다', async () => {
    // 이 이슈의 핵심 — 지금 금리로 소급 계산하면 그때 청구액과 다르다.
    const before = await json(`/api/debts/${debtId}/rate-on?date=2026-03-31`);
    const after = await json(`/api/debts/${debtId}/rate-on?date=2026-04-01`);
    assert.strictEqual(before.body.data, 4.17);
    assert.strictEqual(after.body.data, 4.55);
  });

  test('B-3. 이력보다 앞선 날짜는 null 이다', async () => {
    const res = await json(`/api/debts/${debtId}/rate-on?date=2025-12-31`);
    assert.strictEqual(res.body.data, null);
  });

  test('B-4. 잘못된 금리 입력을 막는다', async () => {
    for (const body of [
      { annual_rate: 101, effective_from: '2026-05-01' },
      { annual_rate: -1, effective_from: '2026-05-01' },
      { annual_rate: 4.5, effective_from: '2026/05/01' },
      { annual_rate: 4.5 },
    ]) {
      const res = await json(`/api/debts/${debtId}/rates`, { method: 'POST', body: JSON.stringify(body) });
      assert.strictEqual(res.status, 400, JSON.stringify(body));
    }
  });

  test('B-5. 없는 부채면 404', async () => {
    const res = await json('/api/debts/999999/rates', {
      method: 'POST', body: JSON.stringify({ annual_rate: 4, effective_from: '2026-01-01' }),
    });
    assert.strictEqual(res.status, 404);
  });

  test('B-6. 수정으로 금리를 덮어쓸 수 없다', async () => {
    // 금리는 시점이 붙어야 의미가 있다. PUT 이 덮어쓰면 이력과 어긋난다.
    await json(`/api/debts/${debtId}`, {
      method: 'PUT', body: JSON.stringify({ annual_rate: 99, name: '변동금리(수정)' }),
    });
    const list = await json('/api/debts');
    const d = list.body.data.find((x) => x.id === debtId);
    assert.strictEqual(d.name, '변동금리(수정)', '다른 필드는 수정돼야 한다');
    assert.notStrictEqual(d.annual_rate, 99, 'PUT 이 금리를 덮어썼다');
  });
});

describe('C. 한도 초과', () => {
  test('C-1. 초과 상태도 저장되고 사실만 알린다', async () => {
    // 연체 이자로 한도를 넘는 상태가 실제로 있다. 막으면 기록할 방법이 없어진다.
    const created = await json('/api/debts', {
      method: 'POST',
      body: JSON.stringify({
        name: '초과통장', loan_type: 'credit_line', balance: 4900000,
        annual_rate: 4.17, credit_limit: 4800000,
      }),
    });
    assert.strictEqual(created.status, 201);

    const list = await json('/api/debts');
    const d = list.body.data.find((x) => x.id === created.body.id);
    assert.strictEqual(d.credit_line.over_limit, true);
    assert.strictEqual(d.credit_line.available, -100000);
  });
});

describe('D. 기존 이자 기록 흐름이 그대로 돈다', () => {
  test('D-1. 이자 기록과 파생 거래가 종전대로 만들어진다', async () => {
    const created = await json('/api/debts', {
      method: 'POST',
      body: JSON.stringify({ name: '이자흐름', balance: 1000000, annual_rate: 12 }),
    });
    const res = await json(`/api/debts/${created.body.id}/interest`, {
      method: 'POST',
      body: JSON.stringify({ rate: 12, interest_amount: 10000, log_date: '2026-05-15' }),
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.balance_after, 1010000);
    assert.strictEqual(res.body.derived.created, 1);
  });
});

describe('E. 소수 금리 회귀 (#285 에서 발견한 결함)', () => {
  // numericBody 는 정수 전용이라 annual_rate 에 걸어 두면 연 4.17% 가 거부된다.
  // 실제 마이너스통장 금리를 넣어 보고서야 드러났다 — 소수 금리 부채는 등록 자체가
  // 안 됐다. 이 테스트가 깨지면 그 상태로 되돌아간 것이다.
  test('E-1. 소수 금리로 부채를 등록할 수 있다', async () => {
    const res = await json('/api/debts', {
      method: 'POST',
      body: JSON.stringify({ name: '소수금리', balance: 1000000, annual_rate: 4.17 }),
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const list = await json('/api/debts');
    assert.strictEqual(list.body.data.find((d) => d.id === res.body.id).annual_rate, 4.17);
  });

  test('E-2. 소수 이자율로 이자를 기록할 수 있다', async () => {
    const created = await json('/api/debts', {
      method: 'POST', body: JSON.stringify({ name: '소수이자', balance: 1000000, annual_rate: 4.17 }),
    });
    const res = await json(`/api/debts/${created.body.id}/interest`, {
      method: 'POST',
      body: JSON.stringify({ rate: 4.17, interest_amount: 12222, log_date: '2026-05-15' }),
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  });

  test('E-3. 여전히 범위 밖 금리는 막는다', async () => {
    // JSON 은 NaN 을 실을 수 없다. 실제 클라이언트가 보내는 형태(문자열)로 넣는다.
    for (const rate of [101, -1, 'abc']) {
      const res = await json('/api/debts', {
        method: 'POST', body: JSON.stringify({ name: '범위밖', balance: 1000, annual_rate: rate }),
      });
      assert.strictEqual(res.status, 400, `rate=${rate}`);
    }
  });

  test('E-4. 금액은 여전히 정수만 받는다', async () => {
    const res = await json('/api/debts', {
      method: 'POST', body: JSON.stringify({ name: '소수금액', balance: 1000.5, annual_rate: 4 }),
    });
    assert.strictEqual(res.status, 400);
  });
});

describe('F. 이자 계산 조회 (#286)', () => {
  let debtId;

  test('F-1. 마이너스통장 기간 이자를 계산한다 — 실제 계좌 조건', async () => {
    const created = await json('/api/debts', {
      method: 'POST',
      body: JSON.stringify({
        name: '계산확인', type: '마이너스통장', loan_type: 'credit_line',
        balance: REAL.balance, annual_rate: REAL.annual_rate,
        credit_limit: REAL.credit_limit, interest_day: 30,
        rate_effective_from: '2026-01-01',
      }),
    });
    debtId = created.body.id;

    const res = await json(`/api/debts/${debtId}/interest-projection?from=2026-04-30&to=2026-07-30`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    // #284 검산과 같은 값
    assert.deepStrictEqual(res.body.data.postings.map((p) => p.interest), [12222, 12673, 12308]);
    assert.strictEqual(res.body.data.total_interest, 37203);
    assert.strictEqual(res.body.data.final_balance, 3603399);
  });

  test('F-2. 읽기 전용이다 — 잔액이 바뀌지 않는다', async () => {
    // 계산만 보여주는 경로가 조용히 쓰면 ADR 0008 이 무의미해진다.
    const before = await json('/api/debts');
    const b = before.body.data.find((d) => d.id === debtId).balance;
    await json(`/api/debts/${debtId}/interest-projection?from=2026-04-30&to=2026-07-30`);
    const after = await json('/api/debts');
    assert.strictEqual(after.body.data.find((d) => d.id === debtId).balance, b);
  });

  test('F-3. 금리 이력이 없는 과거 구간은 사유를 알려준다', async () => {
    // 0% 로 계산해 이자를 조용히 없애지 않는다.
    const res = await json(`/api/debts/${debtId}/interest-projection?from=2025-01-01&to=2025-06-01`);
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error.includes('금리'));
  });

  test('F-4. general 부채는 기간 계산을 지원하지 않는다고 알린다', async () => {
    // 월 단위 어림값이라 구간 계산이 성립하지 않는다. 없는 정밀도를 만들지 않는다.
    const created = await json('/api/debts', {
      method: 'POST', body: JSON.stringify({ name: '일반부채', balance: 1000000, annual_rate: 5 }),
    });
    const res = await json(`/api/debts/${created.body.id}/interest-projection?from=2026-01-01&to=2026-02-01`);
    assert.strictEqual(res.status, 400);
    assert.ok(!/loan_type|interest_basis|daily/.test(res.body.error), `내부 용어 노출: ${res.body.error}`);
  });

  test('F-5. 잘못된 기간을 막는다', async () => {
    for (const q of ['from=2026-01-01', 'from=2026-05-01&to=2026-01-01', 'from=x&to=y']) {
      const res = await json(`/api/debts/${debtId}/interest-projection?${q}`);
      assert.strictEqual(res.status, 400, q);
    }
  });

  test('F-6. 없는 부채면 404', async () => {
    const res = await json('/api/debts/999999/interest-projection?from=2026-01-01&to=2026-02-01');
    assert.strictEqual(res.status, 404);
  });
});
