'use strict';
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { purgeAuditLog, DEFAULT_RETENTION_DAYS } = require('../src/services/auditRetention');
const { findUndoable } = require('../src/services/undo');

// 감사로그 보존 정책(#367).
//
// **되돌릴 수 있는 것을 지우지 않는다** 가 이 파일의 핵심이다. 정리가 실행취소
// 후보를 지우면 버튼은 그대로 있는데 눌러도 아무 일이 안 일어난다 — 조용히
// 고장난 상태가 제일 나쁘다.
//
// 트리거가 붙은 실제 DB 가 필요하다. audit_log 행을 손으로 넣으면 undo 후보
// 판정이 실제와 달라진다.

let dir, db;

function freshDb() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-retention-'));
  process.env.DB_PATH = path.join(tmp, 'x.db');
  delete require.cache[require.resolve('../src/db/init')];
  return { tmp, live: require('../src/db/init') };
}

// ts 를 직접 밀어 과거 로그를 만든다. 실제로 며칠 기다릴 수는 없다.
function ageRows(actionId, daysAgo) {
  db.prepare(
    `UPDATE audit_log SET ts = datetime('now','localtime', ?) WHERE action_id = ?`
  ).run(`-${daysAgo} days`, actionId);
}

// 사용자 작업 한 묶음을 만든다. 트리거가 audit_log 를 채운다.
function userAction(actionId, label) {
  db.prepare(`UPDATE _audit_context SET actor='user', action_id=?, action_label=? WHERE id=1`)
    .run(actionId, label || null);
  const cat = db.prepare(`SELECT id FROM categories LIMIT 1`).get().id;
  db.prepare(`INSERT INTO transactions (date, amount, category_id, merchant) VALUES (?,?,?,?)`)
    .run('2026-03-01', 10000, cat, label || actionId);
}

const auditCount = () => db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;
const countFor = (actionId) =>
  db.prepare('SELECT COUNT(*) AS n FROM audit_log WHERE action_id = ?').get(actionId).n;

beforeEach(() => {
  const r = freshDb();
  dir = r.tmp;
  db = r.live;
  db.prepare(`DELETE FROM audit_log`).run();
});

afterEach(() => {
  try { db.close(); } catch { /* 이미 닫혔을 수 있다 */ }
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

describe('A. 기간 기준으로 지운다', () => {
  test('A-1. 보존 기간 안의 로그는 남는다', () => {
    userAction('recent-1');
    const before = auditCount();
    assert.ok(before > 0, '트리거가 로그를 안 남겼다');

    const r = purgeAuditLog(db, { days: 180 });

    assert.equal(r.deleted, 0);
    assert.equal(auditCount(), before);
  });

  test('A-2. 기간이 지난 로그는 지운다', () => {
    userAction('old-1');
    userAction('recent-1'); // 최신 후보가 되어 예외를 받는다
    ageRows('old-1', 200);

    const r = purgeAuditLog(db, { days: 180 });

    assert.ok(r.deleted > 0, '오래된 로그가 안 지워졌다');
    assert.equal(countFor('old-1'), 0);
    assert.ok(countFor('recent-1') > 0);
  });

  test('A-3. 경계 — 정확히 기간만큼 지난 건 남긴다', () => {
    userAction('edge-1');
    userAction('recent-1');
    ageRows('edge-1', 180);

    purgeAuditLog(db, { days: 180 });

    assert.ok(countFor('edge-1') > 0, '경계값이 지워졌다');
  });

  test('A-4. 기본값은 180일이다', () => {
    assert.equal(DEFAULT_RETENTION_DAYS, 180);
    userAction('a');
    const r = purgeAuditLog(db);
    assert.equal(r.days, 180);
  });

  test('A-5. 잘못된 days 는 기본값으로 떨어진다', () => {
    userAction('a');
    for (const bad of [0, -1, 1.5, '180', null, undefined]) {
      assert.equal(purgeAuditLog(db, { days: bad }).days, 180, `days=${String(bad)}`);
    }
  });
});

describe('B. 되돌릴 수 있는 것은 지우지 않는다 — 핵심', () => {
  test('B-1. 최근 미취소 그룹은 기간이 지나도 남는다', () => {
    // 오래 앱을 안 켠 사용자다. 마지막 작업이 기간 밖에 있어도 되돌릴 수 있어야 한다.
    userAction('only-one');
    ageRows('only-one', 400);

    const candidateBefore = findUndoable(db);
    assert.ok(candidateBefore, '전제: 되돌릴 후보가 있어야 한다');
    assert.equal(candidateBefore.actionId, 'only-one');

    const r = purgeAuditLog(db, { days: 180 });

    assert.equal(r.keptActionId, 'only-one');
    assert.ok(countFor('only-one') > 0, '되돌릴 수 있는 그룹이 지워졌다');
  });

  test('B-2. 정리 후에도 되돌리기가 실제로 가능하다', () => {
    // 행이 남았는지가 아니라 **되돌리기가 되는지**를 본다. 그룹의 일부만 남으면
    // 행수는 0이 아닌데 역적용이 깨진다.
    userAction('keep-me');
    ageRows('keep-me', 400);

    purgeAuditLog(db, { days: 180 });

    const after = findUndoable(db);
    assert.ok(after, '정리 후 되돌리기가 불가능해졌다');
    assert.equal(after.actionId, 'keep-me');
    assert.equal(after.entries.length, 1);
  });

  test('B-3. 예외는 최신 후보 하나뿐이다 — 오래된 다른 그룹은 지운다', () => {
    userAction('old-group');
    ageRows('old-group', 300);
    userAction('newer-group');
    ageRows('newer-group', 250);

    const candidate = findUndoable(db);
    assert.equal(candidate.actionId, 'newer-group', '전제: 최신 그룹이 후보여야 한다');

    purgeAuditLog(db, { days: 180 });

    assert.equal(countFor('old-group'), 0, '후보가 아닌 오래된 그룹이 남았다');
    assert.ok(countFor('newer-group') > 0);
  });
});

describe('C. 안전하게 실패한다', () => {
  test('C-1. audit_log 가 없는 DB 에서도 던지지 않는다', () => {
    // 017 이전 상태다. 기동 경로에서 부르므로 던지면 서버가 안 뜬다.
    const Database = require('better-sqlite3');
    const bare = new Database(':memory:');
    try {
      const r = purgeAuditLog(bare);
      assert.equal(r.ran, false);
      assert.equal(r.deleted, 0);
    } finally {
      bare.close();
    }
  });

  test('C-2. 지울 게 없으면 아무것도 안 지운다', () => {
    const r = purgeAuditLog(db, { days: 180 });
    assert.equal(r.deleted, 0);
    assert.equal(r.ran, true);
  });

  test('C-3. audit_log 외 테이블을 건드리지 않는다', () => {
    userAction('old-1');
    userAction('recent-1');
    ageRows('old-1', 400);

    const txBefore = db.prepare('SELECT COUNT(*) AS n FROM transactions').get().n;
    const catBefore = db.prepare('SELECT COUNT(*) AS n FROM categories').get().n;

    purgeAuditLog(db, { days: 180 });

    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM transactions').get().n, txBefore,
      '정리가 거래를 건드렸다');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM categories').get().n, catBefore);
  });
});
