const XLSX = require('xlsx');

function detectCardCompany(filename) {
  const normalized = filename.normalize('NFC');
  if (normalized.includes('농협')) return 'nonghyup';
  if (normalized.includes('롯데')) return 'lotte';
  if (normalized.includes('삼성')) return 'samsung';
  if (normalized.includes('하나')) return 'hana';
  if (normalized.includes('현대')) return 'hyundai';
  throw new Error(`Unknown card company in filename: ${filename}`);
}

function parseNonghyupExcel(buffer) {
  const workbook = XLSX.read(buffer, {type:'buffer', raw:true});
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(worksheet, {header:1, raw:true, defval:null});
  
  const result = [];
  for (let i = 14; i < data.length; i++) {
    const row = data[i];
    if (!row[1] || !/^\d{4}\/\d{2}\/\d{2}/.test(row[1])) break;
    
    const date = row[1].split(' ')[0].replaceAll('/', '-');
    const amount = Number(row[10]);
    const merchant = row[14];
    const is_installment = row[18] === '할부';
    const installment_months = row[21] ? Number(row[21].match(/\d+/)[0]) : null;
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
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(worksheet, {header:1, raw:true, defval:null});
  
  const result = [];
  for (let i = 8; i < data.length; i++) {
    const row = data[i];
    if (!row[0] || row[0].includes('■')) break;
    
    const date = row[0].replaceAll('.', '-');
    const merchant = row[3];
    const amount = Number(row[5]);
    const is_installment = row[6] === '할부';
    const installment_months = row[7] === '-' ? null : Number(row[7].match(/\d+/)[0]);
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
  const data = XLSX.utils.sheet_to_json(worksheet, {header:1, raw:true, defval:null});
  
  const result = [];
  const byApprovalNumber = new Map();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[2]) continue;

    const date = row[2].replaceAll('.', '-');
    const merchant = row[4];
    const amount = Number(row[5]);
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
    const hasActiveConversion = rows.some(r => !r.cancelled && r.merchant.includes('(분할납부)'));
    if (!hasActiveConversion) continue;
    for (const r of rows) {
      if (!r.cancelled && !r.merchant.includes('(분할납부)')) r.cancelled = true;
    }
  }

  return result;
}

function parseHanaExcel(buffer) {
  const workbook = XLSX.read(buffer, {type:'buffer', raw:true});
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(worksheet, {header:1, raw:true, defval:null});
  
  const result = [];
  for (let i = 4; i < data.length; i++) {
    const row = data[i];
    if (!row[0] || !/^\d{4}\.\d{2}\.\d{2}$/.test(row[0])) continue;

    const date = row[0].replaceAll('.', '-');
    const merchant = row[4];
    const amount = Number(row[5]);
    const is_installment = row[7] === '할부';
    const installment_months = row[8] === '-' ? null : Number(row[8].match(/\d+/)?.[0]) || null;
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
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(worksheet, {header:1, raw:true, defval:null});
  
  const result = [];
  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    if (!row[0] || row[0] === '-' || !/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/.test(row[0])) continue;
    
    const match = row[0].match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
    const date = `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
    // 이용금액 column is unreliable/blank in this export; the amount is instead
    // appended directly onto the merchant name with no separator (e.g. "연회비0", "SSG_COM100,849").
    // Foreign-currency rows embed a "USD:12.34" segment before the KRW amount
    // (e.g. "ANTHROPIC,USD:5.508,116" = "ANTHROPIC" + USD:5.50 + amount 8,116),
    // so that segment must be excluded from the trailing-amount match first.
    const rawMerchant = String(row[2]);
    const usdSuffix = rawMerchant.match(/USD:\d+\.\d{2}(?=[\d,]+$)/);
    let merchant, amount;
    if (usdSuffix) {
      const cut = usdSuffix.index + usdSuffix[0].length;
      merchant = rawMerchant.slice(0, cut);
      amount = Number(rawMerchant.slice(cut).replace(/,/g, ''));
    } else {
      const amountSuffix = rawMerchant.match(/([\d,]+)$/);
      merchant = amountSuffix ? rawMerchant.slice(0, amountSuffix.index) : rawMerchant;
      amount = amountSuffix ? Number(amountSuffix[1].replace(/,/g, '')) : 0;
    }
    const installment_months = row[3] && row[3].includes('/') ? Number(row[3].match(/^(\d+)\//)[1]) : null;
    
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