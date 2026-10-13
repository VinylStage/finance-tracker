'use strict';

// 임포트 프로파일(데이터)의 최소 검증. 기동 시 모든 프로파일을 이걸로 통과시켜,
// 잘못된 변환/술어 이름이 런타임까지 숨지 않게 한다(설계 D1/D3).

const { TRANSFORMS, PREDICATES, DERIVES, POSTS } = require('./transforms');

const SOURCE_TYPES = new Set(['usage_history', 'billing_statement']);

function validate(profile) {
  const errors = [];
  const req = ['format_id', 'issuer', 'source_type', 'sheet'];
  for (const k of req) if (profile[k] == null) errors.push(`필수 필드 누락: ${k}`);

  if (profile.source_type && !SOURCE_TYPES.has(profile.source_type)) {
    errors.push(`source_type 는 usage_history|billing_statement 중 하나: ${profile.source_type}`);
  }
  for (const [logical, spec] of Object.entries(profile.transforms || {})) {
    if (!TRANSFORMS[spec.fn]) errors.push(`알 수 없는 transform: ${spec.fn} (${logical})`);
  }
  if (profile.cancelled && !PREDICATES[profile.cancelled.fn]) {
    errors.push(`알 수 없는 predicate: ${profile.cancelled.fn}`);
  }
  for (const d of (profile.derive || [])) {
    if (!DERIVES[d.fn]) errors.push(`알 수 없는 derive: ${d.fn}`);
  }
  for (const p of (profile.post || [])) {
    const fn = typeof p === 'object' ? p.fn : p;
    if (!POSTS[fn]) errors.push(`알 수 없는 post: ${fn}`);
  }
  for (const rule of ((profile.rows && profile.rows.rules) || [])) {
    if (!['col_empty', 'col_not_match', 'col_contains', 'col_eq'].includes(rule.when)) {
      errors.push(`알 수 없는 row rule.when: ${rule.when}`);
    }
    if (rule.action && !['break', 'skip'].includes(rule.action)) {
      errors.push(`row rule.action 은 break|skip: ${rule.action}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

module.exports = { validate };
