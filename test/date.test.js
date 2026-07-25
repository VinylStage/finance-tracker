process.env.TZ = 'Asia/Seoul';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { localYMD } = require('../src/utils/date.js');

describe('localYMD', () => {
  test('2026-03-15 00:00 KST (자정)', () => {
    const result = localYMD(new Date('2026-03-14T15:00:00.000Z'));
    assert.strictEqual(result, '2026-03-15');
  });

  test('2026-03-15 08:59 KST (버그 재현 구간의 끝)', () => {
    const result = localYMD(new Date('2026-03-14T23:59:00.000Z'));
    assert.strictEqual(result, '2026-03-15');
  });

  test('2026-03-15 09:00 KST (버그 경계 직후)', () => {
    const result = localYMD(new Date('2026-03-15T00:00:00.000Z'));
    assert.strictEqual(result, '2026-03-15');
  });

  test('2026-04-01 08:59 KST (월 경계, 원래 버그가 전달로 밀리던 지점)', () => {
    const result = localYMD(new Date('2026-03-31T23:59:00.000Z'));
    assert.strictEqual(result, '2026-04-01');
  });
});