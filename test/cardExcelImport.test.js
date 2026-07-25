const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const XLSX = require('xlsx');
const { parseCardExcel, detectCardCompany } = require('../src/services/cardExcelImport.js');

// ref/ 는 실제 개인 거래 내역이 담긴 샘플이라 .gitignore 대상이다(CI 체크아웃본엔 없음).
// 로컬 개발 환경에 있을 때만 실행하고, 없으면(CI 등) skip 처리한다.
const HAS_SAMPLES = fs.existsSync('./ref/ref-card-history/농협카드이용내역.xlsx');

function makeWorkbook(rows, sheetName = 'Sheet1') {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('cardExcelImport', () => {
  // 1. 정상 입력 — 실제 샘플 파일로 검증
  test('nonghyup sample file', { skip: !HAS_SAMPLES && '로컬 전용 샘플(ref/) 없음 — .gitignore 대상' }, () => {
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

  test('hana sample file', { skip: !HAS_SAMPLES && '로컬 전용 샘플(ref/) 없음 — .gitignore 대상' }, () => {
    const buffer = fs.readFileSync('./ref/ref-card-history/하나카드이용내역01.xls');
    const company = detectCardCompany('./ref/ref-card-history/하나카드이용내역01.xls');
    assert.strictEqual(company, 'hana');
    const result = parseCardExcel('hana', buffer);
    assert.strictEqual(result.length, 44);
  });

  test('hyundai sample file', { skip: !HAS_SAMPLES && '로컬 전용 샘플(ref/) 없음 — .gitignore 대상' }, () => {
    const buffer = fs.readFileSync('./ref/ref-card-history/현대카드명세서01.xls');
    const company = detectCardCompany('./ref/ref-card-history/현대카드명세서01.xls');
    assert.strictEqual(company, 'hyundai');
    const result = parseCardExcel('hyundai', buffer);
    assert.strictEqual(result.length, 9);
  });

  // #92(다중통화 후속): 해외결제 건도 카드사가 이미 KRW로 환산해 명세서에 찍어주므로,
  // 원 통화(USD)는 별도 구조화 없이 가맹점명에 참고용으로만 남기고 KRW 금액만 정확히
  // 추출하면 된다는 게 확인된 요구사항 — 그 추출이 실제로 맞는지 실 샘플로 검증한다.
  test('hyundai 해외결제(USD) 건의 KRW 환산 금액 추출 검증', { skip: !HAS_SAMPLES && '로컬 전용 샘플(ref/) 없음 — .gitignore 대상' }, () => {
    const buffer = fs.readFileSync('./ref/ref-card-history/현대카드명세서05.xls');
    const result = parseCardExcel('hyundai', buffer);
    const usdRows = result.filter(r => r.merchant.includes('USD'));
    assert.deepStrictEqual(
      usdRows.map(r => ({ merchant: r.merchant, amount: r.amount })),
      [
        { merchant: 'VSA_BREEZE-APP.COM,USD:2.00', amount: 3086 },
        { merchant: 'VSA_BREEZE-APP.COM,USD:14.99', amount: 22964 },
        { merchant: 'CLAUDE.AI SUBSCRIPTI,USD:22.00', amount: 33712 },
        { merchant: 'PAYPAL *EMTG,USD:111.21', amount: 168111 },
        { merchant: 'VSA_BREEZE-APP.COM,USD:29.99', amount: 45341 },
      ]
    );
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