const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers/testServer');

// 데이터 무결성 점검 기능 테스트

const PORT = 34604; // 다른 테스트와 충돌 안 나게 임의 포트 사용
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  server = await startTestServer({ port: PORT });
});

after(() => {
  if (server) server.stop();
});

test('데이터 무결성 점검 — 정상 데이터일 때 모든 항목 count=0', async () => {
  const resp = await fetch(`${BASE}/api/data-integrity`);
  assert.strictEqual(resp.status, 200);
  const data = await resp.json();
  assert.strictEqual(data.checks.length, 7);
  for (const check of data.checks) {
    assert.strictEqual(check.count, 0, `check ${check.name} should have count=0`);
    assert.deepStrictEqual(check.samples, [], `check ${check.name} should have empty samples`);
  }
});

test('데이터 무결성 점검 — 각 이상 유형 테스트', async () => {
  // 직접 DB에 이상 데이터 삽입. transactions.category_id는 NOT NULL + FK라
  // 유효한 카테고리를 먼저 만들어야 한다.
  const db = require('better-sqlite3')(server.dbPath);
  const catId = db.prepare("INSERT INTO categories (name, major_type) VALUES ('테스트카테고리', '선택지출')").run().lastInsertRowid;

  // 1. 비ISO 날짜 형식
  db.prepare("INSERT INTO transactions (date, amount, payment_style, category_id) VALUES ('2023/01/01', 1000, '일시불', ?)").run(catId);

  // 2. payment_style 이상값
  db.prepare("INSERT INTO transactions (date, amount, payment_style, category_id) VALUES ('2023-01-02', 1000, '이상한 결제 방식', ?)").run(catId);

  // 3. major_type 이상값
  db.prepare("INSERT INTO categories (name, major_type) VALUES ('테스트카테고리2', '이상한 유형')").run();

  // 4. 금액이 비정상적으로 작은 임포트 건
  db.prepare("INSERT INTO transactions (date, amount, payment_style, category_id) VALUES ('2023-01-03', 50, '일시불', ?)").run(catId);

  // 5. 종료됐어야 하는데 진행중으로 남은 할부(2020년 시작 12개월이면 이미 한참 지남)
  db.prepare(`
    INSERT INTO installments (purchase_date, merchant, total_amount, months, monthly_amount, start_billing_month, status)
    VALUES ('2020-01-01', '테스트할부', 12000, 12, 1000, '2020-01', '진행중')
  `).run();

  // 6. 카테고리 없는 거래 — FK 제약이 걸려있어 정상 INSERT로는 만들 수 없다.
  // 유효한 카테고리로 넣은 뒤, 그 카테고리 행을 FK 검사를 끄고 강제로 지워서
  // 고아 상태(orphan)를 실제로 재현한다.
  const orphanCatId = db.prepare("INSERT INTO categories (name, major_type) VALUES ('삭제될카테고리', '선택지출')").run().lastInsertRowid;
  db.prepare("INSERT INTO transactions (date, amount, payment_style, category_id) VALUES ('2023-01-04', 1000, '일시불', ?)").run(orphanCatId);
  db.pragma('foreign_keys = OFF');
  db.prepare("DELETE FROM categories WHERE id = ?").run(orphanCatId);
  db.pragma('foreign_keys = ON');

  // 7. 중복 승인번호
  db.prepare("INSERT INTO transactions (date, amount, payment_style, category_id, approval_number) VALUES ('2023-01-05', 1000, '일시불', ?, '123456')").run(catId);
  db.prepare("INSERT INTO transactions (date, amount, payment_style, category_id, approval_number) VALUES ('2023-01-06', 2000, '일시불', ?, '123456')").run(catId);

  db.close();

  const resp = await fetch(`${BASE}/api/data-integrity`);
  assert.strictEqual(resp.status, 200);
  const data = await resp.json();

  assert.strictEqual(data.checks[0].count, 1, '비ISO 날짜 형식');
  assert.strictEqual(data.checks[1].count, 1, 'payment_style 이상값');
  assert.strictEqual(data.checks[2].count, 1, 'major_type 이상값');
  assert.strictEqual(data.checks[3].count, 1, '금액이 비정상적으로 작은 임포트 건');
  assert.strictEqual(data.checks[4].count, 1, '종료됐어야 하는데 진행중으로 남은 할부');
  assert.strictEqual(data.checks[5].count, 1, '카테고리 없는 거래');
  assert.strictEqual(data.checks[6].count, 1, '중복 승인번호');
});
