'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let db;
let tmpdir;

before(() => {
  tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-audit-cap-'));
  const dbPath = path.join(tmpdir, 'test.db');
  db = new Database(dbPath);

  // audit_log 테이블 생성
  db.exec(`
    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY,
      ts TEXT NOT NULL,
      actor TEXT NOT NULL,
      action_id TEXT NOT NULL,
      action_label TEXT,
      op TEXT NOT NULL,
      table_name TEXT NOT NULL,
      row_id INTEGER,
      before_json TEXT,
      after_json TEXT,
      undone_at TEXT,
      undo_of TEXT
    );
  `);

  // 검증 대상 테이블 categories 생성
  db.exec(`
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      major_type TEXT
    );
  `);

  // 마이그레이션 실행 (트리거 생성)
  require('../migrations/017-audit-triggers').up(db);
});

after(() => {
  db.close();
  fs.rmSync(tmpdir, { recursive: true });
});

describe('A. INSERT 캡처', () => {
  test('A-1. 행을 넣으면 audit_log 에 한 줄이 생긴다', () => {
    const insert = db.prepare(`INSERT INTO categories (name, major_type) VALUES ('테스트', '유형1')`);
    insert.run();

    const log = db.prepare(`SELECT * FROM audit_log`).get();
    assert.ok(log);
  });

  test('A-2. op 가 INSERT 다', () => {
    const insert = db.prepare(`INSERT INTO categories (name, major_type) VALUES ('테스트2', '유형2')`);
    insert.run();

    const log = db.prepare(`SELECT op FROM audit_log ORDER BY id DESC LIMIT 1`).get();
    assert.strictEqual(log.op, 'INSERT');
  });

  test('A-3. table_name 이 categories 다', () => {
    const insert = db.prepare(`INSERT INTO categories (name, major_type) VALUES ('테스트3', '유형3')`);
    insert.run();

    const log = db.prepare(`SELECT table_name FROM audit_log ORDER BY id DESC LIMIT 1`).get();
    assert.strictEqual(log.table_name, 'categories');
  });

  test('A-4. row_id 가 넣은 행의 id 다', () => {
    // 앞 테스트들이 이미 행을 넣었으므로 id 를 상수로 적으면 안 된다.
    const info = db.prepare(`INSERT INTO categories (name, major_type) VALUES ('테스트4', '유형4')`).run();

    const log = db.prepare(`SELECT row_id FROM audit_log ORDER BY id DESC LIMIT 1`).get();
    assert.strictEqual(log.row_id, info.lastInsertRowid);
  });

  test('A-5. before_json 이 NULL 이다', () => {
    const insert = db.prepare(`INSERT INTO categories (name, major_type) VALUES ('테스트5', '유형5')`);
    insert.run();

    const log = db.prepare(`SELECT before_json FROM audit_log ORDER BY id DESC LIMIT 1`).get();
    assert.strictEqual(log.before_json, null);
  });

  test('A-6. after_json 에 넣은 값이 들어 있다 (JSON.parse 해서 name 필드 확인)', () => {
    const insert = db.prepare(`INSERT INTO categories (name, major_type) VALUES ('테스트6', '유형6')`);
    insert.run();

    const log = db.prepare(`SELECT after_json FROM audit_log ORDER BY id DESC LIMIT 1`).get();
    const parsed = JSON.parse(log.after_json);
    assert.strictEqual(parsed.name, '테스트6');
  });
});

describe('B. UPDATE 캡처', () => {
  test('B-1. 행을 고치면 op 가 UPDATE 인 로그가 생긴다', () => {
    db.prepare(`UPDATE categories SET name = '수정된 이름' WHERE id = 1`).run();

    const log = db.prepare(`SELECT op FROM audit_log ORDER BY id DESC LIMIT 1`).get();
    assert.strictEqual(log.op, 'UPDATE');
  });

  test('B-2. before_json 에 고치기 전 값이 있다', () => {
    // 앞 테스트가 같은 행을 이미 고쳤을 수 있다. 고치기 직전 값을 읽어 비교한다.
    const beforeName = db.prepare(`SELECT name FROM categories WHERE id = 1`).get().name;
    db.prepare(`UPDATE categories SET name = '수정된 이름2' WHERE id = 1`).run();

    const log = db.prepare(`SELECT before_json FROM audit_log ORDER BY id DESC LIMIT 1`).get();
    assert.strictEqual(JSON.parse(log.before_json).name, beforeName);
  });

  test('B-3. after_json 에 고친 뒤 값이 있다', () => {
    db.prepare(`UPDATE categories SET name = '수정된 이름3' WHERE id = 1`).run();

    const log = db.prepare(`SELECT after_json FROM audit_log ORDER BY id DESC LIMIT 1`).get();
    const parsed = JSON.parse(log.after_json);
    assert.strictEqual(parsed.name, '수정된 이름3');
  });
});

describe('C. DELETE 캡처', () => {
  test('C-1. 행을 지우면 op 가 DELETE 인 로그가 생긴다', () => {
    db.prepare(`DELETE FROM categories WHERE id = 1`).run();

    const log = db.prepare(`SELECT op FROM audit_log ORDER BY id DESC LIMIT 1`).get();
    assert.strictEqual(log.op, 'DELETE');
  });

  test('C-2. before_json 에 지워진 값이 있다', () => {
    const log = db.prepare(`SELECT before_json FROM audit_log ORDER BY id DESC LIMIT 1`).get();
    const parsed = JSON.parse(log.before_json);
    assert.strictEqual(parsed.name, '수정된 이름3');
  });

  test('C-3. after_json 이 NULL 이다', () => {
    const log = db.prepare(`SELECT after_json FROM audit_log ORDER BY id DESC LIMIT 1`).get();
    assert.strictEqual(log.after_json, null);
  });
});

describe('D. 컨텍스트', () => {
  test('D-1. _audit_context 의 actor 가 로그에 실린다', () => {
    db.prepare(`UPDATE _audit_context SET actor='user', action_id='act-1'`).run();
    db.prepare(`INSERT INTO categories (name, major_type) VALUES ('컨텍스트 테스트', '유형')`).run();

    const log = db.prepare(`SELECT actor FROM audit_log ORDER BY id DESC LIMIT 1`).get();
    assert.strictEqual(log.actor, 'user');
  });

  test('D-2. _audit_context 의 action_id 가 로그에 실린다', () => {
    db.prepare(`INSERT INTO categories (name, major_type) VALUES ('컨텍스트 테스트2', '유형2')`).run();

    const log = db.prepare(`SELECT action_id FROM audit_log ORDER BY id DESC LIMIT 1`).get();
    assert.strictEqual(log.action_id, 'act-1');
  });

  test('D-3. 같은 action_id 로 여러 행을 바꾸면 로그가 같은 action_id 로 묶인다', () => {
    db.prepare(`UPDATE _audit_context SET action_id='act-2'`).run();
    db.prepare(`UPDATE categories SET name = '수정1' WHERE id = 2`).run();
    db.prepare(`UPDATE categories SET name = '수정2' WHERE id = 3`).run();

    const logs = db.prepare(`SELECT action_id FROM audit_log ORDER BY id DESC LIMIT 2`).all();
    assert.ok(logs.every(l => l.action_id === 'act-2'));
  });
});

describe('E. 자기 자신 제외', () => {
  test('E-1. audit_log 에 직접 INSERT 해도 새 로그가 더 생기지 않는다 (무한 루프 방지)', () => {
    const initialCount = db.prepare(`SELECT COUNT(*) as count FROM audit_log`).get().count;
    
    // audit_log에 직접 삽입
    db.prepare(`INSERT INTO audit_log (ts, actor, action_id, op, table_name) VALUES ('2026-01-01', 'test', 'test-id', 'INSERT', 'audit_log')`).run();
    
    const finalCount = db.prepare(`SELECT COUNT(*) as count FROM audit_log`).get().count;
    // 직접 넣은 한 줄만 늘어야 한다. 트리거가 audit_log 를 감시하면 그 삽입이
    // 다시 로그를 만들어 두 줄 이상 늘거나 무한 루프가 된다.
    assert.strictEqual(finalCount, initialCount + 1);
  });
});
