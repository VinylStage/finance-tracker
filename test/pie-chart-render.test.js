'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// #237 — recharts <Pie> 는 애니메이션이 켜져 있으면 조각을 그리지 않는다.
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 컴포넌트 테스트가 아니라 소스 스캔인가
//
// jsdom 에는 레이아웃이 없어서 ResponsiveContainer 가 0×0 으로 잡히고, 그러면
// recharts 는 애니메이션 여부와 무관하게 조각을 안 그린다. 즉 vitest 로는
// 고친 상태와 깨진 상태가 똑같이 보인다 — 통과해도 아무것도 보장하지 못한다.
// 실측 근거는 브라우저에서 확보했고(아래), 여기서는 그 결론이 코드에서
// 지워지지 않게 잠그는 것만 한다. 이 테스트는 "결함이 없다" 를 증명하지 않고
// "결함을 막던 조치가 사라졌다" 만 잡는다.
//
// 브라우저 실측 (recharts 3.10.1 / React 19.2.7, dev·prod 빌드 동일):
//   isAnimationActive 기본값(true) → .recharts-pie-sector 는 데이터 수만큼
//   생기지만 그 안의 .recharts-shape 가 비어 svg path 가 0개. 2초 대기·resize
//   재렌더로도 0개.
//   isAnimationActive={false}     → 조각이 즉시 그려짐(path 6개).
//
// prefers-reduced-motion 과 무관하고(matchMedia false 에서 재현), 같은 화면의
// Bar/Line/Area 는 애니메이션이 정상이다. Pie 한정 문제다.
// ─────────────────────────────────────────────────────────────────────────

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'client/src');

function jsxFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsxFiles(full));
    else if (entry.name.endsWith('.jsx') && !entry.name.endsWith('.test.jsx')) out.push(full);
  }
  return out;
}

// 주석에 <Pie> 라고 적혀 있다고 그게 엘리먼트인 건 아니다. 이 파일이 잠그는
// 대상 자체를 설명하는 주석에 <Pie> 가 나오므로, 걷어내지 않으면 속성 없는
// 가짜 태그를 집어 항상 실패한다. (theme-init.test.js 가 같은 이유로 주석을 턴다)
function stripJsxComments(src) {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')  // {/* ... */}
    .replace(/\/\*[\s\S]*?\*\//g, '')            // /* ... */
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

// <Pie ...> 여는 태그 하나를 통째로 집는다. 속성이 여러 줄에 걸쳐 있어도
// 한 덩어리로 봐야 isAnimationActive 가 그 태그의 것인지 알 수 있다.
function pieOpenTags(src) {
  const code = stripJsxComments(src);
  const tags = [];
  const re = /<Pie\b/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const end = code.indexOf('>', m.index);
    if (end !== -1) tags.push(code.slice(m.index, end + 1));
  }
  return tags;
}

const FILES = jsxFiles(SRC);
const WITH_PIE = FILES
  .map((f) => ({ file: path.relative(ROOT, f), src: fs.readFileSync(f, 'utf8') }))
  .filter((x) => /<Pie\b/.test(stripJsxComments(x.src)));

describe('#237 파이 차트가 조각을 그리는 조건', () => {
  test('A-1. <Pie> 를 쓰는 파일이 실제로 있다', () => {
    // 이 테스트가 대상 없이 조용히 통과하는 일을 막는다. Pie 를 아예 걷어냈다면
    // 이 파일도 같이 지워야 한다.
    assert.ok(WITH_PIE.length > 0, '<Pie> 사용처가 없다. 이 회귀 테스트가 무의미해졌으니 정리할 것');
  });

  test('A-2. 모든 <Pie> 가 isAnimationActive={false} 를 명시한다', () => {
    for (const { file, src } of WITH_PIE) {
      const tags = pieOpenTags(src);
      assert.ok(tags.length > 0, `${file}: <Pie> 여는 태그를 못 찾았다`);
      for (const tag of tags) {
        assert.ok(
          /isAnimationActive\s*=\s*\{\s*false\s*\}/.test(tag),
          `${file}: <Pie> 에 isAnimationActive={false} 가 없다. `
          + '기본값(true)이면 조각 <path> 가 생성되지 않아 차트가 빈 채로 남는다(#237). '
          + '지우려면 먼저 실브라우저에서 조각이 그려지는지 확인할 것 — jsdom 은 못 잡는다.'
        );
      }
    }
  });

  test('A-3. 이유가 코드에 남아 있다', () => {
    // 근거 없는 플래그는 다음 사람이 "불필요해 보인다" 며 지운다. 실제로 이
    // 저장소에서 그런 식으로 되돌아온 결함이 있었다.
    for (const { file, src } of WITH_PIE) {
      assert.ok(
        src.includes('#237'),
        `${file}: isAnimationActive={false} 의 근거(#237)가 주석에 없다`
      );
    }
  });
});

describe('B. 파이 뷰가 렌더할 데이터의 형태', () => {
  const CHART_LIB = fs.readFileSync(path.join(SRC, 'lib/categoryChart.js'), 'utf8');

  test('B-1. dataKey 로 쓰는 total 을 숫자로 다룬다', () => {
    // 문자열이면 recharts 의 각도 계산이 NaN 이 되어 애니메이션과 무관하게
    // 조각이 사라진다. #237 조사 시점의 유력 가설이었고 지금은 해소된 상태다
    // (서버가 숫자로 내려준다, #211). 되돌아가지 않게 잠근다.
    assert.ok(
      /Number\(/.test(CHART_LIB),
      'categoryChart.js 가 total 을 Number() 로 정규화하지 않는다'
    );
  });
});
