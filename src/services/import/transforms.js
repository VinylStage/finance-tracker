'use strict';

// 설정 기반 임포트 엔진의 "이름 붙은 변환 라이브러리".
// 카드사별 특례 코드를 금지하는 대신, 각 프로파일이 여기 있는 변환을 이름으로
// 지정·조합한다(설계 §4/D3). 새 변환은 여기에만 추가하고 전 카드사가 재사용한다.
//
// 기존 services/cardExcelImport.js 의 헬퍼(cell/amountOf/firstInt)와 동일 동작을
// 유지해 마이그레이션 회귀가 성립하게 한다.

function cell(row, i) {
  if (!row || row[i] === undefined || row[i] === null) return null;
  return String(row[i]).trim();
}
function firstInt(s) {
  if (s === null || s === undefined) return null;
  const m = String(s).match(/\d+/);
  return m ? Number(m[0]) : null;
}
function amountOf(v) {
  return typeof v === 'string' ? Number(v.replace(/,/g, '')) : Number(v);
}

// 각 변환은 (rawCellValue, ctx) => value. ctx = { row, profile, colIndex }.
const TRANSFORMS = {
  raw: (v) => (v === undefined ? null : v),
  str_or_null: (v) => (v != null ? String(v) : null),
  amount_num: (v) => amountOf(v),
  first_int: (v) => firstInt(cell([v], 0)),

  // 날짜: 다양한 구분자. 공백이 있으면 첫 토큰만(시각 분리).
  slash_ymd: (v) => { const s = cell([v], 0); return s ? s.split(' ')[0].replace(/\//g, '-') : null; },
  dot_ymd: (v) => { const s = cell([v], 0); return s ? s.split(' ')[0].replace(/\./g, '-') : null; },
  korean_ymd: (v) => {
    const s = cell([v], 0); if (!s) return null;
    const m = s.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
    return m ? `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}` : null;
  },

  // 불린: 셀 값이 특정 값과 같은가(트림 후).
  equals: (v, ctx) => cell([v], 0) === ctx.param.value,
  // 원시값 그대로 비교(기존 파서가 row[x]==='할부' 처럼 트림 없이 비교하는 경우).
  raw_equals: (v, ctx) => v === ctx.param.value,
};

// cancelled 등 "여러 조건으로 판정하는" 규칙. (row, rule) => boolean.
const PREDICATES = {
  // 해당 열 값이 values 목록에 "없으면" true (취소로 판정). null 포함 비교.
  not_in: (row, rule) => {
    const raw = row[rule.col] === undefined ? null : row[rule.col];
    return !rule.values.some((x) => x === raw);
  },
  // 해당 열 값이 value 와 같으면 true.
  equals: (row, rule) => cell(row, rule.col) === rule.value,
  // 해당 열 값이 value 와 다르면 true.
  not_equals: (row, rule) => cell(row, rule.col) !== rule.value,
};

// 행 필터(루프 중단/스킵). (row, rule) => 'keep' | 'break' | 'skip'.
function evalRowStop(row, rule) {
  if (!rule) return 'keep';
  if (rule.when === 'col_not_match') {
    const s = cell(row, rule.col);
    if (!s || !new RegExp(rule.pattern).test(s)) return rule.action || 'break';
  }
  if (rule.when === 'col_contains') {
    const s = cell(row, rule.col);
    if (s && s.includes(rule.value)) return rule.action || 'break';
  }
  return 'keep';
}

module.exports = { TRANSFORMS, PREDICATES, evalRowStop, cell, firstInt, amountOf };
