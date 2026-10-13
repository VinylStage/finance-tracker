'use strict';

// 설정 기반 임포트 엔진의 "이름 붙은 변환/술어/파생/후처리 라이브러리".
// 카드사별 특례 코드를 금지하는 대신, 각 프로파일이 여기 있는 규칙을 이름으로
// 지정·조합한다(설계 §4/§5/D3). 새 규칙은 여기에만 추가하고 전 카드사가 재사용한다.
// 기존 services/cardExcelImport.js 의 헬퍼(cell/amountOf/firstInt)와 동일 동작 유지 →
// 마이그레이션 회귀가 성립한다.

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

// 값 변환: (rawCellValue, ctx) => value. ctx = { row, param }.
const TRANSFORMS = {
  raw: (v) => (v === undefined ? null : v),
  str_or_null: (v) => (v != null ? String(v) : null),
  amount_num: (v) => amountOf(v),
  first_int: (v) => firstInt(cell([v], 0)),
  // 셀이 '-' 이면 null, 아니면 첫 숫자(롯데·하나 할부개월).
  dash_or_first_int: (v) => { const s = cell([v], 0); return s === '-' ? null : firstInt(s); },
  // 원시값이 '0' 이면 null, 아니면 Number(삼성 할부개월).
  zero_or_num: (v) => (v === '0' ? null : Number(v)),
  // '/' 를 포함할 때만 첫 숫자(현대 할부 회차 "12/1").
  slash_then_first_int: (v) => { const s = cell([v], 0); return s && s.includes('/') ? firstInt(s) : null; },

  // 날짜
  slash_ymd: (v) => { const s = cell([v], 0); return s ? s.split(' ')[0].replace(/\//g, '-') : null; },
  dot_ymd: (v) => { const s = cell([v], 0); return s ? s.replace(/\./g, '-') : null; },
  korean_ymd: (v) => {
    const s = cell([v], 0); if (!s) return null;
    const m = s.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
    return m ? `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}` : null;
  },

  // 불린(트림 후 비교)
  equals: (v, ctx) => cell([v], 0) === ctx.param.value,
  // 원시값 그대로 비교(기존 파서가 row[x]==='할부' 처럼 트림 없이 비교하는 경우)
  raw_equals: (v, ctx) => v === ctx.param.value,
};

// 행 단위 불린 술어(cancelled 등). (row, rule) => boolean.
const PREDICATES = {
  // 열 값이 values 목록에 없으면 true(원시 비교, null 포함).
  not_in: (row, rule) => {
    const raw = row[rule.col] === undefined ? null : row[rule.col];
    return !rule.values.some((x) => x === raw);
  },
  raw_equals: (row, rule) => row[rule.col] === rule.value,
  raw_not_equals: (row, rule) => row[rule.col] !== rule.value,
  equals: (row, rule) => cell(row, rule.col) === rule.value,
  not_equals: (row, rule) => cell(row, rule.col) !== rule.value,
};

// 행 규칙(루프 중단/스킵)을 순서대로 평가. 첫 트리거의 action 반환, 없으면 'keep'.
function evalRowRules(row, rules) {
  if (!rules || rules.length === 0) return 'keep';
  for (const rule of rules) {
    let hit = false;
    const s = cell(row, rule.col);
    if (rule.when === 'col_empty') hit = s === null;
    else if (rule.when === 'col_not_match') hit = !s || !new RegExp(rule.pattern).test(s);
    else if (rule.when === 'col_contains') hit = !!s && s.includes(rule.value);
    else if (rule.when === 'col_eq') hit = s === rule.value;
    if (hit) return rule.action || 'break';
  }
  return 'keep';
}

// 파생: 한 셀에서 여러 필드. (rec, row, spec) => void (rec 를 변형).
const DERIVES = {
  // 가맹점+금액이 한 셀에 붙어오는 포맷(현대). USD 임베드 분리 포함.
  merchant_amount_split: (rec, row, spec) => {
    const rawMerchant = cell(row, spec.src_col);
    if (rawMerchant === null) { rec.merchant = null; rec.amount = 0; return; }
    const usdSuffix = rawMerchant.match(/USD:\d+\.\d{2}(?=[\d,]+$)/);
    if (usdSuffix) {
      const cut = usdSuffix.index + usdSuffix[0].length;
      rec.merchant = rawMerchant.slice(0, cut);
      rec.amount = amountOf(rawMerchant.slice(cut));
    } else {
      const amountSuffix = rawMerchant.match(/([\d,]+)$/);
      rec.merchant = amountSuffix ? rawMerchant.slice(0, amountSuffix.index) : rawMerchant;
      rec.amount = amountSuffix ? amountOf(amountSuffix[1]) : 0;
    }
  },
};

// 후처리: 레코드 배열 전체에 작용. (records, spec) => records.
const POSTS = {
  // 같은 승인번호에 "활성 (분할납부)" 가 있으면 같은 승인번호의 (분할납부 아닌)
  // 활성 원거래를 취소로 본다(삼성 일시불→할부 전환 상쇄). 기존 파서와 동일.
  offset_pair_cancel: (records, spec) => {
    const token = (spec && spec.token) || '(분할납부)';
    const byApproval = new Map();
    for (const r of records) {
      if (!r.approval_number) continue;
      if (!byApproval.has(r.approval_number)) byApproval.set(r.approval_number, []);
      byApproval.get(r.approval_number).push(r);
    }
    for (const rows of byApproval.values()) {
      if (rows.length < 2) continue;
      const active = rows.some((r) => !r.cancelled && (r.merchant || '').includes(token));
      if (!active) continue;
      for (const r of rows) {
        if (!r.cancelled && !(r.merchant || '').includes(token)) r.cancelled = true;
      }
    }
    return records;
  },
};

module.exports = { TRANSFORMS, PREDICATES, DERIVES, POSTS, evalRowRules, cell, firstInt, amountOf };
