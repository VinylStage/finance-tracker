'use strict';

// 문서가 코드보다 뒤처지면 CI 가 막는다(#496).
//
// 왜 검사인가
// ──────────
// 2026-08-06 문서 감사 실측. 사람이 기억해서 갱신하는 문서는 예외 없이 낡았고,
// CI 가 강제하는 문서만 안 낡았다.
//
//   docs/ARCHITECTURE.md 인벤토리  CI 강제        드리프트 0
//   docs/API.md                    강제 없음      마운트 26개 중 7개 미문서화
//   docs/DATA_MODEL.md             강제 없음      실테이블 22개 중 3개 누락
//
// #33(2026-07-23)이 같은 문제에 PR 체크리스트로 대응했고 또 낡았다. CONTRIBUTING
// 의 릴리즈 체크리스트에도 "API.md·DATA_MODEL.md 가 코드와 맞는가" 가 있었지만
// 사람이 보는 항목이라 지켜지지 않았다. 세 번째로 같은 방식을 쓰지 않는다.
//
// 왜 생성이 아니라 검사인가
// ────────────────────────
// `gen-inventory.js` 는 목록을 **생성**해 ARCHITECTURE.md 에 박는다. 목록이
// 곧 내용이라 그게 맞다.
//
// 여기는 다르다. API.md 는 엔드포인트마다 요청·응답·예시를 적는 문서이고,
// DATA_MODEL.md 는 컬럼과 관계를 설명하는 문서다. 본문을 코드에서 만들어 낼 수
// 없다. 만들 수 있는 척하면 "자동 생성됨" 이라는 표시만 붙은 빈 껍데기가 된다.
//
// 그래서 **존재 여부만** 본다 — 마운트된 라우트에 절이 있는가, 만들어지는 표가
// 문서에 나오는가. 내용의 정확성은 사람이 본다. 다만 통째로 빠지는 것은 막는다.
// 실제로 난 구멍 10개가 전부 "통째로 빠짐" 이었다.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const problems = [];

// ─────────────────────────────────────────────────────────────────────────
// docs/API.md — 마운트된 라우트마다 절이 있는가
// ─────────────────────────────────────────────────────────────────────────

// gen-inventory.js 와 같은 정규식을 쓴다. 한쪽만 고치면 두 검사가 갈리므로
// 마운트 표기를 바꿀 때는 양쪽을 함께 본다.
function apiMounts() {
  const content = fs.readFileSync(path.join(ROOT, 'src/server.js'), 'utf8');
  const re = /app\.use\('(\/api\/[a-z-]+)',\s*require\('\.\/routes\/([a-zA-Z]+)'\)\)/g;
  return [...content.matchAll(re)]
    .map((m) => ({ mount: m[1], file: `${m[2]}.js` }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

function checkApi() {
  const target = 'docs/API.md';
  const doc = fs.readFileSync(path.join(ROOT, target), 'utf8');

  // 절 제목은 라우트 파일명으로 연다: `## transactions.js`.
  // 뒤에 설명이 붙는 것도 있다: `## recurringRules.js — #278~#280 에서 늘어난 것`.
  const headings = doc
    .split('\n')
    .filter((l) => l.startsWith('## '))
    .map((l) => l.slice(3).trim());

  const missing = apiMounts().filter(({ file }) =>
    !headings.some((h) => h === file || h.startsWith(`${file} `)));

  if (missing.length) {
    problems.push({
      target,
      title: `마운트된 라우트 ${missing.length}개에 문서 절이 없다`,
      items: missing.map(({ mount, file }) => `${mount}  (src/routes/${file})`),
      fix: `${target} 에 \`## <파일명>\` 절을 열고 엔드포인트마다 \`### <METHOD> <경로>\` 를 적는다.`,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// docs/DATA_MODEL.md — 만들어지는 표마다 언급이 있는가
// ─────────────────────────────────────────────────────────────────────────

// 문서에 실릴 필요가 없는 표. 규칙을 코드에 적어 둔다 — 예외를 늘릴 때
// 여기 이유를 함께 남기지 않으면 다음 사람이 왜 빠졌는지 알 수 없다.
const TABLE_EXCLUDE = [
  // 감사 트리거가 세션 값을 넘기는 데 쓰는 내부 표. 사용자 데이터가 아니다.
  { re: /^_/, why: '언더스코어로 시작하는 내부 표' },
  // 마이그레이션이 표를 재작성할 때 쓰는 임시 표. 끝나면 사라진다.
  { re: /_new$/, why: '마이그레이션 임시 표' },
];

function listJs(dir) {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(dir, f));
}

function createdTables() {
  // src/db 는 디렉터리째 훑는다. init.js 만 보면 migrate.js 가 만드는
  // schema_migrations 를 놓친다 — 실제로 처음에 그렇게 짰다가 앞선 실측(3건)과
  // 결과가 안 맞아(2건) 발견했다. 표를 만드는 자리는 늘어날 수 있으므로
  // 파일을 나열하지 않는다.
  const files = [
    ...listJs(path.join(ROOT, 'src/db')),
    ...listJs(path.join(ROOT, 'migrations')),
  ];

  const found = new Set();
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?([a-zA-Z_][a-zA-Z0-9_]*)/gi;
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    for (const m of content.matchAll(re)) found.add(m[1]);
  }

  return [...found]
    .filter((t) => !TABLE_EXCLUDE.some(({ re: x }) => x.test(t)))
    .sort();
}

function checkDataModel() {
  const target = 'docs/DATA_MODEL.md';
  const doc = fs.readFileSync(path.join(ROOT, target), 'utf8');

  const missing = createdTables().filter((t) => !doc.includes(t));

  if (missing.length) {
    problems.push({
      target,
      title: `만들어지는 표 ${missing.length}개가 문서에 없다`,
      items: missing,
      fix: `${target} 에 그 표의 용도와 컬럼을 적는다. 문서에 실릴 표가 아니면 scripts/check-docs.js 의 TABLE_EXCLUDE 에 이유와 함께 더한다.`,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// docs/GUIDE.md — 지금은 검사하지 않는다. 왜인지 적어 둔다.
// ─────────────────────────────────────────────────────────────────────────
//
// GUIDE.md 는 사용자용 산문이라 코드에서 만들 수 없다. 대신 **화면마다 설명이
// 있는가** 는 기계적으로 볼 수 있고, 그게 이 문서에 맞는 검사다.
//
// 그런데 지금 켜면 CI 가 곧바로 빨간불이 된다. 2026-08-06 실측으로 화면 12개 중
// 11개가 GUIDE.md 에 없다(문서 최종 갱신 2026-07-24). 켜는 순간 통과시키려고
// 급하게 쓴 한 줄짜리 설명이 화면마다 들어가는데, 그건 문서가 아니라 검사를
// 통과하기 위한 장식이다.
//
// **그래서 검사는 #490(GUIDE.md 내용 갱신)과 함께 켠다.** 내용이 먼저다.
// #490 이 끝나면 여기에 checkGuide() 를 더하고 ci.yml 은 그대로 두면 된다 —
// 이 파일이 이미 배선돼 있다.
//
// 안 켜기로 한 것이 아니라 **순서를 정한 것**이다. 이 주석이 그 판단의 기록이다.

function main() {
  checkApi();
  checkDataModel();

  if (!problems.length) {
    console.log('✔ 문서가 코드와 맞다 (API.md 절 · DATA_MODEL.md 표)');
    return 0;
  }

  for (const p of problems) {
    console.error(`\n✖ ${p.target}: ${p.title}`);
    for (const item of p.items) console.error(`    ${item}`);
    console.error(`  → ${p.fix}`);
  }
  console.error('\n검사하는 것은 **존재 여부**다. 내용이 맞는지는 사람이 본다.');
  return 1;
}

process.exit(main());
