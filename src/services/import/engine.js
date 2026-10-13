'use strict';

// 설정(프로파일) 기반 공통 임포트 엔진 (설계 §16 Phase0).
// 카드사별 파서 함수 대신, 프로파일 데이터 1개 + 공통 규칙으로 정규화 레코드를 만든다.
// is_overseas 판정은 디스패처 한 곳(#710/ADR0010)에서 — cardOverseas 를 그대로 재사용.

const XLSX = require('xlsx');
const { looksOverseas } = require('../cardOverseas');
const { UserInputError } = require('../../utils/errors');
const { TRANSFORMS, PREDICATES, DERIVES, POSTS, evalRowRules } = require('./transforms');

// logical 컬럼명 → 정규화 레코드 키
const FIELD_MAP = {
  date: 'date',
  merchant: 'merchant',
  amount: 'amount',
  installment_flag: 'is_installment',
  installment_months: 'installment_months',
  approval: 'approval_number',
};

function selectSheet(workbook, sel) {
  let name;
  if (!sel || sel.select === 'by_index') name = workbook.SheetNames[sel ? sel.index || 0 : 0];
  else if (sel.select === 'by_name') name = sel.name;
  const sheet = name ? workbook.Sheets[name] : undefined;
  if (!sheet) throw new UserInputError('엑셀에서 읽을 수 있는 시트를 찾지 못했습니다. 카드사에서 내려받은 원본 파일인지 확인해 주세요.');
  return sheet;
}

// 데이터 시작행: 고정(start) 또는 헤더 토큰 탐지(token_row).
function resolveStartRow(data, header, rows) {
  if (header && header.detect === 'token_row') {
    for (let r = 0; r < Math.min(data.length, header.scan || 12); r++) {
      const vals = (data[r] || []).map((c) => String(c == null ? '' : c).trim());
      if (header.tokens.every((t) => vals.includes(t))) return r + 1;
    }
    throw new UserInputError('명세서/이용내역의 열 제목을 찾지 못했습니다. 올바른 원본 파일인지 확인해 주세요.');
  }
  return (rows && rows.start) || (header && header.start) || 0;
}

function applyTransform(spec, rawCell, row) {
  if (!spec) return rawCell === undefined ? null : rawCell;
  const fn = TRANSFORMS[spec.fn];
  if (!fn) throw new Error(`Unknown transform: ${spec.fn}`);
  return fn(rawCell, { row, param: spec });
}

// 프로파일 + 버퍼 → 정규화 레코드 배열.
function run(profile, buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: true });
  const sheet = selectSheet(workbook, profile.sheet);
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

  const start = resolveStartRow(data, profile.header, profile.rows);
  const rowRules = profile.rows && profile.rows.rules;
  const cols = profile.columns || {};
  const tfs = profile.transforms || {};

  let out = [];
  for (let i = start; i < data.length; i++) {
    const row = data[i] || [];
    const verdict = evalRowRules(row, rowRules);
    if (verdict === 'break') break;
    if (verdict === 'skip') continue;

    const rec = {
      date: null, merchant: null, amount: null,
      is_installment: false, installment_months: null,
      cancelled: false, approval_number: null,
    };
    for (const [logical, colIdx] of Object.entries(cols)) {
      const key = FIELD_MAP[logical];
      if (!key) continue;
      rec[key] = applyTransform(tfs[logical], row[colIdx], row);
    }
    // 파생(한 셀 → 여러 필드, 예: 현대 가맹점+금액)
    for (const d of (profile.derive || [])) {
      const fn = DERIVES[d.fn];
      if (!fn) throw new Error(`Unknown derive: ${d.fn}`);
      fn(rec, row, d);
    }
    if (profile.is_installment_from_months) {
      rec.is_installment = rec.installment_months !== null;
    }
    if (profile.cancelled) {
      const pred = PREDICATES[profile.cancelled.fn];
      if (!pred) throw new Error(`Unknown predicate: ${profile.cancelled.fn}`);
      rec.cancelled = pred(row, profile.cancelled);
    }
    rec.settlement_status = profile.settlement_default || 'confirmed';
    rec.source_type = profile.source_type || null;
    out.push(rec);
  }

  // 후처리(레코드 배열 전체) — 예: 삼성 상쇄쌍 취소.
  for (const p of (profile.post || [])) {
    const fn = POSTS[p.fn || p];
    if (!fn) throw new Error(`Unknown post: ${p.fn || p}`);
    out = fn(out, typeof p === 'object' ? p : {});
  }

  // is_overseas: 디스패처 한 곳에서(빠뜨릴 수 없게). 기존 파서와 동일.
  return out.map((r) => ({ ...r, is_overseas: looksOverseas(r.merchant) }));
}

module.exports = { run };
