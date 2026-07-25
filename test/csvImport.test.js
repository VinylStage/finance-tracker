const { test, describe } = require('node:test');
const assert = require('node:assert');
const { parseCardCsv } = require('../src/services/csvImport.js');

const SHINHAN_CSV = [
  '거래일자,가맹점,금액',
  '2026.01.15,스타벅스 강남점,4500',
  '2026/01/16,쿠팡,12345',
].join('\n');

describe('csvImport (신한 전용, #88)', () => {
  test('정상 CSV 파싱 - 날짜/금액 정규화', () => {
    const result = parseCardCsv('shinhan', SHINHAN_CSV);
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result[0], { date: '2026-01-15', merchant: '스타벅스 강남점', amount: 4500, memo: '', error: null });
    assert.deepStrictEqual(result[1], { date: '2026-01-16', merchant: '쿠팡', amount: 12345, memo: '', error: null });
  });

  test('필수 컬럼 누락시 에러', () => {
    const badCsv = '날짜,가맹점,금액\n2026-01-15,쿠팡,1000';
    assert.throws(() => parseCardCsv('shinhan', badCsv), /Required columns/);
  });

  test('잘못된 날짜/금액은 error 플래그로 표시', () => {
    const csv = '거래일자,가맹점,금액\n2026-99-99,쿠팡,abc';
    const result = parseCardCsv('shinhan', csv);
    assert.strictEqual(result[0].error, 'Invalid data');
  });

  // #88: 삼성/하나/현대는 실전 검증된 엑셀 경로로 통일하고 CSV 스펙에서 제거했다.
  // 실수로 다시 추가되거나 되돌려지면 이 테스트가 감지한다.
  test('하나/삼성/현대는 CSV 경로에서 지원하지 않음 (엑셀 경로로 통일, #88)', () => {
    for (const company of ['hana', 'samsung', 'hyundai']) {
      assert.throws(() => parseCardCsv(company, SHINHAN_CSV), /Unsupported card company/, `${company}는 CSV 경로에서 거부돼야 함`);
    }
  });

  test('미지원 카드사는 에러', () => {
    assert.throws(() => parseCardCsv('kookmin', SHINHAN_CSV), /Unsupported card company/);
  });
});
