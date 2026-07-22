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

    transactions.push({
      date: row[dateIndex] || '',
      merchant: row[merchantIndex] || '',
      amount: parseInt(row[amountIndex]) || 0,
      memo: ''
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

    transactions.push({
      date: row[dateIndex] || '',
      merchant: row[merchantIndex] || '',
      amount: parseInt(row[amountIndex]) || 0,
      memo: ''
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

    transactions.push({
      date: row[dateIndex] || '',
      merchant: row[merchantIndex] || '',
      amount: parseInt(row[amountIndex]) || 0,
      memo: ''
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

    transactions.push({
      date: row[dateIndex] || '',
      merchant: row[merchantIndex] || '',
      amount: parseInt(row[amountIndex]) || 0,
      memo: ''
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