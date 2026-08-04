'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// node_modules 가 저장소에 커밋되는 사고를 막는다.
//
// ─────────────────────────────────────────────────────────────────────────
// 왜 .gitignore 에 있는데도 들어갔나
//
// `.gitignore` 의 `client/node_modules/` 는 트레일링 슬래시 때문에 **디렉터리만**
// 매칭한다. 심링크는 디렉터리가 아니라서 그대로 통과한다.
//
// 이 저장소는 세션마다 워크트리를 따로 쓰고 node_modules 를 심링크로 공유한다
// (설치 시간·디스크). 그래서 이 구멍이 실제로 두 번 뚫렸다 — #287, 그리고 #345.
//
// 커밋되면 무슨 일이 생기나: 심링크 값이 커밋한 사람 머신의 절대경로다. 다른
// 환경에서는 깨진 링크가 되고, `core.symlinks=false` 인 체크아웃에서는 아예
// **경로 문자열이 담긴 59바이트 일반 파일**로 떨어진다. 그 상태에서
// `npx vite` 는 로컬 설치를 못 찾고 네트워크에서 받으려 든다.
// ─────────────────────────────────────────────────────────────────────────

const ROOT = path.join(__dirname, '..');
const GITIGNORE = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');

function rules(src) {
  return src
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

describe('A. .gitignore 규칙', () => {
  test('A-1. node_modules 규칙이 존재한다', () => {
    const found = rules(GITIGNORE).filter((r) => r.replace(/\/$/, '').endsWith('node_modules'));
    assert.ok(found.length > 0, 'node_modules 무시 규칙이 아예 없다');
  });

  test('A-2. node_modules 규칙에 트레일링 슬래시가 없다', () => {
    // 슬래시가 붙으면 디렉터리만 잡고 심링크는 통과한다. 이 저장소는 심링크로
    // 공유하므로 슬래시가 곧 구멍이다.
    const bad = rules(GITIGNORE).filter((r) => /node_modules\/$/.test(r));
    assert.deepStrictEqual(
      bad, [],
      `트레일링 슬래시가 붙은 node_modules 규칙: ${bad.join(', ')} — `
      + '슬래시를 떼야 심링크까지 잡힌다'
    );
  });

  test('A-3. 루트와 client 양쪽이 덮인다', () => {
    const rs = rules(GITIGNORE);
    // 루트 `node_modules` 는 앵커가 없으므로 모든 깊이에 적용된다. 다만
    // client 쪽을 명시해 둔 기존 의도를 유지한다.
    assert.ok(rs.includes('node_modules'), '루트 node_modules 규칙이 없다');
    assert.ok(rs.includes('client/node_modules'), 'client/node_modules 규칙이 없다');
  });
});

describe('B. 실제 인덱스 상태', () => {
  // 규칙이 맞아도 이미 트래킹 중이면 .gitignore 는 아무 일도 하지 않는다.
  // 진짜 불변식은 "인덱스에 node_modules 경로가 없다" 쪽이다.
  const ls = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
  const available = ls.status === 0;

  test('B-1. 추적 중인 경로에 node_modules 가 없다', { skip: available ? false : 'git 저장소가 아니거나 git 을 쓸 수 없다' }, () => {
    const tracked = ls.stdout.split('\0').filter(Boolean);
    const offenders = tracked.filter((f) => f.split('/').includes('node_modules'));
    assert.deepStrictEqual(
      offenders, [],
      `node_modules 가 추적되고 있다: ${offenders.slice(0, 5).join(', ')} — `
      + 'git rm --cached 로 인덱스에서 빼야 한다'
    );
  });
});
