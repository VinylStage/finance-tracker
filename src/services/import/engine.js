'use strict';

// 설정(프로파일) 기반 공통 임포트 엔진 (설계 §16 Phase0).
// 카드사별 파서 함수 대신, 프로파일 데이터 1개 + 공통 변환으로 정규화 레코드를 만든다.
// is_overseas 판정은 디스패처 한 곳(#710/ADR0010)에서 — cardOverseas 를 그대로 재사용.

const XLSX = require('xlsx');
const { looksOverseas } = require('../cardOverseas');
const { UserInputError } = require('../../utils/errors');
const { TRANSFORMS, PREDICATES, evalRowStop, cell } = require('./transforms');

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
function resolveStartRow(data, header) {
  if (!header || header.detect === 'fixed') return header ? header.start : 0;
  if (header.detect === 'token_row') {
    for (let r = 0; r < Math.min(data.length, header.scan || 12); r++) {
      const vals = (data[r] || []).map((c) => String(c == null ? '' : c).trim());
      if (header.tokens.every((t) => vals.includes(t))) return r + 1;
    }
    throw new UserInputError('명세서/이용내역의 열 제목을 찾지 못했습니다. 올바른 원본 파일인지 확인해 주세요.');
  }
  return 0;
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

  const start = resolveStartRow(data, profile.header || { detect: 'fixed', start: (profile.rows && profile.rows.start) || 0 });
  const stopRule = profile.rows && profile.rows.stop;
  const cols = profile.columns || {};
  const tfs = profile.transforms || {};

  const out = [];
  for (let i = start; i < data.length; i++) {
    const row = data[i] || [];
    const verdict = evalRowStop(row, stopRule);
    if (verdict === 'break') break;
    if (verdict === 'skip') continue;

    const rec = {
      date: null, merchant: null, amount: null,
      is_installment: false, installment_months: null,
      cancelled: false, approval_number: null,
    };
    for (const [logical, colIdx] of Object.entries(cols)) {
      const key = FIELD_MAP[logical];
      if (!key) continue; // cancelled_raw 등 비매핑 열은 predicate 가 직접 읽는다
      rec[key] = applyTransform(tfs[logical], row[colIdx], row);
    }
    if (profile.cancelled) {
      const pred = PREDICATES[profile.cancelled.fn];
      if (!pred) throw new Error(`Unknown predicate: ${profile.cancelled.fn}`);
      rec.cancelled = pred(row, profile.cancelled);
    }
    // 메타(정규화 스키마 §2) — 회귀 비교는 코어 필드만 보므로 부가정보는 자유.
    rec.settlement_status = (profile.settlement_default) || 'confirmed';
    rec.source_type = profile.source_type || null;
    out.push(rec);
  }

  // is_overseas: 디스패처 한 곳에서(빠뜨릴 수 없게). 기존 파서와 동일.
  return out.map((r) => ({ ...r, is_overseas: looksOverseas(r.merchant) }));
}

module.exports = { run };
