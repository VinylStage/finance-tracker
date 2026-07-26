process.env.TZ = 'Asia/Seoul';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { localYMD, localYearMonth } = require('../src/utils/date.js');

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

// FND-20(감사): installments.js가 SQL의 strftime(...,'now')(UTC)로 현재 연/월을
// 구해서 KST 자정~9시 사이엔 remaining_months/billed_months가 1개월 어긋났다.
// localYMD와 동일한 방식(로컬 Date getter)으로 계산해 SQL에 바인딩하도록
// 고쳤다 — 여기서는 그 계산 자체가 경계에서 올바른지 확인한다.
describe('localYearMonth', () => {
  test('2026-04-01 00:00 KST (자정, 새 달 시작)', () => {
    const [y, m] = localYearMonth(new Date('2026-03-31T15:00:00.000Z'));
    assert.strictEqual(y, 2026);
    assert.strictEqual(m, 4);
  });

  test('2026-04-01 08:59 KST (버그 재현 구간의 끝 — UTC로는 아직 3/31 23:59)', () => {
    const [y, m] = localYearMonth(new Date('2026-03-31T23:59:00.000Z'));
    assert.strictEqual(y, 2026);
    assert.strictEqual(m, 4);
  });

  test('2026-04-01 09:00 KST (버그 경계 직후 — UTC로도 이미 4/1 00:00)', () => {
    const [y, m] = localYearMonth(new Date('2026-04-01T00:00:00.000Z'));
    assert.strictEqual(y, 2026);
    assert.strictEqual(m, 4);
  });

  test('2027-01-01 08:59 KST (연 경계, UTC로는 아직 2026년)', () => {
    const [y, m] = localYearMonth(new Date('2026-12-31T23:59:00.000Z'));
    assert.strictEqual(y, 2027);
    assert.strictEqual(m, 1);
  });
});