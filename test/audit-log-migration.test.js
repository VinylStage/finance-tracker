'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const migration = require('../migrations/010-add-audit-log');
const { AUDIT_ACTORS, AUDIT_OPS } = require('../src/constants');

let dir, db;

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-audit-'));
  db = new Database(path.join(dir, 'test.db'));
});

after(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function columns() {
  return db.prepare('PRAGMA table_info(audit_log)').all().map((c) => c.name);
}
function indexNames() {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='audit_log'")
    .all().map((r) => r.name);
}

describe('A. 마이그레이션', () => {
  test('A-1. 적용 전에는 audit_log 가 없다', () => {
    const t = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='audit_log'").get();
    assert.equal(t, undefined);
  });

  test('A-2. 적용하면 필요한 컬럼이 전부 생긴다', () => {
    migration.up(db);
    const cols = columns();
    for (const c of [
      'id', 'ts', 'actor', 'action_id', 'action_label',
      'op', 'table_name', 'row_id', 'before_json', 'after_json',
      'undone_at', 'undo_of',
    ]) {
      assert.ok(cols.includes(c), `${c} 컬럼이 없다`);
    }
  });

  test('A-3. 두 번 실행해도 안전하다', () => {
    migration.up(db);
    assert.ok(columns().includes('action_id'));
  });

  test('A-4. 인덱스 3종이 생긴다', () => {
    const idx = indexNames();
    for (const n of ['idx_audit_action', 'idx_audit_undoable', 'idx_audit_ts']) {
      assert.ok(idx.includes(n), `${n} 인덱스가 없다`);
    }
  });

  test('A-5. 되돌리기 후보 인덱스는 부분 인덱스다', () => {
    // 이미 되돌린 행이 인덱스에서 빠져야 로그가 쌓여도 후보 조회가 안 느려진다.
    const sql = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_audit_undoable'"
    ).get().sql;
    assert.match(sql, /WHERE\s+undone_at\s+IS\s+NULL/i);
  });
});

describe('B. 정본 상수', () => {
  test('B-1. AUDIT_ACTORS 가 시스템·임포트를 구분한다', () => {
    // 사용자가 하지 않은 쓰기를 실행취소 후보에서 빼려면 이 구분이 필요하다.
    assert.deepEqual(AUDIT_ACTORS, ['user', 'system', 'import']);
  });

  test('B-2. AUDIT_OPS 에 RESTORE 가 있다', () => {
    // 복원은 행 단위가 아니라 사실 1행으로 남기고 되돌리기에서 제외한다.
    assert.ok(AUDIT_OPS.includes('RESTORE'));
    for (const op of ['INSERT', 'UPDATE', 'DELETE']) assert.ok(AUDIT_OPS.includes(op));
  });
});

describe('C. 작업 그룹(action_id)', () => {
  const insert = (row) => db.prepare(`
    INSERT INTO audit_log (ts, actor, action_id, action_label, op, table_name, row_id, before_json, after_json)
    VALUES (@ts, @actor, @action_id, @action_label, @op, @table_name, @row_id, @before_json, @after_json)
  `).run({ action_label: null, row_id: null, before_json: null, after_json: null, ...row });

  test('C-1. 한 작업이 여러 행을 가져도 action_id 로 묶인다', () => {
    // #269 재생성 시나리오 — 삭제 2 + 삽입 2 가 사용자 동작 1건이다.
    const aid = 'act-regen-1';
    insert({ ts: '2026-08-03 10:00:00', actor: 'user', action_id: aid, op: 'DELETE', table_name: 'transactions', row_id: 1 });
    insert({ ts: '2026-08-03 10:00:00', actor: 'user', action_id: aid, op: 'DELETE', table_name: 'transactions', row_id: 2 });
    insert({ ts: '2026-08-03 10:00:00', actor: 'user', action_id: aid, op: 'INSERT', table_name: 'transactions', row_id: 3 });
    insert({ ts: '2026-08-03 10:00:00', actor: 'user', action_id: aid, op: 'INSERT', table_name: 'transactions', row_id: 4 });

    const n = db.prepare('SELECT COUNT(*) c FROM audit_log WHERE action_id=?').get(aid).c;
    assert.equal(n, 4);
  });

  test('C-2. 같은 시각의 다른 작업은 섞이지 않는다', () => {
    // ts 로 묶으면 안 되는 이유를 고정한다 — 같은 시각이 같은 작업을 뜻하지 않는다.
    insert({ ts: '2026-08-03 10:00:00', actor: 'user', action_id: 'act-other', op: 'UPDATE', table_name: 'categories', row_id: 9 });
    const sameTs = db.prepare("SELECT COUNT(DISTINCT action_id) c FROM audit_log WHERE ts='2026-08-03 10:00:00'").get().c;
    assert.equal(sameTs, 2);
  });

  test('C-3. 시스템 작업은 actor 로 걸러낼 수 있다', () => {
    insert({ ts: '2026-08-03 11:00:00', actor: 'system', action_id: 'act-sweep', op: 'UPDATE', table_name: 'installments', row_id: 1 });
    const userActions = db.prepare(`
      SELECT DISTINCT action_id FROM audit_log WHERE actor='user'
    `).all().map((r) => r.action_id);
    assert.ok(!userActions.includes('act-sweep'));
  });

  test('C-4. 되돌린 그룹은 undone_at 으로 후보에서 빠진다', () => {
    db.prepare("UPDATE audit_log SET undone_at='2026-08-03 12:00:00' WHERE action_id='act-regen-1'").run();
    const candidates = db.prepare(`
      SELECT DISTINCT action_id FROM audit_log
      WHERE undone_at IS NULL AND actor='user'
    `).all().map((r) => r.action_id);
    assert.ok(!candidates.includes('act-regen-1'));
    assert.ok(candidates.includes('act-other'));
  });

  test('C-5. 되돌리기가 만든 로그는 undo_of 로 표시돼 다시 후보가 되지 않는다', () => {
    insert({ ts: '2026-08-03 12:00:00', actor: 'user', action_id: 'act-undo-1', op: 'INSERT', table_name: 'transactions', row_id: 1 });
    db.prepare("UPDATE audit_log SET undo_of='act-regen-1' WHERE action_id='act-undo-1'").run();
    const candidates = db.prepare(`
      SELECT DISTINCT action_id FROM audit_log
      WHERE undone_at IS NULL AND undo_of IS NULL AND actor='user'
    `).all().map((r) => r.action_id);
    assert.ok(!candidates.includes('act-undo-1'));
  });
});

describe('D. 변경 전/후 값', () => {
  test('D-1. before/after 에 행 전체를 JSON 으로 담는다', () => {
    // 이번 M6 복구 사례와 같은 형태 — 할부 status 를 진행중에서 완료로 바꾼 기록.
    const before = { id: 1, merchant: '예스이십사 주식회사', status: '진행중' };
    const after = { id: 1, merchant: '예스이십사 주식회사', status: '완료' };
    db.prepare(`
      INSERT INTO audit_log (ts, actor, action_id, op, table_name, row_id, before_json, after_json)
      VALUES (?, 'user', 'act-complete', 'UPDATE', 'installments', 1, ?, ?)
    `).run('2026-08-03 13:00:00', JSON.stringify(before), JSON.stringify(after));

    const row = db.prepare("SELECT * FROM audit_log WHERE action_id='act-complete'").get();
    assert.equal(JSON.parse(row.before_json).status, '진행중');
    assert.equal(JSON.parse(row.after_json).status, '완료');
  });

  test('D-2. INSERT 는 before 가, DELETE 는 after 가 비어 있다', () => {
    db.prepare(`
      INSERT INTO audit_log (ts, actor, action_id, op, table_name, row_id, after_json)
      VALUES ('2026-08-03 14:00:00', 'user', 'act-ins', 'INSERT', 'transactions', 50, '{"id":50}')
    `).run();
    db.prepare(`
      INSERT INTO audit_log (ts, actor, action_id, op, table_name, row_id, before_json)
      VALUES ('2026-08-03 14:00:01', 'user', 'act-del', 'DELETE', 'transactions', 51, '{"id":51}')
    `).run();

    assert.equal(db.prepare("SELECT before_json b FROM audit_log WHERE action_id='act-ins'").get().b, null);
    assert.equal(db.prepare("SELECT after_json a FROM audit_log WHERE action_id='act-del'").get().a, null);
  });
});
