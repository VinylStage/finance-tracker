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
    assert.throws(() => parseCardCsv('shinhan', badCsv), /필요한 열을 찾지 못했습니다/);
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
      assert.throws(() => parseCardCsv(company, SHINHAN_CSV), /신한카드만 지원합니다/, `${company}는 CSV 경로에서 거부돼야 함`);
    }
  });

  test('미지원 카드사는 에러', () => {
    assert.throws(() => parseCardCsv('kookmin', SHINHAN_CSV), /신한카드만 지원합니다/);
  });
});

// 파서 자체(따옴표·CRLF·괄호 음수)가 비어 있었다. 위 테스트들은 쉼표도 따옴표도
// 없는 단순한 CSV 만 넣는다. 실제 카드사 파일은 가맹점 이름에 쉼표가 들어가고,
// 윈도우에서 내려받으면 CRLF 이며, 취소 거래를 괄호로 적는 곳이 있다.
describe('csvImport 파서', () => {
  test('가맹점 이름의 쉼표는 따옴표로 감싸면 한 필드다', () => {
    const csv = [
      '거래일자,가맹점,금액',
      '2026.01.15,"스타벅스 강남점, 2층",4500',
    ].join('\n');
    const rows = parseCardCsv('shinhan', csv);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].merchant, '스타벅스 강남점, 2층',
      '따옴표 안의 쉼표에서 필드가 갈렸다');
    assert.strictEqual(rows[0].amount, 4500);
  });

  test('이스케이프된 따옴표는 한 글자로 들어간다', () => {
    const csv = [
      '거래일자,가맹점,금액',
      '2026.01.15,"카페 ""온"" 본점",3000',
    ].join('\n');
    const rows = parseCardCsv('shinhan', csv);
    assert.strictEqual(rows[0].merchant, '카페 "온" 본점');
  });

  test('CRLF 개행에서 마지막 필드가 오염되지 않는다', () => {
    // 금액이 마지막 칸이면 parseAmount 가 숫자 외 문자를 걷어내서 \r 이 붙어도
    // 복구된다. 그래서 CR 처리가 사라져도 금액으로는 드러나지 않는다.
    // 컬럼 순서를 바꿔 **문자열 필드가 마지막에 오게** 해야 실제로 잡힌다.
    const csv = '거래일자,금액,가맹점\r\n2026.01.15,32000,이마트\r\n';
    const rows = parseCardCsv('shinhan', csv);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].amount, 32000);
    assert.strictEqual(rows[0].merchant, '이마트', '\\r 이 가맹점 이름 끝에 붙었다');
  });

  test('마지막 줄에 개행이 없어도 읽는다', () => {
    const csv = '거래일자,가맹점,금액\n2026.01.15,이마트,32000';
    const rows = parseCardCsv('shinhan', csv);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].merchant, '이마트');
  });

  test('괄호로 감싼 금액은 음수다', () => {
    const csv = [
      '거래일자,가맹점,금액',
      '2026.01.15,취소건,(15000)',
    ].join('\n');
    const rows = parseCardCsv('shinhan', csv);
    assert.strictEqual(rows[0].amount, -15000, '취소 거래가 양수로 들어가면 지출이 두 배가 된다');
  });

  test('천단위 쉼표가 있는 금액을 읽는다', () => {
    const csv = [
      '거래일자,가맹점,금액',
      '2026.01.15,백화점,"1,234,500"',
    ].join('\n');
    const rows = parseCardCsv('shinhan', csv);
    assert.strictEqual(rows[0].amount, 1234500);
  });

  test('YYYYMMDD 형식 날짜를 읽는다', () => {
    const csv = ['거래일자,가맹점,금액', '20260115,편의점,3500'].join('\n');
    const rows = parseCardCsv('shinhan', csv);
    assert.strictEqual(rows[0].date, '2026-01-15');
  });

  test('빈 줄은 건너뛴다', () => {
    const csv = ['거래일자,가맹점,금액', '', '2026.01.15,이마트,32000', ''].join('\n');
    const rows = parseCardCsv('shinhan', csv);
    assert.strictEqual(rows.length, 1);
  });
});
