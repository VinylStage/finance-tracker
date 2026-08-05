'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');
const XLSX = require('xlsx');
const { parseCardExcel } = require('../src/services/cardExcelImport.js');

// 카드사 엑셀 파서를 **합성 픽스처**로 검증한다.
//
// 기존 `cardExcelImport.test.js` 의 본검증은 `ref/` 아래 실제 개인 명세서를 읽는데,
// 그 폴더는 `.gitignore` 대상이라 **CI 에서는 전부 skip 된다.** 그래서 실거래를
// 쓰는 임포터가 CI 에서 사실상 무검증이었다(라인 커버리지 32.9%).
//
// 이 파일은 샘플 없이 도는 것만 담는다. 열 위치와 판정 규칙은 파서 소스에서
// 그대로 읽어 왔고, 카드사가 포맷을 바꾸면 여기가 먼저 깨져야 한다.
//
// 이 저장소의 최악 사고가 임포트였다(실거래 2,212건 유실). 임포터는 조용히
// 틀리면 안 되는 자리다.

function makeWorkbook(rows, sheetName = 'Sheet1') {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// 농협은 14행부터 읽는다. 앞의 열넷은 머리말이라 비운다.
function nonghyupSheet(...dataRows) {
  return makeWorkbook([...Array.from({ length: 14 }, () => []), ...dataRows]);
}

// 농협 한 행. 열 위치는 parseNonghyupExcel 이 읽는 그대로다.
//   1 날짜 · 3 승인번호 · 10 금액 · 14 가맹점 · 18 할부여부 · 21 할부개월 · 22 취소
function nonghyupRow({
  date = '2024/01/01 12:00:00', approval = '58906541', amount = 34000,
  merchant = '쿠팡주식회사', style = '일시불', months = null, cancel = null,
} = {}) {
  const row = new Array(23).fill(null);
  row[1] = date;
  row[3] = approval;
  row[10] = amount;
  row[14] = merchant;
  row[18] = style;
  row[21] = months;
  row[22] = cancel;
  return row;
}

describe('A. 농협 — 합성 픽스처', () => {
  test('A-1. 한 행을 모든 칸까지 읽는다', () => {
    const result = parseCardExcel('nonghyup', nonghyupSheet(nonghyupRow()));

    assert.deepStrictEqual(result, [{
      date: '2024-01-01',
      merchant: '쿠팡주식회사',
      amount: 34000,
      is_installment: false,
      installment_months: null,
      cancelled: false,
      approval_number: '58906541',
    }]);
  });

  test('A-2. 천 단위 콤마가 붙은 금액을 읽는다', () => {
    const result = parseCardExcel('nonghyup', nonghyupSheet(nonghyupRow({ amount: '12,345' })));
    assert.strictEqual(result[0].amount, 12345);
    // 예전에는 NaN 이 나왔고, NaN 은 저장에서 NOT NULL 위반으로
    // 떨어져 **그 행만 조용히 빠졌다**
  });

  test('A-3. 할부 행은 개월수까지 읽는다', () => {
    const result = parseCardExcel('nonghyup', nonghyupSheet(nonghyupRow({ style: '할부', months: '3개월' })));
    assert.strictEqual(result[0].is_installment, true);
    assert.strictEqual(result[0].installment_months, 3);
  });

  test('A-4. 취소 칸을 읽는다', () => {
    // cancel: '1' → cancelled true
    const result1 = parseCardExcel('nonghyup', nonghyupSheet(nonghyupRow({ cancel: '1' })));
    assert.strictEqual(result1[0].cancelled, true);

    // cancel: '0' → false
    const result2 = parseCardExcel('nonghyup', nonghyupSheet(nonghyupRow({ cancel: '0' })));
    assert.strictEqual(result2[0].cancelled, false);

    // cancel: '-' → false
    const result3 = parseCardExcel('nonghyup', nonghyupSheet(nonghyupRow({ cancel: '-' })));
    assert.strictEqual(result3[0].cancelled, false);

    // cancel: null → false
    const result4 = parseCardExcel('nonghyup', nonghyupSheet(nonghyupRow({ cancel: null })));
    assert.strictEqual(result4[0].cancelled, false);
  });

  test('A-5. 날짜가 아닌 행을 만나면 거기서 멈춘다', () => {
    const result = parseCardExcel('nonghyup', nonghyupSheet(nonghyupRow(), [], nonghyupRow({ merchant: '스타벅스' })));
    assert.strictEqual(result.length, 1);
    // 표 아래에 합계·안내문이 붙어 오는데 그것까지 거래로 읽으면 안 된다.
    // 하나카드는 같은 상황에서 **건너뛴다** — 두 파서를 같은 규칙으로 통일하려 들면 안 된다
  });
});

describe('E. 현대 — 합성 픽스처', () => {
  test('E-1. 가맹점과 금액이 붙어 온 칸을 갈라 읽는다', () => {
    const result = parseCardExcel('hyundai', hyundaiSheet(hyundaiRow()));

    assert.deepStrictEqual(result, [{
      date: '2024-05-06',
      merchant: 'SSG_COM',
      amount: 100849,
      is_installment: false,
      installment_months: null,
      cancelled: false,
      approval_number: null,
    }]);
  });

  test('E-2. 해외결제는 USD 구간을 가맹점에 남기고 원화만 금액으로 읽는다', () => {
    const result = parseCardExcel('hyundai', hyundaiSheet(hyundaiRow({ merchantAmount: 'ANTHROPIC,USD:5.508,116' })));

    assert.strictEqual(result[0].merchant, 'ANTHROPIC,USD:5.50');
    assert.strictEqual(result[0].amount, 8116);
    // USD 숫자를 금액으로 잘못 읽으면 명세서와 액수가 달라진다
  });

  test('E-3. 뒤에 금액이 안 붙어 있으면 0 으로 읽는다', () => {
    const result = parseCardExcel('hyundai', hyundaiSheet(hyundaiRow({ merchantAmount: '연회비' })));

    assert.strictEqual(result[0].merchant, '연회비');
    assert.strictEqual(result[0].amount, 0);
  });

  test('E-4. 할부 표기가 있으면 할부로 읽는다', () => {
    const result = parseCardExcel('hyundai', hyundaiSheet(hyundaiRow({ installment: '3/5' })));

    assert.strictEqual(result[0].is_installment, true);
    assert.strictEqual(result[0].installment_months, 3);
  });

  test('E-5. 2열이 비어 있으면 그 행을 건너뛴다', () => {
    const result = parseCardExcel('hyundai', hyundaiSheet(hyundaiRow({ merchantAmount: null }), hyundaiRow()));

    assert.strictEqual(result.length, 1);
    // 건너뛰지 않으면 `String(null)` 이 `'null'` 로 가맹점명에 저장된다
  });
});

// 롯데는 8행부터 읽고, 0열이 비었거나 '■' 를 만나면 멈춘다.
function lotteSheet(...dataRows) {
  return makeWorkbook([...Array.from({ length: 8 }, () => []), ...dataRows]);
}

// 롯데 한 행.
//   0 날짜 · 3 가맹점 · 5 금액 · 6 할부여부 · 7 할부개월 · 8 승인번호 · 9 취소('N'이면 정상)
function lotteRow({
  date = '2024.02.03', merchant = '이마트', amount = 51000,
  style = '일시불', months = '-', approval = '11112222', cancel = 'N',
} = {}) {
  const row = new Array(10).fill(null);
  row[0] = date;
  row[3] = merchant;
  row[5] = amount;
  row[6] = style;
  row[7] = months;
  row[8] = approval;
  row[9] = cancel;
  return row;
}

describe('B. 롯데 — 합성 픽스처', () => {
  test('B-1. 한 행을 모든 칸까지 읽는다', () => {
    const result = parseCardExcel('lotte', lotteSheet(lotteRow()));

    assert.deepStrictEqual(result, [{
      date: '2024-02-03',
      merchant: '이마트',
      amount: 51000,
      is_installment: false,
      installment_months: null,
      cancelled: false,
      approval_number: '11112222',
    }]);
  });

  test('B-2. 천 단위 콤마가 붙은 금액을 읽는다', () => {
    const result = parseCardExcel('lotte', lotteSheet(lotteRow({ amount: '51,000' })));
    assert.strictEqual(result[0].amount, 51000);
    // 예전에는 NaN 이 나왔고 그 행이 저장에서 조용히 빠졌다
  });

  test('B-3. 할부 행은 개월수까지 읽는다', () => {
    const result = parseCardExcel('lotte', lotteSheet(lotteRow({ style: '할부', months: '5' })));
    assert.strictEqual(result[0].is_installment, true);
    assert.strictEqual(result[0].installment_months, 5);
  });

  test('B-4. 취소 표시를 읽는다', () => {
    const result1 = parseCardExcel('lotte', lotteSheet(lotteRow({ cancel: 'N' })));
    assert.strictEqual(result1[0].cancelled, false);

    const result2 = parseCardExcel('lotte', lotteSheet(lotteRow({ cancel: 'Y' })));
    assert.strictEqual(result2[0].cancelled, true);
  });

  test('B-5. \'■\' 로 시작하는 행을 만나면 멈춘다', () => {
    const result = parseCardExcel('lotte', lotteSheet(lotteRow(), ['■ 합계']));
    assert.strictEqual(result.length, 1);
    // 표 아래 합계·안내문을 거래로 읽으면 안 된다
  });
});

// 삼성은 시트 이름이 '■ 국내이용내역' 이어야 하고 1행부터 읽는다.
function samsungBook(...dataRows) {
  return makeWorkbook([[], ...dataRows], '■ 국내이용내역');
}

// 삼성 한 행.
//   2 날짜 · 4 가맹점 · 5 금액 · 6 할부여부 · 7 할부개월('0'이면 없음)
//   · 8 승인번호 · 9 취소('-'이면 정상)
function samsungRow({
  date = '2024.03.04', merchant = '올리브영', amount = 23000,
  style = '일시불', months = '0', approval = '33334444', cancel = '-',
} = {}) {
  const row = new Array(10).fill(null);
  row[2] = date;
  row[4] = merchant;
  row[5] = amount;
  row[6] = style;
  row[7] = months;
  row[8] = approval;
  row[9] = cancel;
  return row;
}

describe('C. 삼성 — 합성 픽스처', () => {
  test('C-1. 한 행을 모든 칸까지 읽는다', () => {
    const result = parseCardExcel('samsung', samsungBook(samsungRow()));

    assert.deepStrictEqual(result, [{
      date: '2024-03-04',
      merchant: '올리브영',
      amount: 23000,
      is_installment: false,
      installment_months: null,
      cancelled: false,
      approval_number: '33334444',
    }]);
  });

  test('C-2. 천 단위 콤마가 붙은 금액을 읽는다', () => {
    const result = parseCardExcel('samsung', samsungBook(samsungRow({ amount: '23,000' })));
    assert.strictEqual(result[0].amount, 23000);
    // 예전에는 NaN 이 나왔고 그 행이 저장에서 조용히 빠졌다
  });

  test('C-3. 취소는 9열이 "-" 가 아닐 때다', () => {
    const result = parseCardExcel('samsung', samsungBook(samsungRow({ cancel: '취소' })));
    assert.strictEqual(result[0].cancelled, true);
  });

  test('C-4. 일시불 → 할부 전환이면 원본 일시불을 취소로 본다', () => {
    const result = parseCardExcel('samsung', samsungBook(
      samsungRow({ merchant: '이마트(분할납부)', cancel: '-' }),
      samsungRow({ merchant: '이마트', cancel: '-' })
    ));
    
    const installmentRow = result.find(r => r.merchant === '이마트(분할납부)');
    const regularRow = result.find(r => r.merchant === '이마트');
    
    assert.strictEqual(installmentRow.cancelled, false);
    assert.strictEqual(regularRow.cancelled, true);
    // 안 그러면 같은 결제가 일시불과 할부로 두 번 집계된다
  });

  test('C-5. 승인번호가 같아도 분할납부 행이 없으면 아무것도 안 바꾼다', () => {
    const result = parseCardExcel('samsung', samsungBook(
      samsungRow({ approval: '77776666', merchant: '이마트' }),
      samsungRow({ approval: '77776666', merchant: '쿠팡' })
    ));
    
    assert.strictEqual(result[0].cancelled, false);
    assert.strictEqual(result[1].cancelled, false);
  });
});

// 하나는 4행부터 읽고, 0열이 YYYY.MM.DD 가 아니면 그 행만 건너뛴다.
function hanaSheet(...dataRows) {
  return makeWorkbook([...Array.from({ length: 4 }, () => []), ...dataRows]);
}

// 하나 한 행.
//   0 날짜 · 3 승인번호 · 4 가맹점 · 5 금액 · 7 할부여부 · 8 할부개월('-'이면 없음)
//   · 13 취소('취소'이면 취소)
function hanaRow({
  date = '2024.04.05', approval = '55556666', merchant = '배달의민족',
  amount = 18500, style = '일시불', months = '-', status = '정상',
} = {}) {
  const row = new Array(14).fill(null);
  row[0] = date;
  row[3] = approval;
  row[4] = merchant;
  row[5] = amount;
  row[7] = style;
  row[8] = months;
  row[13] = status;
  return row;
}

// 현대는 3행부터 읽고, 0열이 'YYYY년 M월 D일' 이 아니면 그 행만 건너뛴다.
function hyundaiSheet(...dataRows) {
  return makeWorkbook([...Array.from({ length: 3 }, () => []), ...dataRows]);
}

// 현대 한 행. **가맹점과 금액이 한 칸에 붙어서 온다**(2열).
//   0 날짜 · 2 가맹점+금액 · 3 할부('3/5' 같은 꼴이면 할부)
function hyundaiRow({
  date = '2024년 5월 6일', merchantAmount = 'SSG_COM100,849', installment = null,
} = {}) {
  const row = new Array(4).fill(null);
  row[0] = date;
  row[2] = merchantAmount;
  row[3] = installment;
  return row;
}

describe('D. 하나 — 합성 픽스처', () => {
  test('D-1. 한 행을 모든 칸까지 읽는다', () => {
    const result = parseCardExcel('hana', hanaSheet(hanaRow()));

    assert.deepStrictEqual(result, [{
      date: '2024-04-05',
      merchant: '배달의민족',
      amount: 18500,
      is_installment: false,
      installment_months: null,
      cancelled: false,
      approval_number: '55556666',
    }]);
  });

  test('D-2. 천 단위 콤마가 붙은 금액을 읽는다', () => {
    const result = parseCardExcel('hana', hanaSheet(hanaRow({ amount: '18,500' })));
    assert.strictEqual(result[0].amount, 18500);
    // 예전에는 NaN 이 나왔고 그 행이 저장에서 조용히 빠졌다
  });

  test('D-3. 할부 행은 개월수까지 읽는다', () => {
    const result = parseCardExcel('hana', hanaSheet(hanaRow({ style: '할부', months: '6개월' })));
    assert.strictEqual(result[0].is_installment, true);
    assert.strictEqual(result[0].installment_months, 6);
  });

  test('D-4. 13열이 \'취소\' 일 때만 취소다', () => {
    const result1 = parseCardExcel('hana', hanaSheet(hanaRow({ status: '취소' })));
    assert.strictEqual(result1[0].cancelled, true);

    const result2 = parseCardExcel('hana', hanaSheet(hanaRow({ status: '정상' })));
    assert.strictEqual(result2[0].cancelled, false);
  });

  test('D-5. 날짜 꼴이 아닌 행은 건너뛰고 계속 읽는다', () => {
    const result = parseCardExcel('hana', hanaSheet(hanaRow(), [], hanaRow({ merchant: '스타벅스' })));
    assert.strictEqual(result.length, 2);
    // 농협은 그런 행을 만나면 **멈추는데** 하나는 **건너뛴다**.
    // 두 파서를 같은 규칙으로 통일하려 들면 안 된다
  });
});
