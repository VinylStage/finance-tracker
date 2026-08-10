'use strict';
const { test, describe, beforeEach, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const { findUndoable, applyUndo } = require('../src/services/undo');

// 실행취소는 조용히 틀리면 데이터가 어긋난 채 남는다. 그래서 "되돌렸다" 뿐 아니라
// **되돌리지 말아야 할 때 거부하는지**가 같은 비중으로 중요하다.

let dir, db;

function fresh() {
  if (db) db.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-undo-'));
  db = new Database(path.join(dir, 'test.db'));
  // audit_log 는 **소유한 마이그레이션이 만든다.** 손으로 적은 사본은 010 이
  // 컬럼을 늘려도 따라가지 않아, 실행취소가 실제 스키마에서 도는지를 더 이상
  // 검증하지 못하게 된다.
  require('../migrations/010-add-audit-log').up(db);
  db.exec(`
    CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL, major_type TEXT);
  `);
}

// 로그 한 줄을 넣는다. 트리거를 쓰지 않고 상황을 직접 만든다.
function log(over = {}) {
  const e = {
    ts: '2026-08-04 08:00:00', actor: 'user', action_id: 'act-1', action_label: null,
    op: 'UPDATE', table_name: 'categories', row_id: 1,
    before_json: null, after_json: null, undone_at: null, undo_of: null, ...over,
  };
  db.prepare(`
    INSERT INTO audit_log (ts, actor, action_id, action_label, op, table_name, row_id,
                           before_json, after_json, undone_at, undo_of)
    VALUES (@ts, @actor, @action_id, @action_label, @op, @table_name, @row_id,
            @before_json, @after_json, @undone_at, @undo_of)
  `).run(e);
}

const cat = (id) => db.prepare('SELECT * FROM categories WHERE id=?').get(id);
const catCount = () => db.prepare('SELECT COUNT(*) c FROM categories').get().c;

beforeEach(() => fresh());
after(() => { if (db) db.close(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

describe('A. 후보 찾기', () => {
  test('A-1. 사용자 작업 그룹을 찾는다', () => {
    log({ op: 'INSERT', after_json: '{"id":1,"name":"가"}' });
    assert.equal(findUndoable(db).actionId, 'act-1');
  });

  test('A-2. actor 가 system 인 그룹은 후보가 아니다', () => {
    // GET 마다 도는 스윕(#205)이 "가장 최근 작업" 이 되기 쉽다.
    log({ actor: 'system', op: 'INSERT', after_json: '{"id":1}' });
    assert.equal(findUndoable(db), null);
  });

  test('A-3. actor 가 import 인 그룹은 후보가 아니다', () => {
    log({ actor: 'import', op: 'INSERT', after_json: '{"id":1}' });
    assert.equal(findUndoable(db), null);
  });

  test('A-4. 이미 되돌린 그룹은 후보가 아니다', () => {
    log({ op: 'INSERT', after_json: '{"id":1}', undone_at: '2026-08-04 09:00:00' });
    assert.equal(findUndoable(db), null);
  });

  test('A-5. 되돌리기가 만든 그룹은 후보가 아니다', () => {
    // 이게 다시 후보가 되면 반복 클릭 시 원상복구가 무한히 오간다(사실상 redo).
    log({ op: 'INSERT', after_json: '{"id":1}', undo_of: 'act-0' });
    assert.equal(findUndoable(db), null);
  });

  test('A-6. RESTORE 가 섞인 그룹은 후보가 아니다', () => {
    log({ op: 'INSERT', after_json: '{"id":1}' });
    log({ op: 'RESTORE' });
    assert.equal(findUndoable(db), null);
  });

  test('A-7. 후보가 없으면 null 이다', () => {
    assert.equal(findUndoable(db), null);
  });

  test('A-8. 여러 사용자 그룹이 있으면 가장 최근 것을 고른다', () => {
    log({ action_id: 'act-old', op: 'INSERT', after_json: '{"id":1}' });
    log({ action_id: 'act-new', op: 'INSERT', after_json: '{"id":2}' });
    assert.equal(findUndoable(db).actionId, 'act-new');
  });

  test('A-9. 한 그룹의 여러 행을 함께 돌려준다', () => {
    // #269 재생성처럼 한 동작이 여러 행을 바꾸면 하나로 묶여야 한다.
    log({ op: 'INSERT', after_json: '{"id":1}' });
    log({ op: 'INSERT', row_id: 2, after_json: '{"id":2}' });
    assert.equal(findUndoable(db).entries.length, 2);
  });
});

describe('B. 역적용', () => {
  test('B-1. INSERT 를 되돌리면 그 행이 사라진다', () => {
    db.prepare("INSERT INTO categories (id,name,major_type) VALUES (1,'가','변동필수')").run();
    log({ op: 'INSERT', after_json: JSON.stringify({ id: 1, name: '가', major_type: '변동필수' }) });

    assert.equal(applyUndo(db, 'act-1').ok, true);
    assert.equal(cat(1), undefined);
  });

  test('B-2. DELETE 를 되돌리면 원래 id 로 살아난다', () => {
    // 다른 테이블이 그 id 를 참조하므로 새 id 로 넣으면 참조가 끊긴다.
    log({ op: 'DELETE', row_id: 7, before_json: JSON.stringify({ id: 7, name: '나', major_type: '고정지출' }) });

    assert.equal(applyUndo(db, 'act-1').ok, true);
    assert.equal(cat(7).name, '나');
  });

  test('B-3. UPDATE 를 되돌리면 이전 값으로 돌아간다', () => {
    db.prepare("INSERT INTO categories (id,name,major_type) VALUES (1,'수정후','변동필수')").run();
    log({
      op: 'UPDATE',
      before_json: JSON.stringify({ id: 1, name: '수정전', major_type: '변동필수' }),
      after_json: JSON.stringify({ id: 1, name: '수정후', major_type: '변동필수' }),
    });

    applyUndo(db, 'act-1');
    assert.equal(cat(1).name, '수정전');
  });

  test('B-4. 성공하면 undone_at 이 채워진다', () => {
    db.prepare("INSERT INTO categories (id,name) VALUES (1,'가')").run();
    log({ op: 'INSERT', after_json: JSON.stringify({ id: 1, name: '가' }) });

    applyUndo(db, 'act-1');
    assert.ok(db.prepare("SELECT undone_at FROM audit_log WHERE action_id='act-1'").get().undone_at);
  });

  test('B-5. 되돌린 그룹은 다시 후보가 되지 않는다', () => {
    db.prepare("INSERT INTO categories (id,name) VALUES (1,'가')").run();
    log({ op: 'INSERT', after_json: JSON.stringify({ id: 1, name: '가' }) });

    applyUndo(db, 'act-1');
    assert.equal(findUndoable(db), null);
  });

  test('B-6. reverted 가 되돌린 행 수와 같다', () => {
    db.prepare("INSERT INTO categories (id,name) VALUES (1,'가')").run();
    db.prepare("INSERT INTO categories (id,name) VALUES (2,'나')").run();
    log({ op: 'INSERT', row_id: 1, after_json: JSON.stringify({ id: 1, name: '가' }) });
    log({ op: 'INSERT', row_id: 2, after_json: JSON.stringify({ id: 2, name: '나' }) });

    assert.equal(applyUndo(db, 'act-1').reverted, 2);
  });

  test('B-7. 삭제와 삽입이 섞인 그룹도 한 번에 되돌아간다', () => {
    // #269 재생성 시나리오 — 지우고 다시 만든 것을 역순으로 되돌린다.
    db.prepare("INSERT INTO categories (id,name) VALUES (5,'새로만든것')").run();
    log({ op: 'DELETE', row_id: 3, before_json: JSON.stringify({ id: 3, name: '지워진것' }) });
    log({ op: 'INSERT', row_id: 5, after_json: JSON.stringify({ id: 5, name: '새로만든것' }) });

    assert.equal(applyUndo(db, 'act-1').ok, true);
    assert.equal(cat(3).name, '지워진것');
    assert.equal(cat(5), undefined);
  });
});

describe('C. 거부', () => {
  test('C-1. 없는 action_id 면 거부한다', () => {
    const r = applyUndo(db, 'act-없음');
    assert.equal(r.ok, false);
    assert.ok(r.reason.length > 0);
  });

  test('C-2. 그 사이 값이 또 바뀌었으면 거부한다', () => {
    // 그대로 되돌리면 그 변경을 조용히 덮어쓴다. 조용히 덮어쓰는 게 최악이다.
    db.prepare("INSERT INTO categories (id,name) VALUES (1,'제3자가또바꿈')").run();
    log({
      op: 'UPDATE',
      before_json: JSON.stringify({ id: 1, name: '수정전' }),
      after_json: JSON.stringify({ id: 1, name: '수정후' }),
    });

    assert.equal(applyUndo(db, 'act-1').ok, false);
  });

  test('C-3. 거부되면 데이터가 하나도 안 바뀐다', () => {
    db.prepare("INSERT INTO categories (id,name) VALUES (1,'제3자가또바꿈')").run();
    log({
      op: 'UPDATE',
      before_json: JSON.stringify({ id: 1, name: '수정전' }),
      after_json: JSON.stringify({ id: 1, name: '수정후' }),
    });

    applyUndo(db, 'act-1');
    assert.equal(cat(1).name, '제3자가또바꿈');
  });

  test('C-4. 거부되면 undone_at 이 찍히지 않는다', () => {
    db.prepare("INSERT INTO categories (id,name) VALUES (1,'다른값')").run();
    log({
      op: 'UPDATE',
      before_json: JSON.stringify({ id: 1, name: '수정전' }),
      after_json: JSON.stringify({ id: 1, name: '수정후' }),
    });

    applyUndo(db, 'act-1');
    assert.equal(db.prepare("SELECT undone_at FROM audit_log WHERE action_id='act-1'").get().undone_at, null);
  });

  test('C-5. 되살릴 자리에 다른 행이 있으면 거부한다', () => {
    // 그 사이 id 가 재사용됐다는 뜻이다. 덮어쓰면 남의 기록이 사라진다.
    db.prepare("INSERT INTO categories (id,name) VALUES (7,'그새들어온것')").run();
    log({ op: 'DELETE', row_id: 7, before_json: JSON.stringify({ id: 7, name: '지워진것' }) });

    assert.equal(applyUndo(db, 'act-1').ok, false);
    assert.equal(cat(7).name, '그새들어온것');
  });

  test('C-6. 시스템 작업은 직접 지정해도 거부한다', () => {
    db.prepare("INSERT INTO categories (id,name) VALUES (1,'가')").run();
    log({ actor: 'system', op: 'INSERT', after_json: JSON.stringify({ id: 1, name: '가' }) });

    assert.equal(applyUndo(db, 'act-1').ok, false);
    assert.equal(catCount(), 1);
  });

  test('C-7. 이미 되돌린 그룹을 또 되돌리면 거부한다', () => {
    db.prepare("INSERT INTO categories (id,name) VALUES (1,'가')").run();
    log({ op: 'INSERT', after_json: JSON.stringify({ id: 1, name: '가' }), undone_at: '2026-08-04 09:00:00' });

    assert.equal(applyUndo(db, 'act-1').ok, false);
  });
});
