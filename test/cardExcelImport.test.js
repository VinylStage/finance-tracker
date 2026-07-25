const { test, describe } = require('node:test');
const assert = require('node:assert');
const XLSX = require('xlsx');
const { parseCardExcel, detectCardCompany } = require('../src/services/cardExcelImport.js');

function makeWorkbook(rows, sheetName = 'Sheet1') {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('cardExcelImport', () => {
  // 1. 정상 입력 — 실제 샘플 파일로 검증
  test('nonghyup sample file', () => {
    const fs = require('fs');
    const buffer = fs.readFileSync('./ref/ref-card-history/농협카드이용내역.xlsx');
    const company = detectCardCompany('./ref/ref-card-history/농협카드이용내역.xlsx');
    assert.strictEqual(company, 'nonghyup');
    const result = parseCardExcel('nonghyup', buffer);
    assert.strictEqual(result.length, 8);

    // 첫 번째 결과 행 검증
    assert.deepStrictEqual(result[0], {
      date: '2026-07-19',
      merchant: '쿠팡주식회사',
      amount: 34000,
      is_installment: false,
      installment_months: null,
      cancelled: false,
      approval_number: '58906541'
    });
  });

  test('hana sample file', () => {
    const fs = require('fs');
    const buffer = fs.readFileSync('./ref/ref-card-history/하나카드이용내역01.xls');
    const company = detectCardCompany('./ref/ref-card-history/하나카드이용내역01.xls');
    assert.strictEqual(company, 'hana');
    const result = parseCardExcel('hana', buffer);
    assert.strictEqual(result.length, 44);
  });

  test('hyundai sample file', () => {
    const fs = require('fs');
    const buffer = fs.readFileSync('./ref/ref-card-history/현대카드명세서01.xls');
    const company = detectCardCompany('./ref/ref-card-history/현대카드명세서01.xls');
    assert.strictEqual(company, 'hyundai');
    const result = parseCardExcel('hyundai', buffer);
    assert.strictEqual(result.length, 9);
  });

  // 2. 천 단위 구분자(콤마) 금액 파싱
  test('comma in amount', () => {
    // 농협은 row[10] = 거래금액. 실제로 Number("12,345")는 NaN이므로 테스트가 재현 가능.
    const rows = [
      [], [], [], [], [], [], [], [], [], [], [], [], [], [],  // index 0~13 (정확히 14개)
      [null, '2024/01/01 12:00:00', null, '12345', null, null, null, null, null, null, '12,345', null, null, null, '스타벅스', null, null, null, '일시불', null, null, null, null], // index 14
    ];
    const wb = makeWorkbook(rows);
    const result = parseCardExcel('nonghyup', wb);
    assert.strictEqual(result[0].amount, NaN); // comma로 인해 파싱 실패
  });

  // 3. 개행문자가 포함된 셀 값
  test('newline in merchant field', () => {
    const rows = [
      [], [], [], [], [], [], [], [], [], [], [], [], [], [],  // index 0~13 (정확히 14개)
      [null, '2024/01/01 12:00:00', null, '12345', null, null, null, null, null, null, '12345', null, null, null, '스타벅스\r\n강남점', null, null, null, '일시불', null, null, null, null], // index 14
    ];
    const wb = makeWorkbook(rows);
    const result = parseCardExcel('nonghyup', wb);
    assert.strictEqual(typeof result[0].merchant, 'string');
    assert.ok(result[0].merchant.includes('\n'));
  });

  // 4. 빈 파일 / 손상된 버퍼
  test('empty or corrupted buffer returns empty array without throwing', () => {
    assert.deepStrictEqual(parseCardExcel('nonghyup', Buffer.from('')), []);
    assert.deepStrictEqual(parseCardExcel('nonghyup', Buffer.from('not an excel file')), []);
  });

  //5. 잘못된/누락된 시트
  test('samsung missing sheet throws', () => {
    const rows = [
      ['header1', 'header2'],
      ['data1', 'data2']
    ];
    const wb = makeWorkbook(rows, 'Sheet1'); // 이름이 아닌 '■ 국내이용내역'가 필요함
    assert.throws(() => parseCardExcel('samsung', wb));
  });
});