'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

const { derivedFilter } = require('../src/services/transactionOrigin');

// 기간 필터의 "자동 생성 내역 포함" 토글이 실제로 집계를 바꾸는가(#272).
//
// **이 파일이 존재하는 이유는 그 토글이 죽어 있었기 때문이다.** 체크박스가
// URL 만 바꾸고 서버로는 가지 않아서, 눌러도 숫자가 안 움직였다. 눌러도 아무
// 일이 없는 컨트롤은 없는 것보다 나쁘다 — 사용자는 데이터가 틀렸다고 읽는다.

const PORT = 34641;
let server;
const ids = {};

async function json(pathname, options) {
  const r = await fetch(`${server.base}${pathname}`, {
    headers: { 'Content-Type': 'application/json' }, ...options,
  });
  return { status: r.status, body: await r.json() };
}
const post = (p, body) => json(p, { method: 'POST', body: JSON.stringify(body) });

const total = (body) => (body.data || []).reduce((s, r) => s + r.total, 0);

before(async () => {
  server = await startTestServer({ port: PORT });

  const { body: pms } = await json('/api/payment-methods');
  ids.pm = (pms.data || pms)[0].id;
  const { body: cats } = await json('/api/categories');
  ids.cat = (cats.data || cats).find((c) => c.major_type === '선택지출').id;

  // 사용자가 직접 넣은 결제
  await post('/api/transactions', {
    date: '2026-07-10', amount: 100000, category_id: ids.cat,
    payment_method_id: ids.pm, merchant: '직접입력',
  });

  // 파생 행은 라우트로 못 만든다(잠겨 있다). 계산 결과를 흉내 내 직접 넣는다.
  const Database = require('better-sqlite3');
  const db = new Database(server.dbPath);
  const ins = db.prepare(`
    INSERT INTO transactions (date, category_id, amount, payment_method_id, merchant, origin)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  ins.run('2026-07-11', ids.cat, 30000, ids.pm, '할부회차', 'installment');
  ins.run('2026-07-12', ids.cat, 5000, ids.pm, '리볼빙수수료', 'revolving');
  ins.run('2026-07-13', ids.cat, 7000, ids.pm, '대출이자', 'debt_interest');
  ins.run('2026-07-14', ids.cat, 9000, ids.pm, '대출상환', 'debt_repayment');
  // 반복거래는 파생이 아니다 — 사용자가 등록한 실제 결제다.
  ins.run('2026-07-15', ids.cat, 20000, ids.pm, '구독료', 'recurring');
  // 007 이 origin 을 NOT NULL DEFAULT 'manual' 로 넣었다. NULL 인 행은 만들 수
  // 없으므로 기본값이 들어간 옛 행을 흉내 낸다.
  ins.run('2026-07-16', ids.cat, 11000, ids.pm, '옛날거래', 'manual');
  db.close();
});

after(() => server && server.stop());

describe('A. 조건 생성', () => {
  test('A-1. 기본값은 포함이라 조건이 안 붙는다', () => {
    // 조건이 붙으면 쿼리가 달라지고, 기본 동작이 조용히 바뀐다.
    for (const q of [{}, { derived: 'on' }, { derived: '' }, { derived: 'yes' }, undefined]) {
      assert.deepEqual(derivedFilter(q), { sql: '', params: [] }, JSON.stringify(q));
    }
  });

  test("A-2. 'off' 일 때만 제외 조건이 붙는다", () => {
    const f = derivedFilter({ derived: 'off' });
    assert.match(f.sql, /NOT IN/);
    assert.equal(f.params.length, 4);
  });

  test('A-3. NULL 을 만나도 행을 떨어뜨리지 않는다', () => {
    // 스키마상 origin 은 NOT NULL 이라 지금은 NULL 이 안 나온다. 다만 이 조각이
    // LEFT JOIN 의 ON 에서 WHERE 로 옮겨지면 매칭 안 된 쪽이 NULL 이 되고,
    // `NULL NOT IN (...)` 은 NULL 이라 그 행이 조용히 빠진다.
    assert.match(derivedFilter({ derived: 'off' }).sql, /COALESCE\(t\.origin, 'manual'\)/);
  });
});

// 넣어 둔 7건 중 **대출이자(7,000원)는 토글과 무관하게 늘 빠진다.**
// #269 가 EXPENSE_ROW 에 `origin != 'debt_interest'` 를 박아 뒀다 — 이 앱의 이자
// 기록은 잔액에 자본화되고(debts.balance += interest) 실제 상환은 따로 거래로
// 들어오므로, 둘 다 세면 이중계산이 된다.
//
// 그래서 토글이 실제로 움직이는 것은 할부·리볼빙·상환 3종뿐이다.
//
//   포함:  100,000 + 30,000 + 5,000 + 9,000 + 20,000 + 11,000 = 175,000
//   제외:  100,000 + 20,000 + 11,000                          = 131,000
describe('B. 집계가 실제로 바뀐다', () => {
  const url = (extra = '') => `/api/transactions/summary/category-breakdown?from=2026-07-01&to=2026-07-31${extra}`;

  test('B-1. 포함이 기본값이다', async () => {
    const { status, body } = await json(url());
    assert.equal(status, 200);
    assert.equal(total(body), 175000, '파생 행이 기본값에서 빠졌다');
  });

  test('B-2. off 를 주면 파생 4종이 빠진다', async () => {
    const { body } = await json(url('&derived=off'));
    assert.equal(total(body), 131000, '토글이 집계를 안 바꿨다');
  });

  test('B-3. 반복거래는 안 빠진다', async () => {
    // 공과금·구독료가 합계에서 사라지면 안 된다.
    const a = total((await json(url())).body);
    const b = total((await json(url('&derived=off'))).body);
    // 할부 30,000 + 리볼빙 5,000 + 상환 9,000 만 빠져야 한다.
    assert.equal(a - b, 44000, '반복거래나 사용자 입력까지 뺐다');
  });

  test('B-4. 모르는 값은 포함으로 떨어진다', async () => {
    // 조용히 빼면 사용자가 왜 합계가 줄었는지 알 수 없다.
    const { body } = await json(url('&derived=nonsense'));
    assert.equal(total(body), 175000);
  });
});

describe('C. 기간 검증이 다른 엔드포인트와 같아진다', () => {
  test('C-1. 시작이 종료보다 뒤면 400 이다', async () => {
    const { status, body } = await json('/api/transactions/summary/category-breakdown?from=2026-07-31&to=2026-07-01');
    assert.equal(status, 400);
    assert.match(body.error, /[가-힣]/);
    assert.doesNotMatch(body.error, /from|to|Invalid/);
  });

  test('C-2. 형식이 틀리면 400 이다', async () => {
    const { status } = await json('/api/transactions/summary/category-breakdown?from=2026-7-1&to=2026-07-31');
    assert.equal(status, 400);
  });

  test('C-3. 없는 날짜는 400 이다', async () => {
    const { status } = await json('/api/transactions/summary/category-breakdown?from=2026-02-30&to=2026-07-31');
    assert.equal(status, 400);
  });

  test('C-4. 기간을 아예 안 주면 400 이다', async () => {
    const { status } = await json('/api/transactions/summary/category-breakdown');
    assert.equal(status, 400);
  });

  test('C-5. month 단축형도 받는다', async () => {
    // resolvePeriod 를 쓰므로 from/to 말고 month 로도 물을 수 있다.
    const { status, body } = await json('/api/transactions/summary/category-breakdown?month=2026-07');
    assert.equal(status, 200);
    assert.equal(total(body), 175000);
  });
});
