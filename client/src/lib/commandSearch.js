import { NAV_GROUPS } from './nav';

// 메뉴·화면 검색(#281 1단계).
//
// ─────────────────────────────────────────────────────────────────────────
// 검색 대상은 NAV_GROUPS 에서 **파생**한다
//
// 별도 목록을 두면 화면이 늘 때마다 두 곳을 고쳐야 하고, 반드시 한쪽이 빠진다.
// 그러면 "검색해도 안 나오는 화면" 이 생기는데, 사용자는 그 화면이 없다고
// 판단한다 — 검색을 붙여서 오히려 발견성이 나빠진다.
//
// nav.js 가 이미 그룹·하위 경로를 정본으로 갖고 있으므로 여기서 펼치기만 한다.
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 초성 검색인가
//
// 한글은 조합 중간 상태가 있다. '부채' 를 치려면 ㅂ → 부 → 붖 → 부채 를 거치고,
// 그 사이 '붖' 같은 글자로는 아무것도 안 잡힌다. 초성만으로 잡아 주면 두 글자
// 치기 전에 결과가 뜬다.
//
// 라이브러리를 쓰지 않는다. 유니코드 한글 음절은 (초성 × 21 × 28) 규칙으로
// 배열돼 있어 나눗셈 한 번이면 초성이 나온다.
// ─────────────────────────────────────────────────────────────────────────

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const JUNG_JONG = 21 * 28;

// 유니코드 음절 배열 순서 그대로. 순서를 바꾸면 초성 계산이 어긋난다.
const CHOSEONG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

// 겹자음을 홑자음으로 접는다. 사용자는 'ㅃ' 을 치려고 시프트를 누르지 않는다.
const FOLD = { ㄲ: 'ㄱ', ㄸ: 'ㄷ', ㅃ: 'ㅂ', ㅆ: 'ㅅ', ㅉ: 'ㅈ' };

function fold(ch) {
  return FOLD[ch] || ch;
}

/** 문자열의 초성만 뽑는다. 한글이 아닌 글자는 그대로 둔다. */
export function initials(text) {
  let out = '';
  for (const ch of String(text || '')) {
    const code = ch.codePointAt(0);
    if (code >= HANGUL_BASE && code <= HANGUL_LAST) {
      out += CHOSEONG[Math.floor((code - HANGUL_BASE) / JUNG_JONG)];
    } else {
      out += ch;
    }
  }
  return out;
}

/** 질의가 전부 자음(또는 공백)인가 — 초성 검색으로 볼지 판정한다. */
export function isChoseongQuery(q) {
  const s = String(q || '').replace(/\s+/g, '');
  return s.length > 0 && [...s].every((ch) => CHOSEONG.includes(fold(ch)));
}

function normalize(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, '');
}

/**
 * 검색 대상 목록. NAV_GROUPS 를 펼쳐서 만든다.
 *
 * 하위 화면은 부모 그룹 이름을 함께 들고 다닌다 — '할부' 하나만 보여주면
 * 어디에 있는 화면인지 알 수 없다.
 */
export function commandTargets() {
  const out = [];
  for (const g of NAV_GROUPS) {
    out.push({ id: g.id, label: g.label, path: g.path, group: null, icon: g.icon });
    for (const c of g.children || []) {
      out.push({
        id: `${g.id}:${c.path}`,
        label: c.label,
        path: c.path,
        group: g.label,
        icon: g.icon,
      });
    }
  }
  return out;
}

/**
 * 질의로 걸러 점수순으로 돌려준다.
 *
 * 점수는 셋뿐이다. 더 잘게 나눠도 12개 목적지에서는 체감되지 않고,
 * 규칙이 복잡할수록 "왜 이게 위에 있지" 를 설명하기 어려워진다.
 *   3 이름이 질의로 시작
 *   2 이름에 포함
 *   1 초성이 맞음
 */
export function searchCommands(query, targets = commandTargets()) {
  const q = normalize(query);
  if (!q) return targets;

  const choseong = isChoseongQuery(query);

  return targets
    .map((t) => {
      const label = normalize(t.label);
      if (label.startsWith(q)) return { ...t, score: 3 };
      if (label.includes(q)) return { ...t, score: 2 };

      // 초성은 자음만 친 경우에만 본다. '부' 같은 완성 글자까지 초성으로
      // 견주면 'ㅂ' 질의가 아닌데도 엉뚱한 항목이 걸린다.
      if (choseong) {
        const ini = normalize([...initials(t.label)].map(fold).join(''));
        const qi = normalize([...q].map(fold).join(''));
        if (ini.startsWith(qi)) return { ...t, score: 1 };
      }
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'ko'));
}
