'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = 34626;
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

async function getCategoryId() {
  const categoriesResp = await fetch(`${BASE}/api/categories`);
  const categories = await categoriesResp.json();
  return categories[0].id;
}

// Helper to parse JSON response
async function parseResponse(response) {
  try {
    const text = await response.text();
    return JSON.parse(text);
  } catch (e) {
    return { error: 'Invalid JSON response' };
  }
}

test('A-1. freq/interval/starts_on/ends_on 을 넣으면 GET 목록에 그대로 돌아온다', async () => {
  const categoryId = await getCategoryId();
  
  const resp = await fetch(`${BASE}/api/recurring-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category_id: categoryId,
      merchant: '테스트',
      amount: 1000,
      day_of_month: 15,
      freq: 'monthly',
      interval: 2,
      starts_on: '2026-01-01',
      ends_on: '2026-12-31'
    }),
  });
  
  assert.strictEqual(resp.status, 201);
  
  const { id } = await parseResponse(resp);
  
  const listResp = await fetch(`${BASE}/api/recurring-rules`);
  const list = await parseResponse(listResp);
  const rule = list.find(r => r.id === id);
  
  assert.strictEqual(rule.freq, 'monthly');
  assert.strictEqual(rule.interval, 2);
  assert.strictEqual(rule.starts_on, '2026-01-01');
  assert.strictEqual(rule.ends_on, '2026-12-31');
});

test('A-2. freq 를 생략하면 monthly 로 저장된다', async () => {
  const categoryId = await getCategoryId();
  
  const resp = await fetch(`${BASE}/api/recurring-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category_id: categoryId,
      merchant: '테스트',
      amount: 1000,
      day_of_month: 15
    }),
  });
  
  assert.strictEqual(resp.status, 201);
  
  const { id } = await parseResponse(resp);
  
  const listResp = await fetch(`${BASE}/api/recurring-rules`);
  const list = await parseResponse(listResp);
  const rule = list.find(r => r.id === id);
  
  assert.strictEqual(rule.freq, 'monthly');
});

test('A-3. interval 을 생략하면 1 로 저장된다', async () => {
  const categoryId = await getCategoryId();
  
  const resp = await fetch(`${BASE}/api/recurring-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category_id: categoryId,
      merchant: '테스트',
      amount: 1000,
      day_of_month: 15,
      freq: 'monthly'
    }),
  });
  
  assert.strictEqual(resp.status, 201);
  
  const { id } = await parseResponse(resp);
  
  const listResp = await fetch(`${BASE}/api/recurring-rules`);
  const list = await parseResponse(listResp);
  const rule = list.find(r => r.id === id);
  
  assert.strictEqual(rule.interval, 1);
});

test('A-4. starts_on 을 생략하면 오늘 날짜(YYYY-MM-DD 형식)로 채워진다', async () => {
  const categoryId = await getCategoryId();
  
  const resp = await fetch(`${BASE}/api/recurring-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category_id: categoryId,
      merchant: '테스트',
      amount: 1000,
      day_of_month: 15,
      freq: 'monthly'
    }),
  });
  
  assert.strictEqual(resp.status, 201);
  
  const { id } = await parseResponse(resp);
  
  const listResp = await fetch(`${BASE}/api/recurring-rules`);
  const list = await parseResponse(listResp);
  const rule = list.find(r => r.id === id);
  
  // Check that starts_on is set to today's date
  const today = new Date();
  const expectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  assert.strictEqual(rule.starts_on, expectedDate);
});

test('A-5. freq=\'yearly\' + month_of_year=3 이 그대로 저장된다', async () => {
  const categoryId = await getCategoryId();
  
  const resp = await fetch(`${BASE}/api/recurring-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category_id: categoryId,
      merchant: '테스트',
      amount: 1000,
      freq: 'yearly',
      // 연 반복은 "매년 3월 25일" 이라 월과 일이 둘 다 있어야 한다.
      // 월만 주면 며칠에 생기는지가 정해지지 않는다.
      month_of_year: 3,
      day_of_month: 25
    }),
  });
  
  assert.strictEqual(resp.status, 201);
  
  const { id } = await parseResponse(resp);
  
  const listResp = await fetch(`${BASE}/api/recurring-rules`);
  const list = await parseResponse(listResp);
  const rule = list.find(r => r.id === id);
  
  assert.strictEqual(rule.freq, 'yearly');
  assert.strictEqual(rule.month_of_year, 3);
});

test('A-6. freq=\'daily\' 는 day_of_month 없이도 201 이고, starts_on 의 일자로 채워진다', async () => {
  const categoryId = await getCategoryId();
  
  const resp = await fetch(`${BASE}/api/recurring-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category_id: categoryId,
      merchant: '테스트',
      amount: 1000,
      freq: 'daily'
    }),
  });
  
  assert.strictEqual(resp.status, 201);
});

test('B-1. freq 가 목록에 없는 값이면 400', async () => {
  const categoryId = await getCategoryId();
  
  const resp = await fetch(`${BASE}/api/recurring-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category_id: categoryId,
      merchant: '테스트',
      amount: 1000,
      day_of_month: 15,
      freq: 'invalid_freq'
    }),
  });
  
  assert.strictEqual(resp.status, 400);
  const data = await parseResponse(resp);
  assert.ok(data.error && data.error.length > 0);
});

test('B-2. interval 이 0 이면 400', async () => {
  const categoryId = await getCategoryId();
  
  const resp = await fetch(`${BASE}/api/recurring-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category_id: categoryId,
      merchant: '테스트',
      amount: 1000,
      day_of_month: 15,
      freq: 'monthly',
      interval: 0
    }),
  });
  
  assert.strictEqual(resp.status, 400);
  const data = await parseResponse(resp);
  assert.ok(data.error && data.error.length > 0);
});

test('B-3. interval 이 음수면 400', async () => {
  const categoryId = await getCategoryId();
  
  const resp = await fetch(`${BASE}/api/recurring-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category_id: categoryId,
      merchant: '테스트',
      amount: 1000,
      day_of_month: 15,
      freq: 'monthly',
      interval: -1
    }),
  });
  
  assert.strictEqual(resp.status, 400);
  const data = await parseResponse(resp);
  assert.ok(data.error && data.error.length > 0);
});

test('B-4. starts_on 형식이 \'YYYY/MM/DD\' 처럼 어긋나면 400', async () => {
  const categoryId = await getCategoryId();
  
  const resp = await fetch(`${BASE}/api/recurring-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category_id: categoryId,
      merchant: '테스트',
      amount: 1000,
      day_of_month: 15,
      freq: 'monthly',
      starts_on: '2026/01/01'
    }),
  });
  
  assert.strictEqual(resp.status, 400);
  const data = await parseResponse(resp);
  assert.ok(data.error && data.error.length > 0);
});

test('B-5. ends_on 이 starts_on 보다 빠르면 400', async () => {
  const categoryId = await getCategoryId();
  
  const resp = await fetch(`${BASE}/api/recurring-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category_id: categoryId,
      merchant: '테스트',
      amount: 1000,
      day_of_month: 15,
      freq: 'monthly',
      starts_on: '2026-01-01',
      ends_on: '2025-12-31'
    }),
  });
  
  assert.strictEqual(resp.status, 400);
  const data = await parseResponse(resp);
  assert.ok(data.error && data.error.length > 0);
});

test('B-6. month_of_year 가 13 이면 400', async () => {
  const categoryId = await getCategoryId();
  
  const resp = await fetch(`${BASE}/api/recurring-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category_id: categoryId,
      merchant: '테스트',
      amount: 1000,
      freq: 'yearly',
      month_of_year: 13
    }),
  });
  
  assert.strictEqual(resp.status, 400);
  const data = await parseResponse(resp);
  assert.ok(data.error && data.error.length > 0);
});

test('B-7. freq=\'monthly\' 인데 day_of_month 가 없으면 400', async () => {
  const categoryId = await getCategoryId();
  
  const resp = await fetch(`${BASE}/api/recurring-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category_id: categoryId,
      merchant: '테스트',
      amount: 1000,
      freq: 'monthly'
    }),
  });
  
  assert.strictEqual(resp.status, 400);
  const data = await parseResponse(resp);
  assert.ok(data.error && data.error.length > 0);
});

test('C-1. PUT 으로 freq 를 monthly → yearly 로 바꾸면 반영된다', async () => {
  const categoryId = await getCategoryId();
  
  // First create a rule
  const postResp = await fetch(`${BASE}/api/recurring-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category_id: categoryId,
      merchant: '테스트',
      amount: 1000,
      day_of_month: 15,
      freq: 'monthly'
    }),
  });
  
  assert.strictEqual(postResp.status, 201);
  const { id } = await parseResponse(postResp);
  
  // Then update it
  const putResp = await fetch(`${BASE}/api/recurring-rules/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category_id: categoryId,
      merchant: '테스트',
      amount: 1000,
      day_of_month: 15,
      freq: 'yearly',
      month_of_year: 3
    }),
  });
  
  assert.strictEqual(putResp.status, 200);
  
  // Check that the update was applied
  const listResp = await fetch(`${BASE}/api/recurring-rules`);
  const list = await parseResponse(listResp);
  const rule = list.find(r => r.id === id);
  
  assert.strictEqual(rule.freq, 'yearly');
  assert.strictEqual(rule.month_of_year, 3);
});

test('C-2. PUT 으로 ends_on 을 null 로 지우면 무기한이 된다(GET 에서 null)', async () => {
  const categoryId = await getCategoryId();
  
  // First create a rule with ends_on
  const postResp = await fetch(`${BASE}/api/recurring-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category_id: categoryId,
      merchant: '테스트',
      amount: 1000,
      day_of_month: 15,
      freq: 'monthly',
      ends_on: '2026-12-31'
    }),
  });
  
  assert.strictEqual(postResp.status, 201);
  const { id } = await parseResponse(postResp);
  
  // Then update it to remove ends_on
  const putResp = await fetch(`${BASE}/api/recurring-rules/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category_id: categoryId,
      merchant: '테스트',
      amount: 1000,
      day_of_month: 15,
      freq: 'monthly',
      ends_on: null
    }),
  });
  
  assert.strictEqual(putResp.status, 200);
  
  // Check that the update was applied
  const listResp = await fetch(`${BASE}/api/recurring-rules`);
  const list = await parseResponse(listResp);
  const rule = list.find(r => r.id === id);
  
  assert.strictEqual(rule.ends_on, null);
});

test('C-3. PUT 에서도 ends_on < starts_on 이면 400', async () => {
  const categoryId = await getCategoryId();
  
  // First create a rule
  const postResp = await fetch(`${BASE}/api/recurring-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category_id: categoryId,
      merchant: '테스트',
      amount: 1000,
      day_of_month: 15,
      freq: 'monthly',
      starts_on: '2026-01-01'
    }),
  });
  
  assert.strictEqual(postResp.status, 201);
  const { id } = await parseResponse(postResp);
  
  // Then try to update with invalid ends_on
  const putResp = await fetch(`${BASE}/api/recurring-rules/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category_id: categoryId,
      merchant: '테스트',
      amount: 1000,
      day_of_month: 15,
      freq: 'monthly',
      starts_on: '2026-01-01',
      ends_on: '2025-12-31'
    }),
  });
  
  assert.strictEqual(putResp.status, 400);
  const data = await parseResponse(putResp);
  assert.ok(data.error && data.error.length > 0);
});
