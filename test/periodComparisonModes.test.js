'use strict';
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

// `GET /api/transactions/period-comparison` 의 **일·주·연** 모드.
//
// 커버리지 실측에서 `periodComparisonDaily` · `Weekly` · `Yearly` 가 어떤
// 테스트에서도 **한 번도 안 불렸다**(FNDA:0). 네 모드 중 월간만 덮여 있었다.
//
// 이 함수들은 예외를 던지지 않는다. 틀리면 차트가 **그럴듯한 잘못된 그림**을
// 그린다 — 2월에 없는 30일에 값이 찍히거나, 주가 하루씩 밀리거나, 5년 창이
// 겹친다. 그래서 화면만 봐서는 못 잡는다.

const PORT = 34994;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

async function json(pathname, options) {
  const r = await fetch(`${BASE}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return { status: r.status, body: await r.json() };
}
const post = (p, b) => json(p, { method: 'POST', body: JSON.stringify(b) });

// 지출은 `major_type != '수입'` 전부다(`EXPENSE_CASE`). 카테고리에 '지출' 이라는
// major_type 은 없다 — 고정지출·변동필수·선택지출·부채상환·저축으로 갈린다.
let expenseCat;
let incomeCat;
let methodId;

async function addTx(date, amount) {
  const r = await post('/api/transactions', {
    date, category_id: expenseCat, amount,
    payment_method_id: methodId, merchant: '테스트',
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
}

const compare = (q) => json(`/api/transactions/period-comparison?${q}`);

before(async () => {
  server = await startTestServer({ port: PORT });
  const cats = await json('/api/categories');
  const list = cats.body.data || cats.body;
  expenseCat = list.find((c) => c.major_type === '선택지출').id;
  incomeCat = list.find((c) => c.major_type === '수입').id;
  assert.ok(expenseCat && incomeCat, '기본 카테고리를 못 찾았다');
  const pms = await json('/api/payment-methods');
  methodId = (pms.body.data || pms.body)[0].id;
});

after(() => { if (server) server.stop(); });

beforeEach(async () => {
  const list = await json('/api/transactions?limit=500');
  for (const t of list.body.data) {
    await json(`/api/transactions/${t.id}`, { method: 'DELETE' });
  }
});

describe('daily — 이번 달 vs 지난 달', () => {
  test('달 길이가 다르면 짧은 쪽 날짜는 null 이다 (3월 31일 vs 2월 28일)', async () => {
    // **이 저장소에서 제일 틀리기 쉬운 자리.** 2월을 3월에 맞춰 늘리면
    // 2월 29·30·31 일에 0 이 찍히고, 사용자는 그 날 안 썼다고 읽는다.
    // 실제로는 그런 날이 없다 — 0 과 "없음" 은 다른 말이다.
    await addTx('2026-03-05', 10000);
    await addTx('2026-02-05', 7000);

    const r = await compare('period=daily&date=2026-03-15');

    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.data.length, 31, '3월 기준이므로 31칸이어야 한다');

    const d5 = r.body.data[4];
    assert.strictEqual(d5.label, '5');
    assert.strictEqual(d5.currentDate, '2026-03-05');
    assert.strictEqual(d5.previousDate, '2026-02-05');
    assert.strictEqual(d5.currentExpense, 10000);
    assert.strictEqual(d5.previousExpense, 7000);

    const d29 = r.body.data[28];
    assert.strictEqual(d29.currentDate, '2026-03-29');
    assert.strictEqual(d29.previousDate, null, '2026-02-29 는 존재하지 않는다');
    assert.strictEqual(d29.previousExpense, null, 'null 이어야 한다 — 0 이면 "안 썼다" 로 읽힌다');

    // 라우트는 range 를 내보내지 않고 라벨만 준다. 라벨이 비교 대상 두 달을
    // 그대로 말해야, 차트 제목과 데이터가 어긋났을 때 눈에 띈다.
    assert.strictEqual(r.body.currentLabel, '2026-03');
    assert.strictEqual(r.body.previousLabel, '2026-02');
    assert.strictEqual(r.body.period, 'daily');

    // 합계는 존재하는 날만 센다 — 31칸 중 3칸이 null 이어도 2월 합계는 7000 이다.
    assert.strictEqual(r.body.summary.currentExpense, 10000);
    assert.strictEqual(r.body.summary.previousExpense, 7000);
    assert.strictEqual(r.body.summary.expenseDiff, 3000);
  });

  test('1월이면 전월이 작년 12월이다', async () => {
    // 해를 안 넘기면 지난 12월 대신 **올해 12월** 을 본다. 아직 오지 않은 달이라
    // 늘 0 이 나오고, 사용자는 작년에 한 푼도 안 쓴 것으로 읽는다. 예외가 안 나서
    // 1월 한 달 내내 아무도 모른다.
    await addTx('2026-01-10', 5000);
    await addTx('2025-12-10', 3000);

    const r = await compare('period=daily&date=2026-01-20');

    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.currentLabel, '2026-01');
    assert.strictEqual(r.body.previousLabel, '2025-12');
    assert.strictEqual(r.body.data.length, 31);
    assert.strictEqual(r.body.data[9].previousDate, '2025-12-10');
    assert.strictEqual(r.body.summary.previousExpense, 3000);
  });
});

describe('weekly — 이번 주 vs 지난 주', () => {
  test('월요일 시작 7칸이고 라벨이 월~일이다', async () => {
    await addTx('2026-03-11', 8000);
    const r = await compare('period=weekly&date=2026-03-11');

    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.data.length, 7);
    assert.deepStrictEqual(r.body.data.map(d => d.label), ['월','화','수','목','금','토','일']);
    assert.strictEqual(r.body.data[0].currentDate, '2026-03-09');
    assert.strictEqual(r.body.data[6].currentDate, '2026-03-15');
    assert.strictEqual(r.body.data[2].currentExpense, 8000); // 수요일
    // 주 시작이 하루라도 밀리면 모든 요일 값이 통째로 옆으로 밀린다. 합계는 맞는데
    // 요일별 그림만 틀려서, 숫자를 대조하지 않으면 못 본다.
  });

  test('일요일 앵커는 그 주의 마지막 날이다 — 다음 주로 넘어가지 않는다', async () => {
    // 일요일을 다음 주 시작으로 잡으면 일요일에 쓴 돈이 다음 주로 넘어가
    // 이번 주 합계에서 사라진다.
    const r = await compare('period=weekly&date=2026-03-15');

    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.currentLabel, '2026-03-09~2026-03-15');
    assert.strictEqual(r.body.previousLabel, '2026-03-02~2026-03-08');
  });

  test('주가 해를 넘으면 지난 주가 작년이다', async () => {
    await addTx('2025-12-31', 4000);
    const r = await compare('period=weekly&date=2026-01-10');

    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.currentLabel, '2026-01-05~2026-01-11');
    assert.strictEqual(r.body.previousLabel, '2025-12-29~2026-01-04');
    assert.strictEqual(r.body.summary.previousExpense, 4000);
  });
});

describe('yearly — 최근 5년 vs 그 앞 5년', () => {
  test('5칸이고 창이 겹치지 않는다', async () => {
    const r = await compare('period=yearly&date=2026-06-15');

    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.data.length, 5);
    assert.deepStrictEqual(r.body.data.map(d => d.label), ['1년차','2년차','3년차','4년차','5년차']);
    assert.deepStrictEqual(r.body.data.map(d => d.currentYear), [2022, 2023, 2024, 2025, 2026]);
    assert.deepStrictEqual(r.body.data.map(d => d.previousYear), [2017, 2018, 2019, 2020, 2021]);
    // 두 창이 한 해라도 겹치면 같은 거래가 양쪽에 들어가 증감률이 0 쪽으로 눌린다.
    assert.strictEqual(r.body.currentLabel, '2022~2026');
    assert.strictEqual(r.body.previousLabel, '2017~2021');
  });

  test('연도별로 제 칸에 들어간다', async () => {
    await addTx('2024-06-01', 11000);
    await addTx('2019-06-01', 6000);
    const r = await compare('period=yearly&date=2026-06-15');

    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.data[2].currentYear, 2024);
    assert.strictEqual(r.body.data[2].currentExpense, 11000);
    assert.strictEqual(r.body.data[2].previousYear, 2019);
    assert.strictEqual(r.body.data[2].previousExpense, 6000);
  });
});

describe('인자 검증', () => {
  test('모르는 period 는 400', async () => {
    const r = await compare('period=분기&date=2026-03-15');

    assert.strictEqual(r.status, 400);
    assert.ok(r.body.error.match(/일·주·월·연/));
  });

  test('날짜 형식이 틀리면 400', async () => {
    const r = await compare('period=daily&date=아무거나');

    assert.strictEqual(r.status, 400);
  });
});
