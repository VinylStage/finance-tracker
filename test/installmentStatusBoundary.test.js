// 상태 계산식의 경계(#205).
//
// 위 계층(installmentStatusComputed.test.js)은 실제 서버를 띄워 오늘 날짜로
// 검사한다. 그것만으로는 **경계를 못 짚는다** — 경계는 "마지막 청구월의 다음 달
// 1일" 이라 한 달에 하루뿐이고, 나머지 29~30일 동안은 `>=` 를 `>` 로 바꿔도
// 어떤 단언도 깨지지 않는다.
//
// 그래서 여기서는 `@today` 를 직접 넣어 경계 하루 전·당일·다음 날을 짚는다.
// 계산식 문자열은 구현에서 가져온다. 다시 적으면 한쪽만 고쳐질 수 있고, 그러면
// 이 파일은 자기 자신을 검사하게 된다.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { STATUS_EXPR } = require('../src/services/installmentStatus');

let dir;
let db;

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inst-status-'));
  db = new Database(path.join(dir, 'test.db'));
  db.exec(`
    CREATE TABLE installments (
      id INTEGER PRIMARY KEY,
      start_billing_month TEXT NOT NULL,
      months INTEGER NOT NULL,
      paid_off_on TEXT
    );
  `);
});

after(() => {
  if (db) db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

// 계산식을 그대로 돌려 상태를 얻는다.
function statusOf({ startMonth, months, paidOffOn = null, today }) {
  db.prepare('DELETE FROM installments').run();
  db.prepare(
    'INSERT INTO installments (id, start_billing_month, months, paid_off_on) VALUES (1, ?, ?, ?)'
  ).run(startMonth, months, paidOffOn);
  return db.prepare(`SELECT ${STATUS_EXPR} AS status FROM installments i`).get({ today }).status;
}

// 2026-01 에 시작한 3개월 할부: 청구월은 1·2·3월, 경계는 2026-04-01.
const PLAN = { startMonth: '2026-01', months: 3 };

test('경계 하루 전은 진행중이다', () => {
  assert.strictEqual(statusOf({ ...PLAN, today: '2026-03-31' }), '진행중');
});

// `>=` 를 `>` 로 바꾸면 이 단언만 깨진다. 위 두 줄과 아래 한 줄은 그대로 통과한다.
test('경계 당일은 완료다', () => {
  assert.strictEqual(statusOf({ ...PLAN, today: '2026-04-01' }), '완료');
});

test('경계 다음 날도 완료다', () => {
  assert.strictEqual(statusOf({ ...PLAN, today: '2026-04-02' }), '완료');
});

test('시작 전이면 진행중이다', () => {
  assert.strictEqual(statusOf({ ...PLAN, today: '2025-12-15' }), '진행중');
});

test('마지막 청구월 안에서는 아직 진행중이다', () => {
  assert.strictEqual(statusOf({ ...PLAN, today: '2026-03-01' }), '진행중');
});

// ── 조기 완납 ──────────────────────────────────────────────────────────

test('조기 완납일 하루 전은 진행중이다', () => {
  assert.strictEqual(
    statusOf({ ...PLAN, paidOffOn: '2026-02-10', today: '2026-02-09' }),
    '진행중'
  );
});

test('조기 완납일 당일은 완료다', () => {
  assert.strictEqual(
    statusOf({ ...PLAN, paidOffOn: '2026-02-10', today: '2026-02-10' }),
    '완료'
  );
});

// `IS NOT NULL` 을 `IS NULL` 로 바꾸면 여기서 걸린다 — 완납일이 없는 행이
// 첫 가지에 잡혀 엉뚱하게 완료가 된다.
test('조기 완납일이 없으면 기간으로만 판정한다', () => {
  assert.strictEqual(statusOf({ ...PLAN, paidOffOn: null, today: '2026-02-10' }), '진행중');
});

// 완납일이 기간 종료보다 뒤인 경우. 기간이 끝났으면 완납일과 무관하게 완료다 —
// 두 번째 가지가 살아 있어야 통과한다.
test('완납일이 미래여도 기간이 끝났으면 완료다', () => {
  assert.strictEqual(
    statusOf({ ...PLAN, paidOffOn: '2026-09-01', today: '2026-04-01' }),
    '완료'
  );
});
