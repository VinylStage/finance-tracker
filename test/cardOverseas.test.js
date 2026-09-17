'use strict';

// 해외 표시를 읽어 내는 규칙과 백필 계획(#710 · ADR 0010).
//
// ─────────────────────────────────────────────────────────────────────────
// 이 테스트가 못박는 것
//
// 「해외결제인가」 는 **우리가 판단하는 것이 아니라 카드사가 분류한 것**이다.
// 명세서에 국가코드나 원 통화가 찍혔다는 것이 그 분류의 신호다.
//
// 그래서 여기서 보는 것은 「해외 서비스를 알아보나」 가 아니라 **「카드사가 남긴
// 표시만 읽고 그 밖은 짐작하지 않나」** 다. 짐작이 들어가면 두 가지가 같이
// 망가진다 — 없는 혜택을 있다고 말하게 되고(과대추정), 경고가 잦아져 사용자가
// 확인을 그만둔다.
//
// 실측(실DB 580건, 2026-09-17): 이름만 보면 해외 서비스인 결제가 49건 있었는데
// 표시가 붙은 것은 18건이었다. 나머지는 국내 PG 를 거쳐 원화로 청구돼 카드사가
// **국내로 분류**한 것으로 보이고, 그러면 해외 적립도 안 붙는다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const {
  looksOverseas, overseasEvidence,
  planOverseasBackfill, applyOverseasBackfill, SAMPLE_LIMIT,
} = require('../src/services/cardOverseas.js');

// ─────────────────────────────────────────────────────────────────────────
// 읽어 내는 규칙

test('원 통화 조각을 읽는다 — 현대 형식', () => {
  assert.equal(looksOverseas('ANTHROPIC,USD:5.50'), true);
  assert.equal(looksOverseas('CLAUDE.AI SUBSCRIPTI,USD:22.00'), true);
  assert.equal(looksOverseas('PAYPAL *EMTG,USD:111.21'), true);
  assert.equal(overseasEvidence('ANTHROPIC,USD:5.50'), 'currency');
});

test('말미 국가코드를 읽는다 — 두 글자도 세 글자도', () => {
  assert.equal(looksOverseas('CLAUDE.AI SUBSCRIPTION   +14152360599 US'), true);
  assert.equal(looksOverseas('ANTHROPIC              SAN FRANCISCO USA'), true);
  assert.equal(looksOverseas('PlayStation Network    Sony PSN      JPN'), true);
  assert.equal(overseasEvidence('ANTHROPIC              SAN FRANCISCO USA'), 'country');
});

test('국가코드 앞에는 공백이 있어야 한다 — 「SSG_COM」 의 COM 이 걸리면 안 된다', () => {
  // 실DB 에 158,022원어치 있는 국내 결제다. 공백 조건이 빠지면 이것이 해외로
  // 잡히고, 사용자는 안 받은 혜택을 받은 것으로 계산된 금액을 본다.
  assert.equal(looksOverseas('SSG_COM'), false);
  assert.equal(looksOverseas('KCP - Amazon_AWS'), false);
});

test('우리나라 코드가 찍힌 것은 국내다 — 정반대로 읽으면 안 된다', () => {
  // 카드사가 KR/KOR 을 찍었다는 것은 **국내로 분류했다**는 뜻이다.
  assert.equal(looksOverseas('어느가맹점 SEOUL KOR'), false);
  assert.equal(looksOverseas('어느가맹점 KR'), false);
});

test('이름으로 짐작하지 않는다 — 표시가 없으면 국내다', () => {
  // 전부 실DB 에 있던 이름이다. 해외 서비스처럼 보이지만 명세서에 표시가 없다.
  for (const m of ['Adobe', 'Temu', 'Claude', 'Apple iCloud', 'Obsidian',
    'PLAYSTATION', 'breeze', 'F1Clash', 'OPENAI *CHATGPT']) {
    assert.equal(looksOverseas(m), false, `${m} 를 짐작으로 해외 처리하면 안 된다`);
  }
});

test('국내 가맹점은 당연히 아니다', () => {
  for (const m of ['GS25 어딘가점', '씨유', '스타벅스_주문', '카카오택시', '']) {
    assert.equal(looksOverseas(m), false);
  }
});

test('문자열이 아니면 던지지 않고 false 다', () => {
  for (const v of [null, undefined, 0, {}, []]) {
    assert.equal(looksOverseas(v), false);
    assert.equal(overseasEvidence(v), null);
  }
});

test('통화 조각은 소수 두 자리를 요구한다 — 「,ABC:1」 같은 문자열이 걸리면 안 된다', () => {
  assert.equal(looksOverseas('어느가게,ABC:1'), false);
  assert.equal(looksOverseas('어느가게,ABC:1.5'), false);
  assert.equal(looksOverseas('어느가게,ABC:1.50'), true);
});

// ─────────────────────────────────────────────────────────────────────────
// 백필 — 프리뷰는 DB 를 바꾸지 않는다

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'overseas-'));
  const db = new Database(path.join(dir, 'x.db'));
  db.exec(`
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY, date TEXT, merchant TEXT, amount INTEGER,
      is_overseas INTEGER NOT NULL DEFAULT 0
    )
  `);
  return db;
}

function seed(db, rows) {
  const stmt = db.prepare('INSERT INTO transactions (date, merchant, amount, is_overseas) VALUES (?,?,?,?)');
  for (const r of rows) stmt.run(r.date || '2026-01-11', r.merchant, r.amount || 1000, r.is_overseas || 0);
}

test('프리뷰는 DB 를 바꾸지 않는다 — ADR 0008 의 첫 요건', () => {
  const db = tempDb();
  seed(db, [{ merchant: 'ANTHROPIC,USD:5.50' }, { merchant: '동네분식' }]);

  planOverseasBackfill(db);
  planOverseasBackfill(db);

  const marked = db.prepare('SELECT COUNT(*) c FROM transactions WHERE is_overseas=1').get().c;
  assert.equal(marked, 0, '프리뷰를 부른 것만으로 값이 바뀌면 안 된다');
});

test('표시가 있는 것만 고른다 — 건수·금액·근거를 함께 낸다', () => {
  const db = tempDb();
  seed(db, [
    { merchant: 'ANTHROPIC,USD:5.50', amount: 8116 },
    { merchant: 'ANTHROPIC              SAN FRANCISCO USA', amount: 12106 },
    { merchant: '동네분식', amount: 9000 },
    { merchant: 'Adobe', amount: 14520 },
  ]);

  const plan = planOverseasBackfill(db);
  assert.equal(plan.count, 2);
  assert.equal(plan.amount, 20222);
  assert.deepEqual(plan.byEvidence, { currency: 1, country: 1 });
});

test('이미 선 것은 세지 않는다 — 두 번 돌리면 두 번째는 0건이다', () => {
  const db = tempDb();
  seed(db, [{ merchant: 'ANTHROPIC,USD:5.50' }, { merchant: '동네분식' }]);

  const first = planOverseasBackfill(db);
  assert.equal(first.count, 1);
  assert.equal(applyOverseasBackfill(db, first), 1);

  const second = planOverseasBackfill(db);
  assert.equal(second.count, 0, '바뀌지 않는 것을 건수에 넣으면 「N건이 바뀝니다」 가 사실이 아니게 된다');
  assert.deepEqual(second.ids, []);
});

test('되돌리는 방향은 하지 않는다 — 사람이 손으로 세운 값을 기계가 내리면 안 된다', () => {
  const db = tempDb();
  seed(db, [{ merchant: '동네분식', is_overseas: 1 }]);

  const plan = planOverseasBackfill(db);
  assert.equal(plan.count, 0);
  applyOverseasBackfill(db, plan);

  const row = db.prepare('SELECT is_overseas FROM transactions').get();
  assert.equal(row.is_overseas, 1, '표시가 없다고 해서 사람이 세운 값을 내리지 않는다');
});

test('근거를 사례로 보여준다 — 건수만 보여주면 확인이 아니라 통보다', () => {
  const db = tempDb();
  seed(db, Array.from({ length: SAMPLE_LIMIT + 5 }, (_, i) => ({
    merchant: `FOO${i},USD:1.00`, amount: 1000 + i,
  })));

  const plan = planOverseasBackfill(db);
  assert.equal(plan.count, SAMPLE_LIMIT + 5);
  assert.equal(plan.samples.length, SAMPLE_LIMIT, '사례는 자르되 건수는 전체다');
  for (const s of plan.samples) {
    assert.ok(s.merchant && s.evidence, '사례에 무엇을 보고 그랬는지가 실려야 한다');
  }
});

test('지문은 대상이 바뀌면 달라진다 — 프리뷰 이후 원장이 움직인 것을 잡는다', () => {
  const db = tempDb();
  seed(db, [{ merchant: 'ANTHROPIC,USD:5.50' }]);
  const before = planOverseasBackfill(db).fingerprint;

  seed(db, [{ merchant: 'OPENAI                 SAN FRANCISCO USA' }]);
  const after = planOverseasBackfill(db).fingerprint;

  assert.notEqual(before, after);
});

test('가맹점 이름이 바뀌어도 지문이 달라진다 — id 만 보면 못 잡는다', () => {
  const db = tempDb();
  seed(db, [{ merchant: 'ANTHROPIC,USD:5.50' }]);
  const before = planOverseasBackfill(db).fingerprint;

  db.prepare("UPDATE transactions SET merchant='ANTHROPIC,USD:9.99' WHERE id=1").run();
  const after = planOverseasBackfill(db).fingerprint;

  assert.notEqual(before, after, '사용자가 본 근거와 실제로 바뀌는 행이 다를 수 있다');
});

test('대상이 없으면 아무것도 쓰지 않는다', () => {
  const db = tempDb();
  seed(db, [{ merchant: '동네분식' }]);
  assert.equal(applyOverseasBackfill(db, planOverseasBackfill(db)), 0);
  assert.equal(applyOverseasBackfill(db, null), 0);
  assert.equal(applyOverseasBackfill(db, { ids: [] }), 0);
});
