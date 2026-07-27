const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const INIT = fs.readFileSync(path.join(ROOT, 'client/public/theme-init.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'client/index.html'), 'utf8');
const THEME = fs.readFileSync(path.join(ROOT, 'client/src/lib/theme.js'), 'utf8');

// 주석에 'import' 같은 단어가 적혀 있다고 모듈인 건 아니다.
// 문법 검사는 주석을 걷어낸 코드에서만 해야 한다.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

describe('theme-init.js bootstrap script', () => {
  test('INIT content checks', () => {
    // A.1: `'ft.theme'` 문자열을 포함한다
    assert.ok(INIT.includes("'ft.theme'"), "INIT should contain 'ft.theme'");

    // A.2: `data-theme` 속성을 `'dark'` 로 설정하는 코드를 포함한다
    assert.ok(INIT.includes("setAttribute('data-theme', 'dark')"), "INIT should set data-theme to 'dark'");

    // A.3: `try` 와 `catch` 를 포함한다
    assert.ok(INIT.includes('try {'), "INIT should have try block");
    assert.ok(INIT.includes('catch'), "INIT should have catch block");

    // A.4: 모듈 문법이 없다 (주석 안의 단어는 제외 — 이 파일 주석에 'import' 가 나온다)
    const code = stripComments(INIT);
    assert.ok(!/\bexport\b/.test(code), 'INIT should not contain export statements');
    assert.ok(!/\bimport\b/.test(code), 'INIT should not contain import statements');
  });

  test('theme key consistency', () => {
    // B.1: 키 추출에 성공한다
    const m = THEME.match(/const\s+KEY\s*=\s*'([^']+)'/);
    assert.ok(m !== null, "Should extract KEY from theme.js");

    // B.2: INIT 이 그 키를 포함한다
    assert.ok(INIT.includes(m[1]), "INIT should contain the theme key from theme.js");
  });

  test('index.html reference checks', () => {
    // C.1: `<script src="/theme-init.js">` 를 참조한다
    assert.ok(HTML.includes('<script src="/theme-init.js">'), "HTML should reference theme-init.js");

    // C.2: 그 스크립트 태그에 `defer`·`async`·`type` 속성이 없다
    const tag = HTML.match(/<script[^>]*src="\/theme-init\.js"[^>]*>/)[0];
    assert.ok(!tag.includes('defer'), "script tag should not have defer attribute");
    assert.ok(!tag.includes('async'), "script tag should not have async attribute");
    assert.ok(!tag.includes('type='), "script tag should not have type attribute");

    // C.3: `</head>` 보다 앞에 있다
    const headEnd = HTML.indexOf('</head>');
    const scriptStart = HTML.indexOf('<script src="/theme-init.js">');
    assert.ok(scriptStart < headEnd, "script should be before </head>");

    // C.4: `<body` 보다 앞에 있다
    const bodyStart = HTML.indexOf('<body');
    assert.ok(scriptStart < bodyStart, "script should be before <body");

    // C.5: 인라인 부트스트랩이 남아 있지 않다
    assert.ok(!HTML.includes("localStorage.getItem"), "HTML should not contain inline bootstrap code");
  });
});
