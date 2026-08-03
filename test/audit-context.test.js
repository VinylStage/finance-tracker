'use strict';
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  auditContext, getAuditContext, runAs, setAuditLabel, resetAuditContext,
} = require('../src/utils/auditContext');

// 가짜 요청/응답. auditContext 는 res 의 finish 만 쓴다.
function fakeReqRes() {
  const handlers = {};
  const res = { on: (ev, fn) => { handlers[ev] = fn; } };
  return { req: {}, res, finish: () => handlers.finish && handlers.finish() };
}

beforeEach(() => resetAuditContext());

describe('A. 요청 컨텍스트', () => {
  test('A-1. 요청이 시작되면 actor 는 user 다', () => {
    const { req, res } = fakeReqRes();
    auditContext(req, res, () => {});
    assert.equal(getAuditContext().actor, 'user');
  });

  test('A-2. 요청마다 action_id 가 새로 발급된다', () => {
    const a = fakeReqRes();
    auditContext(a.req, a.res, () => {});
    const first = getAuditContext().actionId;

    const b = fakeReqRes();
    auditContext(b.req, b.res, () => {});
    const second = getAuditContext().actionId;

    assert.ok(first);
    assert.ok(second);
    assert.notEqual(first, second);
  });

  test('A-3. 같은 요청 안에서는 action_id 가 유지된다', () => {
    // 한 요청이 만든 모든 로그 행이 같은 그룹이어야 실행취소가 한 번에 된다(#297).
    const { req, res } = fakeReqRes();
    auditContext(req, res, () => {});
    const ids = [getAuditContext().actionId, getAuditContext().actionId, getAuditContext().actionId];
    assert.equal(new Set(ids).size, 1);
  });

  test('A-4. next 가 호출된다', () => {
    const { req, res } = fakeReqRes();
    let called = false;
    auditContext(req, res, () => { called = true; });
    assert.equal(called, true);
  });

  test('A-5. 요청이 끝나면 라벨이 다음 요청으로 새지 않는다', () => {
    const a = fakeReqRes();
    auditContext(a.req, a.res, () => {});
    setAuditLabel('할부 완료처리');
    assert.equal(getAuditContext().label, '할부 완료처리');
    a.finish();
    assert.equal(getAuditContext().label, null);
  });
});

describe('B. 요청 밖 경로', () => {
  test('B-1. 컨텍스트가 없어도 실패하지 않고 system 으로 남는다', () => {
    // 스크립트나 마이그레이션에서 쓰기가 일어나도 기록은 남아야 한다. 기본값이
    // 안전한 쪽(system)이라 실행취소 후보에는 오르지 않는다.
    const ctx = getAuditContext();
    assert.equal(ctx.actor, 'system');
    assert.ok(ctx.actionId);
  });
});

describe('C. runAs — 시스템·임포트 경로', () => {
  test('C-1. 블록 안에서만 actor 가 바뀐다', () => {
    const { req, res } = fakeReqRes();
    auditContext(req, res, () => {});
    assert.equal(getAuditContext().actor, 'user');

    runAs('system', () => {
      assert.equal(getAuditContext().actor, 'system');
    });

    assert.equal(getAuditContext().actor, 'user');
  });

  test('C-2. 시스템 작업은 자체 action_id 를 갖는다', () => {
    // 사용자 작업과 한 그룹으로 묶이면 되돌리기가 둘을 같이 되돌린다.
    const { req, res } = fakeReqRes();
    auditContext(req, res, () => {});
    const userAction = getAuditContext().actionId;

    let systemAction;
    runAs('system', () => { systemAction = getAuditContext().actionId; });

    assert.notEqual(userAction, systemAction);
    assert.equal(getAuditContext().actionId, userAction);
  });

  test('C-3. 예외가 나도 이전 컨텍스트로 되돌아온다', () => {
    // 복원이 안 되면 그 뒤 모든 쓰기가 system 으로 찍힌다.
    const { req, res } = fakeReqRes();
    auditContext(req, res, () => {});
    const before = getAuditContext();

    assert.throws(() => {
      runAs('system', () => { throw new Error('boom'); });
    }, /boom/);

    const after = getAuditContext();
    assert.equal(after.actor, before.actor);
    assert.equal(after.actionId, before.actionId);
  });

  test('C-4. 중첩해도 순서대로 복원된다', () => {
    const { req, res } = fakeReqRes();
    auditContext(req, res, () => {});
    runAs('import', () => {
      assert.equal(getAuditContext().actor, 'import');
      runAs('system', () => {
        assert.equal(getAuditContext().actor, 'system');
      });
      assert.equal(getAuditContext().actor, 'import');
    });
    assert.equal(getAuditContext().actor, 'user');
  });

  test('C-5. 반환값을 그대로 돌려준다', () => {
    assert.equal(runAs('import', () => 42), 42);
  });
});

describe('D. 반환 컨텍스트는 복사본이다', () => {
  test('D-1. 밖에서 고쳐도 내부 상태가 안 바뀐다', () => {
    const { req, res } = fakeReqRes();
    auditContext(req, res, () => {});
    const ctx = getAuditContext();
    ctx.actor = 'import';
    assert.equal(getAuditContext().actor, 'user');
  });
});
