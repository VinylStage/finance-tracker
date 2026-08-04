'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// #317 — 이 카드로 고를 수 있는 개월수 목록.
//
// 실제 카드 결제창처럼 "이 카드는 2·3·6개월이 됩니다" 를 보여주기 위한 조회다.
// 지금은 개월수가 자유 입력이라 카드사가 제공하지 않는 7개월도 넣을 수 있고,
// 그러면 그 뒤 계산이 전부 무의미해진다.
//
// 잠그는 것 두 가지.
//   1. 카테고리 예외가 기본 정책을 덮는다 — policyAt 과 같은 우선순위여야
//      화면에서 고른 개월수의 정책과 실제 적용 정책이 어긋나지 않는다
//   2. 정책 0건은 오류가 아니다 — 정책 미등록 사용자도 할부를 기록할 수 있어야
//      한다(B안). 자유 입력 폴백은 화면이 판단한다

let pmId;
let exceptCatId;
let otherCatId;

const PORT = 34614;
const BASE = `http://127.0.0.1:${PORT}`;
let serverProcess;
let dbPath;
let serverOutput = '';

async function json(pathname, options) {
  const r = await fetch(`${BASE}${pathname}`, {
    headers: { 'Content-Type': 'application/json' }, ...options,
  });
  return { status: r.status, body: await r.json() };
}
const post = (p, body) => json(p, { method: 'POST', body: JSON.stringify(body) });

before(async () => {
  dbPath = path.join(os.tmpdir(), `finance-months-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  serverProcess = spawn('node', ['src/server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(PORT), DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.on('data', (d) => { serverOutput += d.toString(); });
  serverProcess.stderr.on('data', (d) => { serverOutput += d.toString(); });
  const deadline = Date.now() + 15000;
  let up = false;
  while (Date.now() < deadline) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) { up = true; break; } } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!up) throw new Error(`서버가 15초 안에 기동하지 않음:\n${serverOutput}`);

  // 픽스처는 같은 훅 안에서 세운다. node:test 는 같은 레벨의 before 를 여러 개
  // 두면 뒤엣것이 앞엣것을 덮는다.
  const pm = await post('/api/payment-methods', { name: '개월수테스트카드', type: '신용' });
  pmId = pm.body.id;

  const cats = (await json('/api/categories')).body;
  const spend = (cats.data || cats).filter((c) => c.major_type !== '수입');
  exceptCatId = spend[0].id;
  otherCatId = spend[1].id;

  // 기본 정책: 2·3개월 무이자, 6개월 유이자
  for (const [months, type, rate] of [[2, '무이자', 0], [3, '무이자', 0], [6, '유이자', 19.9]]) {
    await post('/api/card-policies', {
      payment_method_id: pmId, months, policy_type: type,
      annual_rate: rate, effective_from: '2026-01-01',
    });
  }
  // 카테고리 예외: 같은 6개월인데 무이자
  await post('/api/card-policies', {
    payment_method_id: pmId, months: 6, policy_type: '무이자',
    annual_rate: 0, effective_from: '2026-01-01', category_id: exceptCatId,
  });
  // 만료된 정책: 12개월 (2026-06-30 까지)
  await post('/api/card-policies', {
    payment_method_id: pmId, months: 12, policy_type: '무이자',
    annual_rate: 0, effective_from: '2026-01-01', effective_to: '2026-06-30',
  });
});

after(() => {
  if (serverProcess) serverProcess.kill();
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix); } catch {}
  }
});

const url = (extra = '') => `/api/card-policies/months?payment_method_id=${pmId}&on=2026-07-10${extra}`;

describe('A. 목록', () => {
  test('A-1. 유효한 정책의 개월수만 나온다', async () => {
    const r = await json(url());
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body.data.map((x) => x.months), [2, 3, 6]);
  });

  test('A-2. 기준일에 만료된 정책은 빠진다', async () => {
    // 12개월은 2026-06-30 까지였다. 만료된 걸 고르게 두면 계산이 틀어진다.
    const r = await json(url());
    assert.ok(!r.body.data.some((x) => x.months === 12), '만료 정책이 목록에 남았다');
  });

  test('A-3. 개월수 오름차순이다', async () => {
    const r = await json(url());
    const m = r.body.data.map((x) => x.months);
    assert.deepStrictEqual(m, [...m].sort((a, b) => a - b));
  });

  test('A-4. 정책 유형을 함께 준다', async () => {
    // "6개월" 만 있으면 무이자인지 알 수 없다.
    const r = await json(url());
    const six = r.body.data.find((x) => x.months === 6);
    assert.strictEqual(six.policy_type, '유이자');
    assert.strictEqual(six.annual_rate, 19.9);
  });
});

describe('B. 카테고리 예외가 기본을 덮는다', () => {
  test('B-1. 예외 카테고리를 넘기면 그쪽 정책이 나온다', async () => {
    const r = await json(url(`&category_id=${exceptCatId}`));
    const six = r.body.data.find((x) => x.months === 6);
    assert.strictEqual(six.policy_type, '무이자', '카테고리 예외가 안 먹었다');
    assert.strictEqual(six.source, 'category');
  });

  test('B-2. 예외 없는 카테고리는 기본 정책 그대로다', async () => {
    const r = await json(url(`&category_id=${otherCatId}`));
    const six = r.body.data.find((x) => x.months === 6);
    assert.strictEqual(six.policy_type, '유이자');
    assert.strictEqual(six.source, 'base');
  });

  test('B-3. 예외가 개월수를 늘리지도 줄이지도 않는다', async () => {
    // 예외는 같은 개월수를 덮을 뿐이다. 목록 자체가 달라지면 안 된다.
    const base = await json(url());
    const withCat = await json(url(`&category_id=${exceptCatId}`));
    assert.deepStrictEqual(
      withCat.body.data.map((x) => x.months),
      base.body.data.map((x) => x.months)
    );
  });

  test('B-4. 다른 카테고리 전용 정책이 섞여 들어오지 않는다', async () => {
    // otherCat 으로 조회했는데 exceptCat 전용 정책이 보이면 안 된다.
    const r = await json(url(`&category_id=${otherCatId}`));
    assert.ok(r.body.data.every((x) => x.source === 'base'));
  });
});

describe('C. 정책이 없을 때', () => {
  test('C-1. 빈 배열을 준다 — 오류가 아니다', async () => {
    // 정책을 아직 등록하지 않은 사용자가 정상적으로 존재한다. 여기서 400 을
    // 내면 화면이 "기록할 수 없음" 으로 처리하게 된다(#317 B안 위반).
    const pm = await post('/api/payment-methods', { name: '정책없는카드', type: '신용' });
    const r = await json(`/api/card-policies/months?payment_method_id=${pm.body.id}&on=2026-07-10`);
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body.data, []);
  });
});

describe('D. 필수값', () => {
  test('D-1. 결제수단이 없으면 400', async () => {
    const r = await json('/api/card-policies/months?on=2026-07-10');
    assert.strictEqual(r.status, 400);
  });

  test('D-2. 기준일이 없으면 400', async () => {
    const r = await json(`/api/card-policies/months?payment_method_id=${pmId}`);
    assert.strictEqual(r.status, 400);
  });

  test('D-3. months 가 :id 로 잡히지 않는다', async () => {
    // '/:id' 보다 먼저 선언돼야 한다. 뒤에 있으면 여기가 404 나 500 이 된다.
    const r = await json(url());
    assert.strictEqual(r.status, 200);
    assert.ok(Array.isArray(r.body.data));
  });
});
