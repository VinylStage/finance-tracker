const { test, describe, before } = require('node:test');
const assert = require('node:assert');

let recordExport, readExport, formatSince, EXPORT_KINDS, withObjectParticle;
const store = new Map();

before(async () => {
  globalThis.window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
    },
  };
  ({ recordExport, readExport, formatSince, EXPORT_KINDS, withObjectParticle } = await import('../client/src/lib/backupStatus.js'));
});

describe('backupStatus', () => {
  const NOW = Date.parse('2026-07-27T12:00:00.000Z');

  describe('formatSince', () => {
    test('0초 전', () => {
      const result = formatSince('2026-07-27T12:00:00.000Z', NOW);
      assert.strictEqual(result, '방금');
    });

    test('29초 전', () => {
      const result = formatSince('2026-07-27T11:59:31.000Z', NOW);
      assert.strictEqual(result, '방금');
    });

    test('1분 전', () => {
      const result = formatSince('2026-07-27T11:59:00.000Z', NOW);
      assert.strictEqual(result, '1분 전');
    });

    test('59분 전', () => {
      const result = formatSince('2026-07-27T11:01:00.000Z', NOW);
      assert.strictEqual(result, '59분 전');
    });

    test('60분 전', () => {
      const result = formatSince('2026-07-27T11:00:00.000Z', NOW);
      assert.strictEqual(result, '1시간 전');
    });

    test('23시간 전', () => {
      const result = formatSince('2026-07-26T13:00:00.000Z', NOW);
      assert.strictEqual(result, '23시간 전');
    });

    test('24시간 전', () => {
      const result = formatSince('2026-07-26T12:00:00.000Z', NOW);
      assert.strictEqual(result, '1일 전');
    });

    test('7일 전', () => {
      const result = formatSince('2026-07-20T12:00:00.000Z', NOW);
      assert.strictEqual(result, '7일 전');
    });

    test('8일 전', () => {
      const result = formatSince('2026-07-19T12:00:00.000Z', NOW);
      assert.strictEqual(result, '2026-07-19');
    });

    test('미래', () => {
      const result = formatSince('2026-07-27T13:00:00.000Z', NOW);
      assert.strictEqual(result, '방금');
    });

    test('null 입력', () => {
      const result = formatSince(null, NOW);
      assert.strictEqual(result, null);
    });

    test('undefined 입력', () => {
      const result = formatSince(undefined, NOW);
      assert.strictEqual(result, null);
    });

    test('빈 문자열 입력', () => {
      const result = formatSince('', NOW);
      assert.strictEqual(result, null);
    });

    test('잘못된 날짜 문자열 입력', () => {
      const result = formatSince('없는날짜', NOW);
      assert.strictEqual(result, null);
    });
  });

  describe('recordExport / readExport', () => {
    test('저장한 적 없는 종류를 읽으면 null', () => {
      const result = readExport('transactions');
      assert.strictEqual(result, null);
    });

    test('정상 저장 및 읽기', () => {
      const iso = '2026-07-27T12:00:00.000Z';
      const success = recordExport('transactions', iso);
      assert.strictEqual(success, true);
      const result = readExport('transactions');
      assert.strictEqual(result, iso);
    });

    test('알 수 없는 종류는 저장하지 않음', () => {
      const success = recordExport('unknown', '2026-07-27T12:00:00.000Z');
      assert.strictEqual(success, false);
      const result = readExport('unknown');
      assert.strictEqual(result, null);
    });

    test('종류별로 값이 분리됨', () => {
      recordExport('transactions', '2026-07-27T12:00:00.000Z');
      recordExport('settings', '2026-07-27T13:00:00.000Z');

      assert.strictEqual(readExport('transactions'), '2026-07-27T12:00:00.000Z');
      assert.strictEqual(readExport('settings'), '2026-07-27T13:00:00.000Z');
    });

    test('같은 종류에 다시 저장하면 덮어써짐', () => {
      recordExport('transactions', '2026-07-27T12:00:00.000Z');
      recordExport('transactions', '2026-07-27T13:00:00.000Z');

      assert.strictEqual(readExport('transactions'), '2026-07-27T13:00:00.000Z');
    });
  });

  describe('EXPORT_KINDS', () => {
    test('키가 정확히 transactions, settings, data 세 개인지 확인', () => {
      assert.deepStrictEqual(Object.keys(EXPORT_KINDS).sort(), ['data', 'settings', 'transactions']);
    });
  });

  describe('withObjectParticle', () => {
    test('받침 있는 말에는 을', () => {
      assert.strictEqual(withObjectParticle('거래내역'), '거래내역을');
      assert.strictEqual(withObjectParticle('설정'), '설정을');
      assert.strictEqual(withObjectParticle('예산'), '예산을');
    });

    test('받침 없는 말에는 를', () => {
      assert.strictEqual(withObjectParticle('전체 데이터'), '전체 데이터를');
      assert.strictEqual(withObjectParticle('카테고리'), '카테고리를');
      assert.strictEqual(withObjectParticle('가계부'), '가계부를');
    });

    test('한글이 아닌 끝 글자는 를', () => {
      assert.strictEqual(withObjectParticle('CSV'), 'CSV를');
      assert.strictEqual(withObjectParticle('2026'), '2026를');
    });

    test('빈 값과 null', () => {
      assert.strictEqual(withObjectParticle(''), '');
      assert.strictEqual(withObjectParticle(null), '');
      assert.strictEqual(withObjectParticle(undefined), '');
    });
  });
});
