'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const { runMigrations } = require('../src/db/migrate');
const { targetTables } = require('../migrations/017-audit-triggers');

// 마이그레이션 체계 이전(#89 이전) 스키마에서 최신 체인이 도는지(#369).
//
// **이 픽스처는 코드로 재생성할 수 없다.** 마이그레이션 N 까지의 상태는 001..N 을
// 돌리면 되지만, 체계가 생기기 전의 baseline 은 당시의 src/db/init.js 가 만들었고
// 그 파일도 그동안 바뀌었다. 원본이 정리 대상 디렉터리에만 남아 있어 스키마만
// 떠 왔다 — test/fixtures/legacy-schema/README.md 참고.
//
// 변종을 둘 다 도는 이유: 마이그레이션들이 PRAGMA table_info 로 컬럼 존재를
// 확인해 분기한다. "컬럼이 이미 있는 경우"(fresh)와 "ALTER 로 붙은 경우"(altered)가
// 실제로 다른 경로를 탄다.

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'legacy-schema');
const VARIANTS = ['pre-migrations-altered', 'pre-migrations-fresh'];

function buildLegacyDb(variant) {
  const sql = fs.readFileSync(path.join(FIXTURE_DIR, `${variant}.sql`), 'utf8');
  const db = new Database(':memory:');
  db.exec(sql);
  return db;
}

// 마이그레이션이 기존 행을 건드리는지 보려면 행이 있어야 한다. 픽스처에는
// 데이터가 없으므로(스키마 전용) 여기서 최소한만 넣는다.
function seed(db) {
  db.prepare(`INSERT INTO categories (major_type, name) VALUES ('변동필수', '식비')`).run();
  const cat = db.prepare(`SELECT id FROM categories LIMIT 1`).get().id;
  db.prepare(`INSERT INTO payment_methods (name, type) VALUES ('하나카드', '신용')`).run();
  const pm = db.prepare(`SELECT id FROM payment_methods LIMIT 1`).get().id;
  const ins = db.prepare(
    `INSERT INTO transactions (date, amount, merchant, category_id, payment_method_id) VALUES (?,?,?,?,?)`
  );
  ins.run('2026-01-01', 10000, '가', cat, pm);
  ins.run('2026-01-02', 20000, '나', cat, pm);
  ins.run('2026-01-03', 30000, '다', cat, pm);
  return { cat, pm };
}

const snapshot = (db) => db.prepare(
  'SELECT id, date, amount, merchant, category_id, payment_method_id FROM transactions ORDER BY id'
).all();

describe('픽스처가 실재한다', () => {
  test('두 변종 파일이 있고 데이터가 들어 있지 않다', () => {
    for (const v of VARIANTS) {
      const p = path.join(FIXTURE_DIR, `${v}.sql`);
      assert.ok(fs.existsSync(p), `${v}.sql 이 없다`);
      const sql = fs.readFileSync(p, 'utf8');
      assert.ok(sql.includes('CREATE TABLE'), `${v}.sql 에 스키마가 없다`);
      // 스키마 전용이어야 한다. 실데이터가 섞이면 저장소에 가계부 내역이 들어간다.
      assert.ok(!/INSERT\s+INTO/i.test(sql), `${v}.sql 에 데이터가 섞여 있다`);
    }
  });
});

for (const variant of VARIANTS) {
  describe(`${variant} — 최신 체인 적용`, () => {
    test('A. 끝까지 돌고 integrity 가 깨지지 않는다', () => {
      const db = buildLegacyDb(variant);
      seed(db);

      runMigrations(db); // 던지면 여기서 실패한다

      const ic = Object.values(db.prepare('PRAGMA integrity_check').get())[0];
      assert.equal(ic, 'ok');
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
      db.close();
    });

    test('B. 기존 거래 값이 하나도 바뀌지 않는다', () => {
      const db = buildLegacyDb(variant);
      seed(db);
      const before = snapshot(db);

      runMigrations(db);

      assert.deepEqual(snapshot(db), before, '마이그레이션이 기존 값을 바꿨다');
      db.close();
    });

    test('C. 감사 캡처가 전 테이블을 덮는다', () => {
      // 러너가 체인 끝에서 트리거를 재생성한다(#346). 구버전 baseline 에서
      // 시작해도 새로 생긴 표까지 전부 덮여야 감사로그가 증거가 된다.
      const db = buildLegacyDb(variant);
      seed(db);
      runMigrations(db);

      const names = new Set(db.prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'audit_%'"
      ).all().map((r) => r.name));

      const missing = [];
      for (const t of targetTables(db)) {
        for (const op of ['ins', 'upd', 'del']) {
          if (!names.has(`audit_${t}_${op}`)) missing.push(`audit_${t}_${op}`);
        }
      }
      assert.deepEqual(missing, [], `캡처가 빠진 테이블이 있다: ${missing.join(', ')}`);
      db.close();
    });

    test('D. 두 번 돌려도 안전하다', () => {
      const db = buildLegacyDb(variant);
      seed(db);
      runMigrations(db);
      const after1 = snapshot(db);
      const mig1 = db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n;

      runMigrations(db);

      assert.deepEqual(snapshot(db), after1);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n, mig1,
        '같은 마이그레이션이 두 번 기록됐다');
      db.close();
    });
  });
}
