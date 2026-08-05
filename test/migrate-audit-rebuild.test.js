'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const { runMigrations } = require('../src/db/migrate');
const { hasAuditInfrastructure } = require('../migrations/017-audit-triggers');

// #346. 감사 트리거 재생성을 **마이그레이션 러너가** 책임진다.
//
// 전에는 테이블을 만든 마이그레이션이 각자 rebuildAuditTriggers 를 불렀다. 실측상
// 구멍은 없었지만(018 이 파일명 정렬상 마지막이라 앞의 것까지 덮었다), 그 안전은
// "작성자가 그 한 줄을 기억한다" 에 걸려 있었다. 여기서 검증하는 것은 그 기억에
// 기대지 않아도 캡처가 완전한가다.

let dir, db;

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-migrate-audit-'));
  process.env.DB_PATH = path.join(dir, 'schema.db');
  delete require.cache[require.resolve('../src/db/init')];
  db = require('../src/db/init'); // init 이 runMigrations 로 전체 체인을 세운다
});

after(() => {
  try { db.close(); } catch {}
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

const triggers = () => new Set(db.prepare(
  "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'audit_%'"
).all().map((r) => r.name));

describe('A. 018 의 개별 호출을 뺀 뒤에도 캡처가 완전한가', () => {
  test('A-1. accounts — 018 이 만든 테이블에 트리거가 있다', () => {
    const names = triggers();
    for (const op of ['ins', 'upd', 'del']) {
      assert.ok(names.has(`audit_accounts_${op}`), `audit_accounts_${op} 가 없다`);
    }
  });

  test('A-2. payment_methods — 018 이 늘린 컬럼(account_id)까지 잡는다', () => {
    db.prepare("UPDATE _audit_context SET actor='user', action_id='m346-a2' WHERE id=1").run();
    db.prepare("INSERT INTO payment_methods (name, type) VALUES ('감사테스트카드', '신용')").run();

    const row = db.prepare(
      "SELECT after_json FROM audit_log WHERE table_name='payment_methods' ORDER BY id DESC LIMIT 1"
    ).get();
    assert.ok(row, 'payment_methods INSERT 가 감사로그에 안 남았다');
    assert.ok('account_id' in JSON.parse(row.after_json), '018 이 늘린 컬럼이 캡처에 없다');
  });
});

describe('B. 러너가 체인 끝에서 재생성한다', () => {
  test('B-1. 마이그레이션이 스스로 부르지 않아도 트리거가 덮인다', () => {
    // 트리거 없이 테이블을 만든다 — "재생성을 빠뜨린 마이그레이션" 상태와 같다.
    db.exec('CREATE TABLE IF NOT EXISTS zz_late_entity (id INTEGER PRIMARY KEY, name TEXT)');
    assert.ok(!triggers().has('audit_zz_late_entity_ins'), '아직은 트리거가 없어야 한다');

    // 005 를 미적용으로 되돌린다. 005 는 CREATE INDEX IF NOT EXISTS 하나뿐이라
    // 다시 적용해도 no-op 이고, rebuildAuditTriggers 를 부르지 않는다 — 그래서
    // 트리거가 붙는다면 그건 러너가 한 것이다.
    db.prepare('DELETE FROM schema_migrations WHERE name = ?')
      .run('005-add-transactions-approval-index.js');

    runMigrations(db);

    const names = triggers();
    for (const op of ['ins', 'upd', 'del']) {
      assert.ok(names.has(`audit_zz_late_entity_${op}`), `audit_zz_late_entity_${op} 가 없다`);
    }
  });

  test('B-2. 커버리지가 완전하면 재생성하지 않는다', () => {
    // 매 기동마다 트리거를 다시 만들 이유가 없다 — 그 목표는 그대로다.
    //
    // 다만 판정 기준이 바뀌었다(#454). 전에는 **적용된 마이그레이션이 없으면**
    // 건너뛰었는데, 그러면 트리거가 한 번 빠진 DB 가 상태를 아예 안 봐서 **영구히
    // 안 돌아왔다.** 지금은 커버리지를 보고, 완전하면 건너뛴다.
    //
    // 그래서 이 테스트는 "새 표를 만들어도 안 덮인다" 대신 **"멀쩡하면 안 건드린다"**
    // 를 잠근다. 전자는 감사 구멍을 정상 동작으로 굳히는 단언이었다.
    const before = [...triggers()].sort();

    runMigrations(db); // 전부 적용됐고 커버리지도 완전한 상태

    assert.deepStrictEqual([...triggers()].sort(), before, '멀쩡한데 재생성이 돌았다');
  });

  test('B-2b. 트리거가 빠져 있으면 적용할 게 없어도 되살린다', () => {
    // #454 의 본체. 이 표는 마이그레이션 밖에서 생겼지만, 감사 대상 표에 트리거가
    // 없다는 사실은 원인과 무관하게 구멍이다.
    db.exec('CREATE TABLE IF NOT EXISTS zz_untouched (id INTEGER PRIMARY KEY)');

    runMigrations(db); // appliedAny=false 지만 커버리지가 불완전하다

    assert.ok(triggers().has('audit_zz_untouched_ins'), '빠진 트리거가 안 되살아났다');
  });

  test('B-3. 재생성이 두 번 돌아도 트리거가 늘지 않는다', () => {
    // 마이그레이션을 적용할 때마다 도는 코드라, 중복 생성이면 기동마다 불어난다.
    const rerun = () => {
      db.prepare('DELETE FROM schema_migrations WHERE name = ?')
        .run('005-add-transactions-approval-index.js');
      runMigrations(db);
    };

    rerun(); // 이 시점에 밀린 테이블까지 전부 덮인다
    const settled = triggers().size;
    rerun();
    assert.equal(triggers().size, settled);
  });
});

describe('C. 017 이전 DB 가드', () => {
  test('C-1. 감사 인프라가 선 DB 에서는 true', () => {
    assert.equal(hasAuditInfrastructure(db), true);
  });

  test('C-2. 감사 테이블이 없으면 false — 재생성을 건너뛴다', () => {
    const bare = new Database(path.join(dir, 'pre017.db'));
    try {
      assert.equal(hasAuditInfrastructure(bare), false, '빈 DB 인데 true 가 나왔다');

      // 둘 중 하나만 있어도 아직 아니다.
      bare.exec('CREATE TABLE _audit_context (id INTEGER PRIMARY KEY)');
      assert.equal(hasAuditInfrastructure(bare), false, '_audit_context 만 있는데 true 가 나왔다');

      bare.exec('CREATE TABLE audit_log (id INTEGER PRIMARY KEY)');
      assert.equal(hasAuditInfrastructure(bare), true, '둘 다 있는데 false 가 나왔다');
    } finally {
      bare.close();
    }
  });
});
