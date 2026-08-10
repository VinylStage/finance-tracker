const XLSX = require('xlsx');
const { UserInputError } = require('../utils/errors');

// 셀 값을 문자열로 정규화. 없거나 null이면 null 반환.
function cell(row, i) {
  if (!row || row[i] === undefined || row[i] === null) return null;
  return String(row[i]).trim();
}
// 문자열에서 첫 숫자 그룹 추출. 없으면 null.
function firstInt(s) {
  if (s === null) return null;
  const m = String(s).match(/\d+/);
  return m ? Number(m[0]) : null;
}
// 금액 셀을 숫자로 읽는다.
//
// 카드사 엑셀은 금액을 숫자로 주기도 하고 '12,345' 같은 문자열로 주기도 한다.
// `Number('12,345')` 는 NaN 이고, NaN 은 INSERT 에서 NOT NULL 위반으로 떨어져
// **그 행만 조용히 빠진다** — 사용자는 "저장하지 못했습니다" 만 보고 원인을
// 알 수 없다.
//
// 문자열일 때만 콤마를 뗀다. 숫자·null·undefined 는 Number 에 그대로 넘겨
// 기존 동작을 바꾸지 않는다 (Number(null) === 0, Number(undefined) === NaN).
function amountOf(v) {
  return typeof v === 'string' ? Number(v.replace(/,/g, '')) : Number(v);
}
// 워크북에서 첫 시트를 안전하게 가져온다. 시트가 없으면 throw.
function firstSheet(workbook) {
  const name = workbook.SheetNames[0];
  const sheet = name ? workbook.Sheets[name] : undefined;
  if (!sheet) throw new UserInputError('엑셀에서 읽을 수 있는 시트를 찾지 못했습니다. 카드사에서 내려받은 원본 파일인지 확인해 주세요.');
  return sheet;
}

function detectCardCompany(filename) {
  const normalized = filename.normalize('NFC');
  if (normalized.includes('농협')) return 'nonghyup';
  if (normalized.includes('롯데')) return 'lotte';
  if (normalized.includes('삼성')) return 'samsung';
  if (normalized.includes('하나')) return 'hana';
  if (normalized.includes('현대')) return 'hyundai';
  // 파일명을 에러 메시지에 반사하지 않는다(입력 반사 방지)
  throw new UserInputError('지원하지 않는 카드사입니다. 파일 이름에 카드사명(농협·롯데·삼성·하나·현대)이 들어가야 합니다.');
}

function parseNonghyupExcel(buffer) {
  const workbook = XLSX.read(buffer, {type:'buffer', raw:true});
  const worksheet = firstSheet(workbook);
  const data = XLSX.utils.sheet_to_json(worksheet, {header:1, raw:true, defval:null});
  
  const result = [];
  for (let i = 14; i < data.length; i++) {
    const row = data[i];
    if (!cell(row, 1) || !/^\d{4}\/\d{2}\/\d{2}/.test(cell(row, 1))) break;
    
    const date = cell(row, 1).split(' ')[0].replaceAll('/', '-');
    const amount = amountOf(row[10]);
    const merchant = row[14];
    const is_installment = row[18] === '할부';
    const installment_months = firstInt(cell(row, 21));
    const cancelled = row[22] !== null && row[22] !== '0' && row[22] !== '-';
    const approval_number = row[3] != null ? String(row[3]) : null;

    result.push({
      date,
      merchant,
      amount,
      is_installment,
      installment_months,
      cancelled,
      approval_number
    });
  }

  return result;
}

function parseLotteExcel(buffer) {
  const workbook = XLSX.read(buffer, {type:'buffer', raw:true});
  const worksheet = firstSheet(workbook);
  const data = XLSX.utils.sheet_to_json(worksheet, {header:1, raw:true, defval:null});
  
  const result = [];
  for (let i = 8; i < data.length; i++) {
    const row = data[i];
    if (!cell(row, 0) || cell(row, 0).includes('■')) break;
    
    const date = cell(row, 0).replaceAll('.', '-');
    const merchant = row[3];
    const amount = amountOf(row[5]);
    const is_installment = row[6] === '할부';
    const installment_months = cell(row, 7) === '-' ? null : firstInt(cell(row, 7));
    const cancelled = row[9] !== 'N';
    const approval_number = row[8] != null ? String(row[8]) : null;

    result.push({
      date,
      merchant,
      amount,
      is_installment,
      installment_months,
      cancelled,
      approval_number
    });
  }

  return result;
}

function parseSamsungExcel(buffer) {
  const workbook = XLSX.read(buffer, {type:'buffer', raw:true});
  const worksheet = workbook.Sheets['■ 국내이용내역'];
  if (!worksheet) throw new UserInputError('국내이용내역 시트를 찾지 못했습니다. 카드사에서 내려받은 원본 파일인지 확인해 주세요.');
  const data = XLSX.utils.sheet_to_json(worksheet, {header:1, raw:true, defval:null});
  
  const result = [];
  const byApprovalNumber = new Map();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!cell(row, 2)) continue;

    const date = cell(row, 2).replaceAll('.', '-');
    const merchant = row[4];
    const amount = amountOf(row[5]);
    const is_installment = row[6] === '할부';
    const installment_months = row[7] === '0' ? null : Number(row[7]);
    const cancelled = row[9] !== '-';
    const approvalNumber = row[8];

    const entry = {
      date,
      merchant,
      amount,
      is_installment,
      installment_months,
      cancelled,
      approval_number: approvalNumber != null ? String(approvalNumber) : null
    };
    result.push(entry);
    if (approvalNumber) {
      if (!byApprovalNumber.has(approvalNumber)) byApprovalNumber.set(approvalNumber, []);
      byApprovalNumber.get(approvalNumber).push(entry);
    }
  }

  // 일시불 → 할부 전환 시 같은 승인번호로 3행이 남는다: 전환된 할부 항목, 원본 일시불 항목
  // (취소 처리 안 됨), 원본에 대한 취소 반영분. 원본 일시불 항목을 그대로 두면 같은 결제가
  // 두 번 (일시불 + 할부) 집계되므로, 활성 할부 전환 항목이 있으면 원본은 취소 처리한다.
  for (const rows of byApprovalNumber.values()) {
    if (rows.length < 2) continue;
    const hasActiveConversion = rows.some(r => !r.cancelled && (r.merchant || '').includes('(분할납부)'));
    if (!hasActiveConversion) continue;
    for (const r of rows) {
      if (!r.cancelled && !(r.merchant || '').includes('(분할납부)')) r.cancelled = true;
    }
  }

  return result;
}

function parseHanaExcel(buffer) {
  const workbook = XLSX.read(buffer, {type:'buffer', raw:true});
  const worksheet = firstSheet(workbook);
  const data = XLSX.utils.sheet_to_json(worksheet, {header:1, raw:true, defval:null});
  
  const result = [];
  for (let i = 4; i < data.length; i++) {
    const row = data[i];
    if (!cell(row, 0) || !/^\d{4}\.\d{2}\.\d{2}$/.test(cell(row, 0))) continue;

    const date = cell(row, 0).replaceAll('.', '-');
    const merchant = row[4];
    const amount = amountOf(row[5]);
    const is_installment = row[7] === '할부';
    const installment_months = cell(row, 8) === '-' ? null : firstInt(cell(row, 8));
    const cancelled = row[13] === '취소';
    const approval_number = row[3] != null ? String(row[3]) : null;

    result.push({
      date,
      merchant,
      amount,
      is_installment,
      installment_months,
      cancelled,
      approval_number
    });
  }

  return result;
}

function parseHyundaiExcel(buffer) {
  const workbook = XLSX.read(buffer, {type:'buffer', raw:true});
  const worksheet = firstSheet(workbook);
  const data = XLSX.utils.sheet_to_json(worksheet, {header:1, raw:true, defval:null});
  
  const result = [];
  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    if (!cell(row, 0) || cell(row, 0) === '-' || !/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/.test(cell(row, 0))) continue;
    
    const match = cell(row, 0).match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
    const date = `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
    // 가맹점+금액이 한 셀에 붙어 오므로 이 셀이 없으면 파싱할 수 없다. 건너뛴다
    // (String(null) = 'null' 이 가맹점명으로 저장되는 것을 방지).
    const rawMerchant = cell(row, 2);
    if (rawMerchant === null) continue;
    // 이용금액 column is unreliable/blank in this export; the amount is instead
    // appended directly onto the merchant name with no separator (e.g. "연회비0", "SSG_COM100,849").
    // Foreign-currency rows embed a "USD:12.34" segment before the KRW amount
    // (e.g. "ANTHROPIC,USD:5.508,116" = "ANTHROPIC" + USD:5.50 + amount 8,116),
    // so that segment must be excluded from the trailing-amount match first.
    const usdSuffix = rawMerchant.match(/USD:\d+\.\d{2}(?=[\d,]+$)/);
    let merchant, amount;
    if (usdSuffix) {
      const cut = usdSuffix.index + usdSuffix[0].length;
      merchant = rawMerchant.slice(0, cut);
      amount = amountOf(rawMerchant.slice(cut));
    } else {
      const amountSuffix = rawMerchant.match(/([\d,]+)$/);
      merchant = amountSuffix ? rawMerchant.slice(0, amountSuffix.index) : rawMerchant;
      amount = amountSuffix ? amountOf(amountSuffix[1]) : 0;
    }
    const installment_months = cell(row, 3) && cell(row, 3).includes('/') ? firstInt(cell(row, 3)) : null;
    
    result.push({
      date,
      merchant,
      amount,
      is_installment: installment_months !== null,
      installment_months,
      cancelled: false,
      approval_number: null
    });
  }
  
  return result;
}

function parseCardExcel(cardCompany, buffer) {
  switch (cardCompany) {
    case 'nonghyup':
      return parseNonghyupExcel(buffer);
    case 'lotte':
      return parseLotteExcel(buffer);
    case 'samsung':
      return parseSamsungExcel(buffer);
    case 'hana':
      return parseHanaExcel(buffer);
    case 'hyundai':
      return parseHyundaiExcel(buffer);
    default:
      throw new Error(`Unknown card company: ${cardCompany}`);
  }
}

module.exports = { parseCardExcel, detectCardCompany };
