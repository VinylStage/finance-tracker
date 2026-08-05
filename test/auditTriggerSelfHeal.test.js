'use strict';
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { runMigrations } = require('../src/db/migrate');
const { auditTriggersComplete, targetTables } = require('../migrations/017-audit-triggers');

// `runMigrations` 만으로는 안 된다 — 마이그레이션 001 이 `db/init` 의 기본 스키마
// (`debts` 등)를 전제한다. 그래서 init 을 DB_PATH 로 격리해 통째로 세운다.
// `test/migrate-audit-rebuild.test.js` 가 쓰는 방식과 같다.
function freshDb(dir) {
  process.env.DB_PATH = path.join(dir, 'test.db');
  delete require.cache[require.resolve('../src/db/init')];
  return require('../src/db/init');
}

// 감사 트리거 자가치유(#454).
//
// 트리거가 한 번 빠지면 영구히 안 돌아왔다. `runMigrations` 이 재생성을 **새
// 마이그레이션이 적용됐을 때만** 불렀기 때문이다. 이미 최신인 DB 는 트리거 상태를
// 아예 안 봤다.
//
// 이 저장소가 라우트 기록 대신 트리거를 고른 이유가 "빠뜨려도 구멍이 안 나는 구조"
// 였는데(docs/DATA_MODEL.md), 그 보장에 구멍이 있었다. 트리거가 빠진 표는 조용히
// 감사에서 사라지고, `audit_log` 는 실행취소의 유일한 근거라 되돌릴 수도 없다.

let dir;
let db;

function triggerNames() {
  return db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'audit_%' ORDER BY name
  `).all().map((r) => r.name);
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-heal-'));
  db = freshDb(dir);
});

afterEach(() => {
  if (db) db.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

describe('A. 커버리지 판정', () => {
  test('A-1. 마이그레이션 직후에는 다 있다', () => {
    assert.ok(auditTriggersComplete(db));
  });

  test('A-2. 하나만 빠져도 false 다', () => {
    const name = triggerNames()[0];
    db.prepare(`DROP TRIGGER ${name}`).run();
    assert.strictEqual(auditTriggersComplete(db), false);
  });

  test('A-3. 대상 표를 실제로 잡는다', () => {
    assert.ok(targetTables(db).length > 0);
  });
});

describe('B. 자가치유', () => {
  test('B-1. 빠진 트리거를 재기동이 되살린다', () => {
    const names = triggerNames();
    const toDrop = names.slice(0, 3);
    for (const name of toDrop) {
      db.prepare(`DROP TRIGGER ${name}`).run();
    }
    runMigrations(db);
    const remaining = triggerNames();
    for (const name of toDrop) {
      assert.ok(remaining.includes(name));
    }
  });

  test('B-2. 되살린 뒤 커버리지가 완전하다', () => {
    const names = triggerNames();
    const toDrop = names.slice(0, 3);
    for (const name of toDrop) {
      db.prepare(`DROP TRIGGER ${name}`).run();
    }
    runMigrations(db);
    assert.ok(auditTriggersComplete(db));
  });

  test('B-3. 트리거 수가 원래대로 돌아온다', () => {
    const names = triggerNames();
    const toDrop = names.slice(0, 3);
    for (const name of toDrop) {
      db.prepare(`DROP TRIGGER ${name}`).run();
    }
    const originalLength = names.length;
    runMigrations(db);
    assert.strictEqual(triggerNames().length, originalLength);
  });

  test('B-4. 멀쩡하면 이름 목록이 그대로다', () => {
    const before = triggerNames();
    runMigrations(db);
    const after = triggerNames();
    assert.deepStrictEqual(after, before);
  });
});
