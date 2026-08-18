export function capsToRows(rule) {
  if (!rule || !rule.caps) return [];
  return rule.caps.map(cap => ({
    window: cap.window,
    amount: cap.amount ? String(cap.amount) : '',
    count: cap.count ? String(cap.count) : ''
  }));
}

export function rowsToCaps(rows) {
  if (!rows || rows.length === 0) return { caps: null, error: null };
  
  const caps = [];
  const windows = new Set();
  
  for (const row of rows) {
    // Skip empty rows
    if (!row.window && !row.amount && !row.count) continue;
    
    // Validate window
    if (!['transaction', 'day', 'month'].includes(row.window)) {
      return { caps: null, error: '알 수 없는 한도 기간입니다.' };
    }
    
    // Check if both amount and count are empty
    if (!row.amount && !row.count) {
      return { caps: null, error: '한도에는 금액이나 횟수 중 하나는 넣어 주세요.' };
    }
    
    // Validate amount
    if (row.amount && (isNaN(row.amount) || Number(row.amount) <= 0 || !Number.isInteger(Number(row.amount)))) {
      return { caps: null, error: '금액은 양의 정수여야 합니다.' };
    }
    
    // Validate count
    if (row.count && (isNaN(row.count) || Number(row.count) <= 0 || !Number.isInteger(Number(row.count)))) {
      return { caps: null, error: '횟수는 양의 정수여야 합니다.' };
    }
    
    // Check for duplicate windows
    if (windows.has(row.window)) {
      return { caps: null, error: `${row.window} 이 두 번 있습니다.` };
    }
    windows.add(row.window);
    
    // Build cap object
    const cap = { window: row.window };
    if (row.amount) cap.amount = Number(row.amount);
    if (row.count) cap.count = Number(row.count);
    caps.push(cap);
  }
  
  if (caps.length === 0) {
    return { caps: null, error: null };
  }
  
  return { caps, error: null };
}

export function datesToText(rule) {
  if (!rule || !rule.when || !rule.when.dates) return '';
  return rule.when.dates.join(', ');
}

export function textToDates(text) {
  if (!text || text.trim() === '') return { dates: null, error: null };
  
  const dates = text.split(',').map(d => d.trim()).filter(d => d !== '');
  
  if (dates.length === 0) return { dates: null, error: null };
  
  const seen = new Set();
  for (const dateStr of dates) {
    // Validate format
    if (!/^\d{2}-\d{2}$/.test(dateStr)) {
      return { dates: null, error: '날짜 형식이 올바르지 않습니다: ' + dateStr + ' (MM-DD)' };
    }
    
    const [month, day] = dateStr.split('-').map(Number);
    
    // Validate month
    if (month < 1 || month > 12) {
      return { dates: null, error: '날짜 형식이 올바르지 않습니다: ' + dateStr + ' (MM-DD)' };
    }
    
    // Validate day
    const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    if (day < 1 || day > daysInMonth) {
      return { dates: null, error: '날짜 형식이 올바르지 않습니다: ' + dateStr + ' (MM-DD)' };
    }
    
    // Check for duplicates
    if (seen.has(dateStr)) {
      return { dates: null, error: '날짜 ' + dateStr + ' 이 두 번 있습니다.' };
    }
    seen.add(dateStr);
  }
  
  return { dates, error: null };
}
