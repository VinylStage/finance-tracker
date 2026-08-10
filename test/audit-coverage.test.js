'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const { rebuildAuditTriggers, targetTables, EXCLUDED } = require('../migrations/017-audit-triggers');

// 이 파일의 목적은 하나다 — **테이블을 새로 만들고 캡처를 빠뜨리면 실패하는 것**.
//
// 감사로그의 가치는 완전성이다. 부분 로그는 "아무 일도 없었다" 와 "그 테이블은
// 로깅을 안 한다" 를 구별할 수 없어 증거가 되지 못한다. M8·M10·M11 이 새 엔티티를
// 계속 들여오므로, 사람이 기억해서 트리거를 붙이는 방식은 언젠가 새어나간다.

let dir, db;

function realDbSchema() {
  // 실제 스키마 전체를 임시 파일에 세운다. 실거래 DB 는 열지 않는다.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-audit-cov-'));
  const p = path.join(tmp, 'schema.db');
  process.env.DB_PATH = p;
  delete require.cache[require.resolve('../src/db/init')];
  const live = require('../src/db/init');
  return { tmp, live };
}

before(() => {
  const r = realDbSchema();
  dir = r.tmp;
  db = r.live;
});

after(() => {
  try { db.close(); } catch {}
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

const triggerNames = () => db.prepare(
  "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'audit_%'"
).all().map((r) => r.name);

describe('A. 캡처 누락 감시', () => {
  test('A-1. 모든 대상 테이블에 INSERT/UPDATE/DELETE 트리거가 있다', () => {
    const names = new Set(triggerNames());
    const missing = [];
    for (const t of targetTables(db)) {
      for (const op of ['ins', 'upd', 'del']) {
        if (!names.has(`audit_${t}_${op}`)) missing.push(`audit_${t}_${op}`);
      }
    }
    assert.deepEqual(missing, [], `캡처가 빠진 테이블이 있다: ${missing.join(', ')}`);
  });

  test('A-2. 새 테이블을 만들면 그 사실이 드러난다', () => {
    // 마이그레이션을 다시 돌리지 않은 상태에서는 트리거가 없어야 하고,
    // A-1 과 같은 방식의 검사가 그것을 잡아낸다.
    db.exec('CREATE TABLE IF NOT EXISTS zz_new_entity (id INTEGER PRIMARY KEY, name TEXT)');

    const names = new Set(triggerNames());
    assert.ok(!names.has('audit_zz_new_entity_ins'), '아직 트리거가 없어야 한다');
    assert.ok(targetTables(db).includes('zz_new_entity'), '대상 목록에는 잡혀야 한다');
  });

  test('A-3. 마이그레이션을 다시 돌리면 새 테이블도 덮인다', () => {
    rebuildAuditTriggers(db);
    const names = new Set(triggerNames());
    for (const op of ['ins', 'upd', 'del']) {
      assert.ok(names.has(`audit_zz_new_entity_${op}`), `audit_zz_new_entity_${op} 가 없다`);
    }
  });

  test('A-4. 재생성해도 트리거가 중복되지 않는다', () => {
    const before = triggerNames().length;
    rebuildAuditTriggers(db);
    assert.equal(triggerNames().length, before);
  });
});

describe('B. 제외 대상', () => {
  test('B-1. audit_log 는 캡처하지 않는다 — 무한 루프 방지', () => {
    assert.ok(EXCLUDED.has('audit_log'));
    assert.ok(!triggerNames().some((n) => n.startsWith('audit_audit_log_')));
  });

  test('B-2. _audit_context 는 캡처하지 않는다', () => {
    assert.ok(EXCLUDED.has('_audit_context'));
    assert.ok(!triggerNames().some((n) => n.startsWith('audit__audit_context_')));
  });

  test('B-3. schema_migrations 는 캡처하지 않는다 — 데이터 변경이 아니다', () => {
    assert.ok(EXCLUDED.has('schema_migrations'));
    assert.ok(!triggerNames().some((n) => n.startsWith('audit_schema_migrations_')));
  });
});

describe('C. 컬럼 추가 대응', () => {
  test('C-1. 컬럼을 늘리고 재생성하면 새 컬럼도 잡힌다', () => {
    db.exec('ALTER TABLE zz_new_entity ADD COLUMN memo TEXT');
    rebuildAuditTriggers(db);

    db.prepare("UPDATE _audit_context SET actor='user', action_id='cov-1' WHERE id=1").run();
    db.prepare("INSERT INTO zz_new_entity (name, memo) VALUES ('가', '메모')").run();

    const log = db.prepare(
      "SELECT after_json FROM audit_log WHERE table_name='zz_new_entity' ORDER BY id DESC LIMIT 1"
    ).get();
    const parsed = JSON.parse(log.after_json);
    assert.equal(parsed.memo, '메모', '새 컬럼이 캡처에 없다');
  });
});
