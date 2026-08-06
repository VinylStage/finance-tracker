'use strict';
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

// 반복거래 따라잡기를 **지금 한 번** 실행한다(#498).
//
// 지금까지 `runCatchup` 은 `src/server.js` 의 기동 경로에서만 불렸다. 규칙을 새로
// 만들어도 다음 기동까지 아무 일도 안 일어난다 — 이 앱은 사용자가 열 때만
// 프로세스가 사니까, 며칠이 지날 수도 있다.
//
// 함수는 이미 `options` 를 받게 돼 있었다. **부르는 입구가 없었을 뿐이다.**

const PORT = 35001;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

async function json(p, o) {
  const r = await fetch(`${BASE}${p}`, { headers: { 'Content-Type': 'application/json' }, ...o });
  return { status: r.status, body: await r.json() };
}
const post = (p, b) => json(p, { method: 'POST', body: JSON.stringify(b) });

let catId, pmId;

before(async () => {
  server = await startTestServer({ port: PORT });
  const cats = await json('/api/categories');
  catId = (cats.body.data || cats.body).find((c) => c.major_type === '선택지출').id;
  const pms = await json('/api/payment-methods');
  pmId = (Array.isArray(pms.body) ? pms.body : pms.body.data)[0].id;
});
after(() => { if (server) server.stop(); });

beforeEach(async () => {
  // **`GET /api/recurring-rules` 는 배열을 그대로 준다.** `{data:[]}` 가 아니다.
  // `.body.data` 로 읽으면 undefined 라 정리가 조용히 아무것도 안 하고, 규칙이
  // 테스트마다 쌓여 뒤 테스트가 엉뚱한 건수를 본다(실제로 걸렸다).
  const rules = (await json('/api/recurring-rules')).body;
  for (const r of (Array.isArray(rules) ? rules : rules.data || [])) {
    await json(`/api/recurring-rules/${r.id}`, { method: 'DELETE' });
  }
  const list = await json('/api/transactions?limit=500');
  for (const t of list.body.data) await json(`/api/transactions/${t.id}`, { method: 'DELETE' });
});

// 테스트마다 다른 가맹점명을 쓴다. 정리가 한 번이라도 어긋나면 앞 테스트가 남긴
// 거래를 세게 되는데, 그때 나오는 숫자는 원인을 짐작하기 어렵다(실제로 겪었다).
let seq = 0;
function uniqMerchant() { seq += 1; return `집주인${seq}`; }

async function addRule(over = {}) {
  const r = await post('/api/recurring-rules', {
    name: '월세', category_id: catId, merchant: uniqMerchant(), amount: 500000,
    day_of_month: 5, payment_method_id: pmId, payment_style: '해당없음',
    freq: 'monthly', interval: 1, starts_on: '2026-06-01', ...over,
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  return r.body.id;
}

const txCount = async () => (await json('/api/transactions?limit=500')).body.data.length;

describe('지금 실행', () => {
  test('규칙을 만든 직후 실행하면 밀린 회차가 생긴다', async () => {
    await addRule();

    const r = await post('/api/recurring-rules/catchup/run', { today: '2026-08-06' });

    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.created > 0, '생성된 게 없다 — 기동을 기다려야 한다는 뜻');
  });

  test('두 번 실행해도 같은 회차를 다시 만들지 않는다', async () => {
    await addRule();
    const first = await post('/api/recurring-rules/catchup/run', { today: '2026-08-06' });
    const n = await txCount();

    const second = await post('/api/recurring-rules/catchup/run', { today: '2026-08-06' });

    assert.ok(first.body.created > 0);
    assert.strictEqual(second.body.created, 0, '같은 회차를 또 만들었다');
    assert.strictEqual(await txCount(), n);
  });

  test('무엇이 생겼는지 규칙별로 말한다', async () => {
    const m = uniqMerchant();
    await addRule({ merchant: m });
    const r = await post('/api/recurring-rules/catchup/run', { today: '2026-08-06' });

    // 건수만 알리면 무엇이 생겼는지 목록을 뒤져야 한다(#280 과 같은 이유).
    assert.ok(Array.isArray(r.body.details));
    assert.ok(r.body.details.some((d) => d.merchant === m));
  });
});

describe('confirm 과 겹칠 때', () => {
  test('confirm 으로 만든 달을 따라잡기가 다시 만들지 않는다', async () => {
    // 두 경로가 **다른 중복방지 테이블**을 쓴다. `confirm` 은
    // `recurring_rule_months`, 따라잡기는 `recurring_occurrences` 다.
    // 서로를 안 보면 같은 달이 두 번 생긴다.
    const m = uniqMerchant();
    const id = await addRule({ merchant: m });
    const c = await post(`/api/recurring-rules/${id}/confirm`, { month: '2026-07' });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    const afterConfirm = await txCount();

    await post('/api/recurring-rules/catchup/run', { today: '2026-08-06' });

    const rows = (await json('/api/transactions?limit=500')).body.data
      .filter((t) => t.merchant === m && t.date.startsWith('2026-07'));
    assert.strictEqual(rows.length, 1, `7월 거래가 ${rows.length}건이다 — 중복 생성`);
    assert.ok(afterConfirm >= 1);
  });
});

describe('따라잡기가 만든 거래를 지울 수 있는가', () => {
  test('지워진다 — 500 이 아니다', async () => {
    // `recurring_occurrences.transaction_id` 에 `ON DELETE` 절이 없어서
    // **외래키 위반으로 500 이 났다.** 앱은 지울 수 있다고 해 놓고(`recurring` 은
    // 잠금 대상이 아니다) 막상 누르면 알 수 없는 오류를 냈다 — 가장 나쁜 조합이다.
    const m = uniqMerchant();
    await addRule({ merchant: m });
    await post('/api/recurring-rules/catchup/run', { today: '2026-08-06' });
    const mine = (await json('/api/transactions?limit=500')).body.data.filter((t) => t.merchant === m);
    assert.ok(mine.length > 0, '전제: 따라잡기가 거래를 만들었다');

    const r = await json(`/api/transactions/${mine[0].id}`, { method: 'DELETE' });

    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const after = (await json('/api/transactions?limit=500')).body.data.filter((t) => t.merchant === m);
    assert.strictEqual(after.length, mine.length - 1);
  });

  test('지운 회차가 다음 따라잡기에 되살아나지 않는다', async () => {
    // 발생 기록까지 지우면 다음 실행이 같은 회차를 다시 만든다. 사용자가 지운
    // 거래가 되살아나는 것은 "내가 지웠는데 또 있다" 로 보인다.
    const m = uniqMerchant();
    await addRule({ merchant: m });
    await post('/api/recurring-rules/catchup/run', { today: '2026-08-06' });
    const victim = (await json('/api/transactions?limit=500')).body.data
      .find((t) => t.merchant === m && t.date === '2026-07-05');
    assert.ok(victim, '전제: 7월 회차가 있다');
    await json(`/api/transactions/${victim.id}`, { method: 'DELETE' });

    const again = await post('/api/recurring-rules/catchup/run', { today: '2026-08-06' });

    assert.strictEqual(again.body.created, 0, '지운 회차가 다시 만들어졌다');
    const july = (await json('/api/transactions?limit=500')).body.data
      .filter((t) => t.merchant === m && t.date === '2026-07-05');
    assert.strictEqual(july.length, 0);
  });
});

describe('실행 요청 자체의 안전장치', () => {
  test('미래 날짜를 넘겨도 아직 오지 않은 회차는 안 만든다', async () => {
    // 넘겨받은 날짜를 그대로 쓰면 아직 오지 않은 회차까지 만들어지고,
    // 그건 사용자가 지우기 전까지 가계부에 남아 잔액·예산을 흔든다.
    const m = uniqMerchant();
    await addRule({ merchant: m });

    const r = await post('/api/recurring-rules/catchup/run', { today: '2030-01-01' });

    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const dates = (await json('/api/transactions?limit=500')).body.data
      .filter((t) => t.merchant === m).map((t) => t.date);
    const realToday = new Date().toISOString().slice(0, 10);
    const future = dates.filter((d) => d > realToday);
    assert.deepStrictEqual(future, [], `미래 회차가 생겼다: ${future.join(', ')}`);
  });

  test('날짜 형식이 틀리면 400 이고 아무것도 안 만든다', async () => {
    const m = uniqMerchant();
    await addRule({ merchant: m });
    const before = await txCount();

    const r = await post('/api/recurring-rules/catchup/run', { today: '아무거나' });

    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.match(r.body.error, /날짜 형식/);
    assert.strictEqual(await txCount(), before, '400 인데 거래가 생겼다');
  });

  test('실행 결과가 알림 경로에 남는다', async () => {
    // `CatchupNotice`(#280)가 `GET /catchup` 으로 결과를 가져간다. 저장하지 않으면
    // 사용자가 "지금 실행" 을 눌러도 무엇이 생겼는지 화면이 알리지 못한다.
    const m = uniqMerchant();
    await addRule({ merchant: m });

    const run = await post('/api/recurring-rules/catchup/run', { today: '2026-08-06' });
    const seen = await json('/api/recurring-rules/catchup');

    assert.strictEqual(seen.status, 200);
    assert.strictEqual(seen.body.created, run.body.created);
    assert.ok(seen.body.details.some((d) => d.merchant === m));
  });
});
