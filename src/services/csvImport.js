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

/**
 * 카드사별 파서 함수 - TODO: 실제 CSV 구조 확인 필요
 */
function parseHanaCsv(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length < 1) {
    throw new Error('Invalid CSV data');
  }

  // TODO: 확인 필요 - 실제 한카드 CSV 내보내기 샘플로 컬럼 헤더/순서/인코딩 검증 필요
  const header = rows[0];
  const headers = header.map(h => h.trim());

  if (!headers.includes('일자') || !headers.includes('가맹점명') || !headers.includes('금액')) {
    throw new Error('Required columns (일자, 가맹점명, 금액) not found in Hana CSV');
  }

  const transactions = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0) continue;

    // TODO: 확인 필요 - 실제 한카드 CSV 내보내기 샘플로 컬럼 헤더/순서/인코딩 검증 필요
    const dateIndex = headers.indexOf('일자');
    const merchantIndex = headers.indexOf('가맹점명');
    const amountIndex = headers.indexOf('금액');

    const dateRaw = row[dateIndex];
    const merchant = row[merchantIndex] || '';
    const amountRaw = row[amountIndex];

    const parsedDate = normalizeDate(dateRaw);
    const parsedAmount = parseAmount(amountRaw);

    transactions.push({
      date: parsedDate,
      merchant: merchant,
      amount: parsedAmount,
      memo: '',
      error: parsedDate === null || isNaN(parsedAmount) ? 'Invalid data' : null
    });
  }

  return transactions;
}

function parseSamsungCsv(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length < 1) {
    throw new Error('Invalid CSV data');
  }

  // TODO: 확인 필요 - 실제 삼성카드 CSV 내보내기 샘플로 컬럼 헤더/순서/인코딩 검증 필요
  const header = rows[0];
  const headers = header.map(h => h.trim());

  if (!headers.includes('거래일자') || !headers.includes('가맹점명') || !headers.includes('거래금액')) {
    throw new Error('Required columns (거래일자, 가맹점명, 거래금액) not found in Samsung CSV');
  }

  const transactions = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0) continue;

    // TODO: 확인 필요 - 실제 삼성카드 CSV 내보내기 샘플로 컬럼 헤더/순서/인코딩 검증 필요
    const dateIndex = headers.indexOf('거래일자');
    const merchantIndex = headers.indexOf('가맹점명');
    const amountIndex = headers.indexOf('거래금액');

    const dateRaw = row[dateIndex];
    const merchant = row[merchantIndex] || '';
    const amountRaw = row[amountIndex];

    const parsedDate = normalizeDate(dateRaw);
    const parsedAmount = parseAmount(amountRaw);

    transactions.push({
      date: parsedDate,
      merchant: merchant,
      amount: parsedAmount,
      memo: '',
      error: parsedDate === null || isNaN(parsedAmount) ? 'Invalid data' : null
    });
  }

  return transactions;
}

function parseHyundaiCsv(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length < 1) {
    throw new Error('Invalid CSV data');
  }

  // TODO: 확인 필요 - 실제 현대카드 CSV 내보내기 샘플로 컬럼 헤더/순서/인코딩 검증 필요
  const header = rows[0];
  const headers = header.map(h => h.trim());

  if (!headers.includes('입력일자') || !headers.includes('가맹점명') || !headers.includes('금액')) {
    throw new Error('Required columns (입력일자, 가맹점명, 금액) not found in Hyundai CSV');
  }

  const transactions = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0) continue;

    // TODO: 확인 필요 - 실제 현대카드 CSV 내보내기 샘플로 컬럼 헤더/순서/인코딩 검증 필요
    const dateIndex = headers.indexOf('입력일자');
    const merchantIndex = headers.indexOf('가맹점명');
    const amountIndex = headers.indexOf('금액');

    const dateRaw = row[dateIndex];
    const merchant = row[merchantIndex] || '';
    const amountRaw = row[amountIndex];

    const parsedDate = normalizeDate(dateRaw);
    const parsedAmount = parseAmount(amountRaw);

    transactions.push({
      date: parsedDate,
      merchant: merchant,
      amount: parsedAmount,
      memo: '',
      error: parsedDate === null || isNaN(parsedAmount) ? 'Invalid data' : null
    });
  }

  return transactions;
}

function parseShinhanCsv(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length < 1) {
    throw new Error('Invalid CSV data');
  }

  // TODO: 확인 필요 - 실제 신한카드 CSV 내보내기 샘플로 컬럼 헤더/순서/인코딩 검증 필요
  const header = rows[0];
  const headers = header.map(h => h.trim());

  if (!headers.includes('거래일자') || !headers.includes('가맹점') || !headers.includes('금액')) {
    throw new Error('Required columns (거래일자, 가맹점, 금액) not found in Shinhan CSV');
  }

  const transactions = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0) continue;

    // TODO: 확인 필요 - 실제 신한카드 CSV 내보내기 샘플로 컬럼 헤더/순서/인코딩 검증 필요
    const dateIndex = headers.indexOf('거래일자');
    const merchantIndex = headers.indexOf('가맹점');
    const amountIndex = headers.indexOf('금액');

    const dateRaw = row[dateIndex];
    const merchant = row[merchantIndex] || '';
    const amountRaw = row[amountIndex];

    const parsedDate = normalizeDate(dateRaw);
    const parsedAmount = parseAmount(amountRaw);

    transactions.push({
      date: parsedDate,
      merchant: merchant,
      amount: parsedAmount,
      memo: '',
      error: parsedDate === null || isNaN(parsedAmount) ? 'Invalid data' : null
    });
  }

  return transactions;
}

const parsers = {
  hana: parseHanaCsv,
  samsung: parseSamsungCsv,
  hyundai: parseHyundaiCsv,
  shinhan: parseShinhanCsv
};

/**
 * 카드사별 CSV 텍스트를 파싱해서 거래 내역 배열로 변환
 * @param {string} cardCompany
 * @param {string} csvText
 * @returns {Array<Object>} 거래 내역 배열 - { date, merchant, amount, memo }
 */
function parseCardCsv(cardCompany, csvText) {
  const parser = parsers[cardCompany];
  if (!parser) {
    throw new Error(`Unsupported card company: ${cardCompany}`);
  }

  return parser(csvText);
}

module.exports = { parseCardCsv };