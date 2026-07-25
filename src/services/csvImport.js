'use strict';

/**
 * 간단한 CSV 파서 - 쉼표로 분리, 따옴표 처리
 * @param {string} csvText
 * @returns {Array<Array<string>>}
 */
function parseCsv(csvText) {
  const lines = [];
  let currentLine = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // 이스케이프된 따옴표
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentLine.push(currentField);
      currentField = '';
    } else if (char === '\r' && !inQuotes) {
      // CRLF 개행의 \r 은 따옴표 밖에서는 버린다 (마지막 필드 오염 방지)
    } else if (char === '\n' && !inQuotes) {
      currentLine.push(currentField);
      lines.push(currentLine);
      currentLine = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  // 마지막 줄 처리
  if (currentField || currentLine.length > 0) {
    currentLine.push(currentField);
    lines.push(currentLine);
  }

  return lines;
}

/**
 * 숫자 문자열 파싱 - 천단위 구분자 제거, 괄호 음수 처리
 * @param {string} raw
 * @returns {number}
 */
function parseAmount(raw) {
  if (typeof raw !== 'string') {
    return NaN;
  }
  
  // 괄호로 감싼 음수를 마이너스로 변환
  if (raw.startsWith('(') && raw.endsWith(')')) {
    raw = '-' + raw.substring(1, raw.length - 1);
  }
  
  // 숫자, 마이너스, 소수점 이외의 모든 문자 제거
  const cleaned = raw.replace(/[^\d\-\.]/g, '');
  
  if (cleaned === '' || cleaned === '-') {
    return NaN;
  }
  
  return Number(cleaned);
}

/**
 * 날짜 포맷 정규화 - YYYY.MM.DD, YYYY/MM/DD, YYYYMMDD, YYYY-MM-DD 을 전부 YYYY-MM-DD로 변환
 * @param {string} raw
 * @returns {string|null}
 */
function normalizeDate(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  
  // 다양한 입력 포맷을 검사
  const formats = [
    /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/,  // YYYY.MM.DD
    /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,  // YYYY/MM/DD
    /^(\d{8})$/,                        // YYYYMMDD
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/     // YYYY-MM-DD
  ];
  
  for (const format of formats) {
    const match = raw.match(format);
    if (match) {
      let year, month, day;
      
      if (format === formats[0] || format === formats[1]) {
        // YYYY.MM.DD 또는 YYYY/MM/DD 포맷
        year = match[1];
        month = String(match[2]).padStart(2, '0');
        day = String(match[3]).padStart(2, '0');
      } else if (format === formats[2]) {
        // YYYYMMDD 형식
        year = match[1].substring(0, 4);
        month = match[1].substring(4, 6);
        day = match[1].substring(6, 8);
      } else {
        // YYYY-MM-DD 형식
        year = match[1];
        month = String(match[2]).padStart(2, '0');
        day = String(match[3]).padStart(2, '0');
      }

      // 실제 달력 유효성 검증: Date 로 만들어 롤오버(2026-02-30 → 3월)를 감지한다.
      // 형식만 맞고 존재하지 않는 날짜(2026-99-99, 20260230)는 null 을 반환한다.
      const y = Number(year), mo = Number(month), d = Number(day);
      const dt = new Date(y, mo - 1, d);
      if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) {
        return null;
      }

      return `${year}-${month}-${day}`;
    }
  }

  return null;
}

// 카드사별 CSV 컬럼 스펙. 파싱 로직은 동일하고 컬럼명만 다르므로 표로 분리한다.
// 하나/삼성/현대는 실전 검증된 엑셀 경로(cardExcelImport.js)로 통일하고 CSV 경로에서는 제거했다(#88).
// 신한은 엑셀 내보내기를 지원하지 않고 실사용이 확인돼 CSV 경로를 유지한다.
// 주의: 아래 신한 컬럼명은 실제 신한카드 CSV 내보내기 샘플로 검증된 적이 없다(#88에서도 미해결).
// 헤더가 다르면 parseWithSpec이 명확한 에러로 막아주지만, 실제 샘플 확보 시 반드시 재검증할 것.
const CARD_CSV_SPECS = {
  shinhan: { date: '거래일자', merchant: '가맹점',   amount: '금액',     label: 'Shinhan' },
};

/**
 * 스펙에 따라 카드사 CSV를 파싱한다. 날짜/금액 정규화와 오류 표시는 공통이다.
 * @param {string} csvText
 * @param {{date:string, merchant:string, amount:string, label:string}} spec
 * @returns {Array<Object>} { date, merchant, amount, memo, error }
 */
function parseWithSpec(csvText, spec) {
  const rows = parseCsv(csvText);
  if (rows.length < 1) {
    throw new Error('Invalid CSV data');
  }

  const headers = rows[0].map(h => h.trim());
  if (!headers.includes(spec.date) || !headers.includes(spec.merchant) || !headers.includes(spec.amount)) {
    throw new Error(`Required columns (${spec.date}, ${spec.merchant}, ${spec.amount}) not found in ${spec.label} CSV`);
  }

  const dateIndex = headers.indexOf(spec.date);
  const merchantIndex = headers.indexOf(spec.merchant);
  const amountIndex = headers.indexOf(spec.amount);

  const transactions = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0) continue;

    const parsedDate = normalizeDate(row[dateIndex]);
    const parsedAmount = parseAmount(row[amountIndex]);

    transactions.push({
      date: parsedDate,
      merchant: row[merchantIndex] || '',
      amount: parsedAmount,
      memo: '',
      error: parsedDate === null || isNaN(parsedAmount) ? 'Invalid data' : null
    });
  }

  return transactions;
}

/**
 * 카드사별 CSV 텍스트를 파싱해서 거래 내역 배열로 변환
 * @param {string} cardCompany
 * @param {string} csvText
 * @returns {Array<Object>} 거래 내역 배열 - { date, merchant, amount, memo, error }
 */
function parseCardCsv(cardCompany, csvText) {
  const spec = CARD_CSV_SPECS[cardCompany];
  if (!spec) {
    throw new Error(`Unsupported card company: ${cardCompany}`);
  }
  return parseWithSpec(csvText, spec);
}

module.exports = { parseCardCsv };