const { test, describe } = require('node:test');
const assert = require('node:assert');
const { serverError, errMsg } = require('../src/utils/errors.js');

describe('errMsg (#105)', () => {
  test('일반 Error는 message를 그대로 반환', () => {
    assert.strictEqual(errMsg(new Error('boom')), 'boom');
  });

  test('message 없는 값도 throw하지 않고 빈 문자열 반환', () => {
    assert.strictEqual(errMsg(null), '');
    assert.strictEqual(errMsg(undefined), '');
    assert.strictEqual(errMsg('plain string'), '');
    assert.strictEqual(errMsg({}), '');
  });
});

describe('serverError headersSent 가드 (#105)', () => {
  function mockRes(headersSent) {
    const calls = { status: [], json: [] };
    const res = {
      headersSent,
      status(code) { calls.status.push(code); return res; },
      json(body) { calls.json.push(body); return res; },
    };
    return { res, calls };
  }

  test('응답이 이미 시작됐으면 status/json을 호출하지 않음', () => {
    const { res, calls } = mockRes(true);
    serverError(res, new Error('boom'), 'test');
    assert.deepStrictEqual(calls.status, []);
    assert.deepStrictEqual(calls.json, []);
  });

  test('응답 전이면 평소대로 500을 응답', () => {
    const { res, calls } = mockRes(false);
    serverError(res, new Error('boom'), 'test');
    assert.deepStrictEqual(calls.status, [500]);
    assert.deepStrictEqual(calls.json, [{ error: '처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.' }]);
  });
});
